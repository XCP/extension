/**
 * The background owns approval execution. A popup submits a decision over a
 * review, never bytes, signer parameters, or an alleged signing outcome.
 */
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { getCoinLockStore } from '@/core/bitcoin/coinLockStore';
import {
  unshownEnvelopeWarning, unshownKeyLeafInputs, type WalletLeafKeys, walletLeafKeys, withEnvelopeLeafGuard,
} from '@/core/bitcoin/envelopeLeafGuard';
import { getFeeRates } from '@/core/bitcoin/feeRate';
import {
  findLockedCoinSpends,
  type LockCheckedItem,
  lockedCoinsToUnlock,
  lockedCoinWarning,
} from '@/core/bitcoin/lockedCoinSpends';
import { cancellationCoinReview } from '@/core/bitcoin/offerCancellation';
import { getPsbtApprovalPolicy, getPsbtBundleApprovalPolicy, getTransactionApprovalPolicy, type ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { extractPsbtDetails, type PsbtDetails, tapLeafOwnerAddress, validateSignInputs } from '@/core/bitcoin/psbt';
import { decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import { decodePsbtBundleForApproval } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { PrevoutMismatchError } from '@/core/bitcoin/psbtPrevouts';
import { decodeTransactionForApproval } from '@/core/bitcoin/transactionApprovalDecoder';
import { CONNECTION_PROOF_PREFIX } from '@/core/connectionProof';
import { isStoredRevealIntent } from '@/core/counterparty/commitRevealBundle';
import { offerCoinCommitments, type SignedOfferItem } from '@/core/counterparty/marketplace/offerCoinLocks';
import { maxMarketplaceBatchRequests } from '@/core/counterparty/marketplaceBatch';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
import { SigningError } from '@/core/errors';
import type { PairedGrant } from '@/core/pairedGrant';
import { ProviderReviewError, providerReviewCode, withProviderReviewCode } from '@/core/providerReviewErrors';
import { getConnectionRevokedCode, getIdentityMismatchCode, getMessagePermissionCode, getPsbtPermissionCode, supportsPairedContinuity } from '@/core/requestIdentity';
import { getPairedAddressFormats } from '@/core/wallet/addressDeriver';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import type { SigningIdentity } from '@/platform/auth/signingIdentity';
import { getTrustedBroadcastPrevout } from '@/platform/provider/recentBroadcasts';
import { beginSignFinalization, claimSignFlow, failSignFinalization, fingerprintReview, getSignFlow, getSignFlowEventPrefix, type ProviderSigningRequest, recordSignOutcome, type SignFlowResult, type SignPsbtsRequest, } from '@/platform/provider/signFlow';
import { bundleSpendsItsParent, packageParentOf, signAttachAndListingForDelivery, signFundAndAuthorizationsForDelivery, signPsbtPhaseForDelivery } from '@/platform/provider/signPsbtPhase';
import { defineProxyServer } from '@/platform/proxy/server';
import { getConnectionService } from '@/services/connectionService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { PROVIDER_SIGNING_SERVICE_NAME, PROVIDER_SIGNING_SERVICE_POLICY, type ProviderSigningReview, type ReviewBase } from '@/services/providerSigningServiceClient';
import { assertSignDeliveryAuthorized, needsPairedAddressGrant } from '@/services/signDelivery';
import { getWalletService } from '@/services/walletService';
import type { CoinLock, OfferCoinCommitment } from '@/types/coinLocks';

export interface SigningDecision {
  /** Identifies the facts the user actually reviewed, including the execution policy. */
  reviewKey: string;
  /** True only from the existing second confirmation step on transaction approvals. */
  risksAcknowledged: boolean;
}

export interface ProviderSigningService {
  getRequest(requestId: string): Promise<ProviderSigningRequest | null>;
  getReview(requestId: string): Promise<ProviderSigningReview>;
  approveAndSign(requestId: string, decision: SigningDecision): Promise<void>;
  reject(requestId: string): Promise<void>;
}

/** Parsed PSBT structure by PSBT hex, shared by the authorization checks of one signing flow. */
type PsbtDetailsCache = Map<string, PsbtDetails>;

function parsedDetails(parsed: PsbtDetailsCache, psbtHex: string): PsbtDetails {
  let details = parsed.get(psbtHex);
  if (!details) {
    details = extractPsbtDetails(psbtHex);
    parsed.set(psbtHex, details);
  }
  return details;
}

/** A signer failure caused by the site's transaction bytes, not by the wallet or the network. */
function isTransactionDataMismatch(error: unknown): error is Error {
  return !providerReviewCode(error)
    && (error instanceof PrevoutMismatchError || error instanceof SigningError);
}

/**
 * Explain locked inputs using the same snapshot bound to the review.
 */
function lockedCoinSpendWarning(origin: string, items: LockCheckedItem[], locks: CoinLock[]): SecurityWarning | null {
  return locks.length ? lockedCoinWarning(findLockedCoinSpends(items, locks, origin)) : null;
}

/** The warnings a review carries, wherever its kind keeps them. */
function reviewWarnings(review: ProviderSigningReview): SecurityWarning[] {
  switch (review.kind) {
    case 'sign-message': return [];
    case 'sign-transaction':
    case 'sign-psbt': return review.decodedInfo.safety.warnings;
    case 'sign-psbts': return review.decodedInfo.policyWarnings ?? [];
  }
}

/**
 * The user confirmed a review that spends locked coins, and confirming is the unlock, applied once
 * the signature is made and before the site receives it. Best effort: a failed write leaves a lock
 * the spend will remove once it confirms, and must not stand between the user and a signature they
 * confirmed.
 */
async function unlockConfirmedCoins(review: ProviderSigningReview): Promise<void> {
  const store = getCoinLockStore();
  if (!store) return;
  for (const [address, outpoints] of lockedCoinsToUnlock(reviewWarnings(review))) {
    try {
      await store.update(address, { unlock: outpoints });
    } catch (error) {
      console.warn('[ProviderSigning] Could not unlock confirmed coins:', error);
    }
  }
}

/**
 * Persist the proved offer commitments before exposing the signature. Failure withholds it.
 */
async function lockCommittedCoins(review: ProviderSigningReview, ownedAddresses: string[]): Promise<void> {
  const store = getCoinLockStore();
  if (!store?.commit) return;
  const items: SignedOfferItem[] = review.kind === 'sign-psbt'
    ? [{
        intent: review.request.marketplaceIntent,
        transactionId: review.decodedInfo.psbtDetails.transactionId,
        inputs: review.decodedInfo.psbtDetails.inputs,
        outputs: review.decodedInfo.psbtDetails.outputs,
        signInputs: review.request.signInputs ?? {},
        review: review.decodedInfo.marketplaceReview,
      }]
    : review.kind === 'sign-psbts'
      ? review.request.items.flatMap((item, index) => {
          const decoded = review.decodedInfo.items[index];
          return decoded ? [{
            intent: item.marketplaceIntent.standard === 'counterparty-marketplace' ? item.marketplaceIntent : undefined,
            transactionId: decoded.psbtDetails.transactionId,
            inputs: decoded.psbtDetails.inputs,
            outputs: decoded.psbtDetails.outputs,
            signInputs: item.signInputs,
            review: decoded.marketplaceReview,
          }] : [];
        })
      : [];
  const byAddress = new Map<string, OfferCoinCommitment[]>();
  for (const { address, commitment } of offerCoinCommitments(items, { origin: review.request.origin, ownedAddresses })) {
    byAddress.set(address, [...(byAddress.get(address) ?? []), commitment]);
  }
  for (const [address, commitments] of byAddress) await store.commit(address, commitments);
}

export function createProviderSigningService(): ProviderSigningService {
  // Coalesce concurrent clicks in the same worker. The persisted signing state
  // also prevents a different worker from replaying an interrupted command.
  const executing = new Map<string, Promise<void>>();

  function effectiveRequest(request: ProviderSigningRequest): ProviderSigningRequest {
    // Records from an earlier extension version may predate the explicit plan.
    // Derive it only from their immutable bytes and bound address.
    return request.kind === 'sign-psbt' && request.signInputs === undefined ? {
      ...request, signInputs: resolveProviderSignInputs(extractPsbtDetails(request.psbtHex), request.address,
        undefined, request.sighashTypes),
    } : request;
  }

  async function getRequest(requestId: string): Promise<ProviderSigningRequest | null> {
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 4096) {
      throw new ProviderReviewError('invalid_id');
    }
    const request = await getSignFlow(requestId);
    return request?.status === 'pending' ? effectiveRequest(request) : null;
  }

  /** The origin's current paired grant, when this kind of request may continue across the pair. */
  async function continuityGrant(request: ProviderSigningRequest): Promise<PairedGrant | undefined> {
    if (!supportsPairedContinuity(request.kind)) return undefined;
    return (await getWalletService().getSettings()).providerCapabilities?.[request.origin];
  }

  /**
   * @param onlyItem - Re-validate the structure of this one bundle item instead of every item. The
   *   per-signature re-check uses it: identity and permission are re-read in full each time, while
   *   the whole bundle's structure was already validated at the start of execution, so repeating
   *   it for every signature would cost the square of the bundle size (100 policy alternatives).
   */
  async function assertAuthorization(
    request: ProviderSigningRequest,
    onlyItem?: SignPsbtsRequest['items'][number],
    parsed: PsbtDetailsCache = new Map(),
  ): Promise<{
    ownedAddresses: string[];
    identity: SigningIdentity;
  }> {
    const wallet = getWalletService();
    if (!await wallet.isKeychainUnlocked()) throw new ProviderReviewError('wallet_locked');
    const activeAddress = await wallet.getActiveAddress();
    const activeWallet = await wallet.getActiveWallet();
    const identityError = getIdentityMismatchCode(request, activeAddress?.address, activeWallet?.id,
      await continuityGrant(request));
    if (identityError || !activeAddress) throw new ProviderReviewError(identityError ?? 'identity_changed');
    // Signers are judged against the address active now. After a switch to the paired sibling,
    // the request's own address is itself a paired signer and needs the paired grant.
    const current = activeAddress.address;
    const permissions = getConnectionService();
    const permissionError = request.kind === 'sign-message'
      ? await getMessagePermissionCode({ ...request, address: current,
        signingAddress: request.signingAddress ?? request.address }, permissions)
      : request.kind === 'sign-transaction'
        ? await getConnectionRevokedCode(request, permissions)
        : await getPsbtPermissionCode({ ...request, signInputs: request.kind === 'sign-psbts'
          ? Object.fromEntries(request.items.flatMap(item => Object.entries(item.signInputs)))
          : request.signInputs }, current, permissions);
    if (permissionError) throw new ProviderReviewError(permissionError);
    // The wallet binds signing to the identity active now, which the checks above just authorized.
    const identity = { walletId: request.walletId, address: current };

    // Repeat structural ownership validation using background wallet data. The
    // request is immutable, but grants and the selected identity are not.
    if (request.kind === 'sign-psbt' || request.kind === 'sign-psbts') {
      const paired = activeWallet?.type === 'mnemonic' && getPairedAddressFormats(activeWallet.addressFormat)
        ? await wallet.getPairedAddresses() : null;
      const allowed = [request.address, ...(paired ? [paired.legacy.address, paired.segwit.address] : [])];
      const items = request.kind === 'sign-psbt' ? [request] : onlyItem ? [onlyItem] : request.items;
      for (const item of items) {
        const details = parsedDetails(parsed, item.psbtHex);
        // A commit-and-reveal bundle's reveal spends an output no one owns yet, through a leaf
        // closed by the signer's key in whatever form Core chose; the bundle proof ties that key to
        // the signer, so here only the signer itself is checked.
        const reveal = request.kind === 'sign-psbts' && request.bundleKind === 'commit-and-reveal'
          && 'marketplaceIntent' in item && isStoredRevealIntent(item.marketplaceIntent);
        if (item.signInputs !== undefined) {
          const ownership = reveal
            ? validateSignInputs(item.signInputs, [request.address], details.inputs.length)
            : validateSignInputs(item.signInputs, allowed, details.inputs.length,
              details.inputs.map(input => tapLeafOwnerAddress(input) ?? input.address));
          if (!ownership.valid) throw new Error(ownership.error);
        }
        if (item.sighashTypes) {
          const indices = item.signInputs ? Object.values(item.signInputs).flat()
            : details.inputs.map(input => input.index);
          if (indices.some(index => item.sighashTypes?.[index] === undefined)) {
            throw new ProviderReviewError('missing_sighash');
          }
        }
      }
      return { ownedAddresses: allowed, identity };
    }
    if (request.kind === 'sign-message' && request.cancelOffersIntent) {
      const addresses = [request.address, request.signingAddress ?? request.address];
      if (activeWallet?.type === 'mnemonic' && getPairedAddressFormats(activeWallet.addressFormat)
        && await permissions.hasPairedAddressPermission(request.origin, request.walletId, current)) {
        const paired = await wallet.getPairedAddresses();
        addresses.push(paired.legacy.address, paired.segwit.address);
      }
      return { ownedAddresses: [...new Set(addresses.map(normalizeAddressForComparison))], identity };
    }
    return { ownedAddresses: [request.address], identity };
  }

  /**
   * Every key of the active wallet's addresses and its Legacy/SegWit pair, in the forms a tapleaf
   * can name them, for refusing script paths whose message the review does not show.
   */
  async function walletScriptKeys(): Promise<WalletLeafKeys> {
    const wallet = getWalletService();
    const activeWallet = await wallet.getActiveWallet();
    const paired = activeWallet?.type === 'mnemonic' && getPairedAddressFormats(activeWallet.addressFormat)
      ? await wallet.getPairedAddresses() : null;
    return walletLeafKeys([
      ...(activeWallet?.addresses ?? []),
      ...(paired ? [paired.legacy, paired.segwit] : []),
    ]);
  }

  /** The active mnemonic wallet's Legacy/SegWit pair when `address` is one of them, else none. */
  async function pairedSiblings(address: string): Promise<string[]> {
    try {
      const wallet = getWalletService();
      const activeWallet = await wallet.getActiveWallet();
      if (activeWallet?.type !== 'mnemonic' || !getPairedAddressFormats(activeWallet.addressFormat)) return [];
      const paired = await wallet.getPairedAddresses();
      const pair = [paired.legacy.address, paired.segwit.address];
      return pair.includes(address) ? pair : [];
    } catch {
      return [];
    }
  }

  async function getReview(requestId: string): Promise<ProviderSigningReview> {
    return buildReview(requestId, new Map());
  }

  async function buildReview(requestId: string, parsed: PsbtDetailsCache): Promise<ProviderSigningReview> {
    const request = await getRequest(requestId);
    if (!request) throw new ProviderReviewError('unavailable');
    const { ownedAddresses } = await assertAuthorization(request, undefined, parsed);
    const store = getCoinLockStore();
    const coinLocks = store ? (await Promise.all(ownedAddresses.map(address => store.read(address)))).flat() : [];
    const strictMode = (await getWalletService().getSettings()).strictTransactionVerification !== false;
    const fastestFee = request.kind === 'sign-message' ? undefined
      : await getFeeRates().then(rates => rates.fastestFee).catch(() => undefined);
    let review: Omit<ReviewBase, 'reviewKey'> & Record<string, unknown>;
    const ordinaryPolicy: ProviderApprovalPolicy = {
      blocked: false, requiresAcknowledgement: false, safeOwnChange: false,
    };
    switch (request.kind) {
      case 'sign-message':
        if (!request.message || typeof request.message !== 'string' || request.message.startsWith(CONNECTION_PROOF_PREFIX)) {
          throw new ProviderReviewError('invalid_message');
        }
        review = { kind: request.kind, request, policy: ordinaryPolicy };
        if (request.cancelOffersIntent) {
          const store = getCoinLockStore();
          const locks = store ? (await Promise.all(ownedAddresses.map(address => store.read(address)))).flat() : [];
          review.cancellationCoins = cancellationCoinReview(locks, request.origin, request.cancelOffersIntent);
        }
        break;
      case 'sign-transaction': {
        // The signer's paired sibling counts as this wallet's for saying where outputs go (an
        // attach to the SegWit sibling is not a payment to someone else). Display only: the raw
        // transaction is still signed by request.address alone.
        const decoded = await decodeTransactionForApproval(request.rawTxHex, request.address,
          getTrustedBroadcastPrevout, await pairedSiblings(request.address));
        // The raw transaction is signed for every input of request.address.
        const signed = decoded.inputs.flatMap((input, index) => input.address
          && normalizeAddressForComparison(input.address) === normalizeAddressForComparison(request.address) ? [index] : []);
        const lockWarning = lockedCoinSpendWarning(request.origin,
          [{ inputs: decoded.inputs, signInputs: { [request.address]: signed } }], coinLocks);
        const decodedInfo = lockWarning
          ? { ...decoded, safety: { ...decoded.safety, warnings: [...decoded.safety.warnings, lockWarning] } }
          : decoded;
        review = { kind: request.kind, request, decodedInfo, fastestFee,
          policy: getTransactionApprovalPolicy(request, decodedInfo, strictMode, fastestFee) };
        break;
      }
      case 'sign-psbt': {
        const signers = Object.keys(request.signInputs ?? {});
        const decoded = withEnvelopeLeafGuard(await decodePsbtForApproval(request.psbtHex,
          signers.length ? signers : [request.address], Object.values(request.signInputs ?? {}).flat(),
          request.sighashTypes, request.inscription, request.signingPurpose,
          request.bitcoinPaymentIntent, request.marketplaceIntent, ownedAddresses,
          { resolveTrustedPrevout: getTrustedBroadcastPrevout }),
        await walletScriptKeys());
        // Part of the analysis, so the execution policy below asks for the acknowledgement.
        const lockWarning = lockedCoinSpendWarning(request.origin, [{
          intent: request.marketplaceIntent, review: decoded.marketplaceReview,
          inputs: decoded.psbtDetails.inputs, signInputs: request.signInputs ?? {},
        }], coinLocks);
        const decodedInfo = lockWarning
          ? { ...decoded, safety: { ...decoded.safety, warnings: [...decoded.safety.warnings, lockWarning] } }
          : decoded;
        review = { kind: request.kind, request, decodedInfo, fastestFee,
          policy: getPsbtApprovalPolicy(request, decodedInfo, strictMode, fastestFee) };
        break;
      }
      case 'sign-psbts': {
        // The origin is the one the provider verified from the sender, never the site's words.
        const decoded = await decodePsbtBundleForApproval(
          request, ownedAddresses, undefined, { origin: request.origin },
        );
        // Every item gets the leaf check. An item decoded without a safety analysis (a proved
        // fee-bump child) has no warnings to carry the block, so the bundle takes it instead.
        const keys = await walletScriptKeys();
        const unanalyzedBlocks: SecurityWarning[] = [];
        const decodedInfo = {
          ...decoded,
          items: decoded.items.map((item, index) => {
            if ('safety' in item) return withEnvelopeLeafGuard(item, keys);
            // A proved commit-and-reveal's reveal publishes the message the commit's review shows:
            // its one envelope leaf on input 0 is shown, and nothing else is.
            const shown = item.shownEnvelopeLeaf?.toLowerCase();
            const inputs = unshownKeyLeafInputs(item.psbtDetails, keys).filter(index => !(
              shown !== undefined && index === 0 && item.psbtDetails.inputs.length === 1
              && item.psbtDetails.inputs[0]?.tapLeafScripts?.length === 1
              && item.psbtDetails.inputs[0].tapLeafScripts[0]!.toLowerCase() === shown));
            if (inputs.length > 0) {
              const warning = unshownEnvelopeWarning(inputs);
              unanalyzedBlocks.push({ ...warning, title: `Transaction ${index + 1}: ${warning.title}` });
            }
            return item;
          }),
        };
        const bundlePolicy = getPsbtBundleApprovalPolicy(request, decodedInfo, strictMode, fastestFee);
        // Stated once for the bundle, naming every locked coin its items would sign.
        const lockWarning = lockedCoinSpendWarning(request.origin, request.items.flatMap((item, index) => {
          const decodedItem = decodedInfo.items[index];
          return decodedItem ? [{
            intent: item.marketplaceIntent.standard === 'counterparty-marketplace' ? item.marketplaceIntent : undefined,
            review: decodedItem.marketplaceReview,
            inputs: decodedItem.psbtDetails.inputs, signInputs: item.signInputs,
          }] : [];
        }), coinLocks);
        const policy = {
          ...bundlePolicy.policy,
          ...(unanalyzedBlocks.length > 0 ? { blocked: true } : {}),
          ...(lockWarning ? { requiresAcknowledgement: true } : {}),
        };
        const warnings = [...unanalyzedBlocks, ...(lockWarning ? [lockWarning] : []), ...bundlePolicy.warnings];
        review = { kind: request.kind, request,
          decodedInfo: { ...decodedInfo, policyWarnings: warnings }, fastestFee, policy };
        break;
      }
    }
    if (coinLocks.length > 0) review.coinLocks = coinLocks;
    const pairedGrant = await continuityGrant(request);
    // Part of the facts fingerprinted into reviewKey below, intentionally: a grant that changes
    // while the screen is open (upgraded, narrowed, or re-recorded with the sibling) is a changed
    // review, so a decision made against the old grant fails with review_changed and the screen
    // reloads rather than signing under authority the user did not see.
    if (pairedGrant) review.pairedGrant = pairedGrant;
    if (!await getRequest(requestId)) throw new ProviderReviewError('expired_during_review');
    // The precise quote can change without changing any consequence. Include
    // the fee policy decision, rather than that volatile quote, in the digest.
    const { fastestFee: _quote, ...facts } = review;
    return { ...review, reviewKey: fingerprintReview({ facts, strictMode }) } as ProviderSigningReview;
  }

  /**
   * Both transactions of a commit-and-reveal bundle, in one wallet call under one signing guard
   * (`WalletSigner.signCommitAndRevealPsbts`): the commit, then the reveal with the source key.
   */
  async function signCommitAndReveal(
    request: SignPsbtsRequest,
    parsed: PsbtDetailsCache,
    identity: SigningIdentity,
    approvedCoinLocks?: CoinLock[],
  ): Promise<string[]> {
    const [commit, reveal] = request.items;
    if (!commit || !reveal || request.items.length !== 2 || !isStoredRevealIntent(reveal.marketplaceIntent)) {
      throw new ProviderReviewError('verification_failed');
    }
    await assertAuthorization(request, commit, parsed);
    await assertAuthorization(request, reveal, parsed);
    return getWalletService().signCommitAndRevealPsbts({ ...commit, ...(approvedCoinLocks ? { approvedCoinLocks } : {}) }, reveal.psbtHex, request.address, identity,
      reveal.sighashTypes[0]);
  }

  async function execute(requestId: string, decision: SigningDecision): Promise<void> {
    const sessionGeneration = getSessionGeneration();
    if (!decision || typeof decision.reviewKey !== 'string' || typeof decision.risksAcknowledged !== 'boolean') {
      throw new ProviderReviewError('invalid_decision');
    }
    // Parsed PSBT structure is pure in the bytes, which the claimed request pins, so one parse per
    // PSBT serves the whole flow. Chain and ledger facts are still re-read below at the click.
    const parsed: PsbtDetailsCache = new Map();
    const review = await buildReview(requestId, parsed);
    // Re-reviewed at the click, so a lookup that fails just now blocks. Say retry for that, not
    // "did not pass verification": nothing was disproved, and Retry is the fix.
    if (review.policy.blocked) {
      throw new ProviderReviewError(review.policy.retry ? 'retry_required' : 'verification_failed');
    }
    if (review.reviewKey !== decision.reviewKey) {
      throw new ProviderReviewError('review_changed');
    }
    if (review.policy.requiresAcknowledgement && !decision.risksAcknowledged) {
      throw new ProviderReviewError('acknowledge_risks');
    }
    const request = effectiveRequest(await claimSignFlow(requestId));
    let finalizing = false;
    try {
      const { identity, ownedAddresses } = await assertAuthorization(request, undefined, parsed);
      const wallet = getWalletService();
      const lockOptions = review.coinLocks?.length ? { approvedCoinLocks: review.coinLocks } : undefined;
      let result: SignFlowResult;
      switch (request.kind) {
        case 'sign-message': {
          const signed = await wallet.signMessage(request.message, request.signingAddress ?? request.address, identity);
          result = { signature: signed.signature };
          break;
        }
        case 'sign-transaction':
          result = { signedTxHex: await wallet.signTransaction(request.rawTxHex, request.address, lockOptions, identity),
            safeOwnChange: review.policy.safeOwnChange };
          break;
        case 'sign-psbt':
          result = { signedPsbtHex: await wallet.signPsbt(request.psbtHex, request.signInputs, request.sighashTypes, identity, lockOptions) };
          break;
        case 'sign-psbts': {
          // A child that spends its unbroadcast parent in the same bundle verifies that input
          // from the parent's reviewed bytes; the network has never seen them. Only bundle kinds
          // whose review proved that spend supply them, and never to the parent itself.
          const packageTransactions = bundleSpendsItsParent(request.bundleKind)
            ? packageParentOf(request.items[0]!.psbtHex)
            : undefined;
          const sign = async (item: (typeof request.items)[number], index: number) => {
            await assertAuthorization(request, item, parsed);
            return wallet.signPsbt(item.psbtHex, item.signInputs, item.sighashTypes, identity,
              packageTransactions && index > 0 ? { ...lockOptions, packageTransactions } : lockOptions);
          };
          const attach = request.items[0]?.marketplaceIntent;
          const signedPsbtHexes = request.bundleKind === 'commit-and-reveal'
            ? await signCommitAndReveal(request, parsed, identity, lockOptions?.approvedCoinLocks)
            : request.bundleKind === 'attach-and-list'
            ? await signAttachAndListingForDelivery(request.items,
              attach?.action === 'attach_for_listing' ? attach.expectedAttachedOutpoint
                : (() => { throw new ProviderReviewError('missing_attachment'); })(), sign)
            : request.bundleKind === 'fund-and-authorize-offers'
              ? await signFundAndAuthorizationsForDelivery(request.items, sign)
              : await signPsbtPhaseForDelivery(request.items, sign, maxMarketplaceBatchRequests(request.bundleKind));
          result = { signedPsbtHexes };
          break;
        }
      }
      // A user may revoke a site while a device or key operation is outstanding.
      // Do not disclose the result after revocation, cancellation, or expiration.
      await assertAuthorization(request, undefined, parsed);
      const current = await getSignFlow(requestId);
      if (current?.status !== 'signing') throw new ProviderReviewError('interrupted');
      const assertFinalization = await assertSignDeliveryAuthorized(request, needsPairedAddressGrant(request),
        sessionGeneration, supportsPairedContinuity(request.kind));
      assertFinalization();
      await beginSignFinalization(requestId);
      finalizing = true;
      assertFinalization();
      if (request.kind === 'sign-message' && request.cancelOffersIntent) {
        const store = getCoinLockStore();
        if (store?.cancelOffers) {
          for (const address of ownedAddresses) {
            await store.cancelOffers(address, request.origin, request.cancelOffersIntent)
              .catch((error: unknown) => console.warn('[ProviderSigning] Could not release cancelled offer coins:', error));
          }
        }
      }
      // Only once the signature exists: a rejection, a signer error or an interruption leaves every
      // lock. Before the commitments below, so a coin this signature commits again stays locked.
      await unlockConfirmedCoins(review);
      // Before the site hears of the signature, so no send in between can spend what it commits.
      await lockCommittedCoins(review, ownedAddresses);
      // Completed results can be delivered by recovery polling without the event below. Publish
      // the terminal result only after lock updates, then re-check authorization after all awaits.
      await recordSignOutcome(requestId, 'completed', result);
      const completed = await getSignFlow(requestId);
      if (completed?.status !== 'completed') throw new ProviderReviewError('expired_completion');
      const assertDelivery = await assertSignDeliveryAuthorized(completed, needsPairedAddressGrant(request),
        sessionGeneration, supportsPairedContinuity(request.kind));
      assertDelivery();
      eventEmitterService.emit(`${getSignFlowEventPrefix(request.kind)}-complete-${requestId}`, completed.result);
    } catch (error) {
      const outcome = finalizing ? await failSignFinalization(requestId) : await recordSignOutcome(requestId, 'cancelled');
      if (outcome?.status === 'cancelled') {
        eventEmitterService.emit(`${getSignFlowEventPrefix(request.kind)}-cancel-${requestId}`, { reason: 'Signing failed' });
      }
      // The signer re-reads every signed input from its real parent. When the site's PSBT
      // disagrees, or the key cannot sign what it describes, the fix is on the site's side.
      throw isTransactionDataMismatch(error)
        ? withProviderReviewCode(error, 'transaction_data_mismatch')
        : error;
    }
  }

  async function approveAndSign(requestId: string, decision: SigningDecision): Promise<void> {
    const existing = executing.get(requestId);
    if (existing) return existing;
    const operation = execute(requestId, decision);
    executing.set(requestId, operation);
    try { await operation; } finally { executing.delete(requestId); }
  }

  async function reject(requestId: string): Promise<void> {
    const request = await getSignFlow(requestId);
    if (!request || request.status === 'completed' || request.status === 'cancelled') return;
    const outcome = await recordSignOutcome(requestId, 'cancelled');
    if (outcome?.status === 'cancelled') {
      eventEmitterService.emit(`${getSignFlowEventPrefix(request.kind)}-cancel-${requestId}`, { reason: 'User cancelled' });
    }
  }

  return { getRequest, getReview, approveAndSign, reject };
}

export const [registerProviderSigningService, getProviderSigningService] = defineProxyServer(
  PROVIDER_SIGNING_SERVICE_NAME, createProviderSigningService, PROVIDER_SIGNING_SERVICE_POLICY,
);
