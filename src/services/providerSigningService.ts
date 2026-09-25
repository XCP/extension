/**
 * The background owns approval execution. A popup submits a decision over a
 * review, never bytes, signer parameters, or an alleged signing outcome.
 */
import { getFeeRates } from '@/core/bitcoin/feeRate';
import { getPsbtApprovalPolicy, getPsbtBundleApprovalPolicy, getTransactionApprovalPolicy, type ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { extractPsbtDetails, tapLeafOwnerAddress, validateSignInputs } from '@/core/bitcoin/psbt';
import { type DecodedPsbtInfo, decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import { type DecodedPsbtBundleInfo, decodePsbtBundleForApproval } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { PrevoutMismatchError } from '@/core/bitcoin/psbtPrevouts';
import { type DecodedTransactionInfo, decodeTransactionForApproval } from '@/core/bitcoin/transactionApprovalDecoder';
import { maxMarketplaceBatchRequests } from '@/core/counterparty/marketplaceBatch';
import { SigningError } from '@/core/errors';
import { ProviderReviewError, providerReviewCode, withProviderReviewCode } from '@/core/providerReviewErrors';
import { getPairedAddressFormats } from '@/core/wallet/addressDeriver';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import type { SigningIdentity } from '@/platform/auth/signingIdentity';
import type { PairedGrant } from '@/platform/provider/pairedGrant';
import { getTrustedBroadcastPrevout } from '@/platform/provider/recentBroadcasts';
import { getConnectionRevokedCode, getIdentityMismatchCode, getMessagePermissionCode, getPsbtPermissionCode, supportsPairedContinuity } from '@/platform/provider/requestIdentity';
import { assertSignDeliveryAuthorized, needsPairedAddressGrant } from '@/platform/provider/signDelivery';
import { claimSignFlow, fingerprintReview, getSignFlow, getSignFlowEventPrefix, type ProviderSigningRequest, recordSignOutcome, type SignFlowResult, type SignMessageRequest, type SignPsbtRequest, type SignPsbtsRequest, type SignTransactionRequest } from '@/platform/provider/signFlow';
import { signAttachAndListingForDelivery, signPsbtPhaseForDelivery } from '@/platform/provider/signPsbtPhase';
import { defineProxyService } from '@/platform/proxy';
import { getConnectionService } from '@/services/connectionService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { getWalletService } from '@/services/walletService';

interface ReviewBase {
  reviewKey: string;
  policy: ProviderApprovalPolicy;
  fastestFee?: number;
  /**
   * The origin's paired grant when this request may continue after a switch to the active
   * address's Legacy/SegWit sibling. Lets the screen keep the review open; execution re-reads
   * the current grant and authorizes every signer against it. Included in reviewKey, so a grant
   * change invalidates an open review (review_changed) on purpose.
   */
  pairedGrant?: PairedGrant;
}
export type ProviderSigningReview = ReviewBase & (
  | { kind: 'sign-message'; request: SignMessageRequest }
  | { kind: 'sign-transaction'; request: SignTransactionRequest; decodedInfo: DecodedTransactionInfo }
  | { kind: 'sign-psbt'; request: SignPsbtRequest; decodedInfo: DecodedPsbtInfo }
  | { kind: 'sign-psbts'; request: SignPsbtsRequest; decodedInfo: DecodedPsbtBundleInfo }
);

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

/** A signer failure caused by the site's transaction bytes, not by the wallet or the network. */
function isTransactionDataMismatch(error: unknown): error is Error {
  return !providerReviewCode(error)
    && (error instanceof PrevoutMismatchError || error instanceof SigningError);
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
  async function assertAuthorization(request: ProviderSigningRequest, onlyItem?: SignPsbtsRequest['items'][number]): Promise<{
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
        const details = extractPsbtDetails(item.psbtHex);
        if (item.signInputs !== undefined) {
          const ownership = validateSignInputs(item.signInputs, allowed, details.inputs.length,
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
    return { ownedAddresses: [request.address], identity };
  }

  async function getReview(requestId: string): Promise<ProviderSigningReview> {
    const request = await getRequest(requestId);
    if (!request) throw new ProviderReviewError('unavailable');
    const { ownedAddresses } = await assertAuthorization(request);
    const strictMode = (await getWalletService().getSettings()).strictTransactionVerification !== false;
    const fastestFee = request.kind === 'sign-message' ? undefined
      : await getFeeRates().then(rates => rates.fastestFee).catch(() => undefined);
    let review: Omit<ReviewBase, 'reviewKey'> & Record<string, unknown>;
    const ordinaryPolicy: ProviderApprovalPolicy = {
      blocked: false, requiresAcknowledgement: false, safeOwnChange: false,
    };
    switch (request.kind) {
      case 'sign-message':
        if (!request.message || typeof request.message !== 'string' || request.message.startsWith('xcp-wallet\n')) {
          throw new ProviderReviewError('invalid_message');
        }
        review = { kind: request.kind, request, policy: ordinaryPolicy };
        break;
      case 'sign-transaction': {
        const decodedInfo = await decodeTransactionForApproval(request.rawTxHex, request.address, getTrustedBroadcastPrevout);
        review = { kind: request.kind, request, decodedInfo, fastestFee,
          policy: getTransactionApprovalPolicy(request, decodedInfo, strictMode, fastestFee) };
        break;
      }
      case 'sign-psbt': {
        const signers = Object.keys(request.signInputs ?? {});
        const decodedInfo = await decodePsbtForApproval(request.psbtHex,
          signers.length ? signers : [request.address], Object.values(request.signInputs ?? {}).flat(),
          request.sighashTypes, request.inscription, request.signingPurpose,
          request.bitcoinPaymentIntent, request.marketplaceIntent, ownedAddresses,
          { resolveTrustedPrevout: getTrustedBroadcastPrevout });
        review = { kind: request.kind, request, decodedInfo, fastestFee,
          policy: getPsbtApprovalPolicy(request, decodedInfo, strictMode, fastestFee) };
        break;
      }
      case 'sign-psbts': {
        // The origin is the one the provider verified from the sender, never the site's words.
        const decodedInfo = await decodePsbtBundleForApproval(
          request, ownedAddresses, undefined, { origin: request.origin },
        );
        const { policy, warnings } = getPsbtBundleApprovalPolicy(request, decodedInfo, strictMode, fastestFee);
        review = { kind: request.kind, request,
          decodedInfo: { ...decodedInfo, policyWarnings: warnings }, fastestFee, policy };
        break;
      }
    }
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

  async function execute(requestId: string, decision: SigningDecision): Promise<void> {
    const sessionGeneration = getSessionGeneration();
    if (!decision || typeof decision.reviewKey !== 'string' || typeof decision.risksAcknowledged !== 'boolean') {
      throw new ProviderReviewError('invalid_decision');
    }
    const review = await getReview(requestId);
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
    try {
      const { identity } = await assertAuthorization(request);
      const wallet = getWalletService();
      let result: SignFlowResult;
      switch (request.kind) {
        case 'sign-message': {
          const signed = await wallet.signMessage(request.message, request.signingAddress ?? request.address, identity);
          result = { signature: signed.signature };
          break;
        }
        case 'sign-transaction':
          result = { signedTxHex: await wallet.signTransaction(request.rawTxHex, request.address, undefined, identity),
            safeOwnChange: review.policy.safeOwnChange };
          break;
        case 'sign-psbt':
          result = { signedPsbtHex: await wallet.signPsbt(request.psbtHex, request.signInputs, request.sighashTypes, identity) };
          break;
        case 'sign-psbts': {
          const sign = async (item: (typeof request.items)[number]) => {
            await assertAuthorization(request, item);
            return wallet.signPsbt(item.psbtHex, item.signInputs, item.sighashTypes, identity);
          };
          const attach = request.items[0]?.marketplaceIntent;
          const signedPsbtHexes = request.bundleKind === 'attach-and-list'
            ? await signAttachAndListingForDelivery(request.items,
              attach?.action === 'attach_for_listing' ? attach.expectedAttachedOutpoint
                : (() => { throw new ProviderReviewError('missing_attachment'); })(), sign)
            : await signPsbtPhaseForDelivery(request.items, sign, maxMarketplaceBatchRequests(request.bundleKind));
          result = { signedPsbtHexes };
          break;
        }
      }
      // A user may revoke a site while a device or key operation is outstanding.
      // Do not disclose the result after revocation, cancellation, or expiration.
      await assertAuthorization(request);
      const current = await getSignFlow(requestId);
      if (current?.status !== 'signing') throw new ProviderReviewError('interrupted');
      await recordSignOutcome(requestId, 'completed', result);
      const completed = await getSignFlow(requestId);
      if (completed?.status !== 'completed') throw new ProviderReviewError('expired_completion');
      const assertDelivery = await assertSignDeliveryAuthorized(completed, needsPairedAddressGrant(request),
        sessionGeneration, supportsPairedContinuity(request.kind));
      assertDelivery();
      eventEmitterService.emit(`${getSignFlowEventPrefix(request.kind)}-complete-${requestId}`, completed.result);
    } catch (error) {
      const outcome = await recordSignOutcome(requestId, 'cancelled');
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

export const [registerProviderSigningService, getProviderSigningService] = defineProxyService(
  'ProviderSigningService', createProviderSigningService,
  { methods: { getRequest: 'read', getReview: 'read', approveAndSign: 'command', reject: 'command' } },
);
