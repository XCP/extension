/**
 * The background owns approval execution. A popup submits a decision over a
 * review, never bytes, signer parameters, or an alleged signing outcome.
 */
import { getFeeRates } from '@/core/bitcoin/feeRate';
import { getPsbtApprovalPolicy, getTransactionApprovalPolicy, type ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import { resolveProviderSignInputs } from '@/core/bitcoin/providerSigningPlan';
import { extractPsbtDetails, tapLeafOwnerAddress, validateSignInputs } from '@/core/bitcoin/psbt';
import { type DecodedPsbtInfo, decodePsbtForApproval } from '@/core/bitcoin/psbtApprovalDecoder';
import { type DecodedPsbtBundleInfo, decodePsbtBundleForApproval } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { type DecodedTransactionInfo, decodeTransactionForApproval } from '@/core/bitcoin/transactionApprovalDecoder';
import { getPairedAddressFormats } from '@/core/wallet/addressDeriver';
import { getSessionGeneration } from '@/platform/auth/sessionManager';
import { getTrustedBroadcastPrevout } from '@/platform/provider/recentBroadcasts';
import { getConnectionRevokedError, getIdentityMismatchError, getMessagePermissionError, getPsbtPermissionError } from '@/platform/provider/requestIdentity';
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
      throw new Error('Invalid signing request ID');
    }
    const request = await getSignFlow(requestId);
    return request?.status === 'pending' ? effectiveRequest(request) : null;
  }

  async function assertAuthorization(request: ProviderSigningRequest): Promise<void> {
    const wallet = getWalletService();
    if (!await wallet.isKeychainUnlocked()) throw new Error('Wallet is locked');
    const activeAddress = await wallet.getActiveAddress();
    const activeWallet = await wallet.getActiveWallet();
    const identityError = getIdentityMismatchError(request, activeAddress?.address, activeWallet?.id);
    if (identityError) throw new Error(identityError);
    const permissions = getConnectionService();
    const permissionError = request.kind === 'sign-message'
      ? await getMessagePermissionError(request, permissions)
      : request.kind === 'sign-transaction'
        ? await getConnectionRevokedError(request, permissions)
        : await getPsbtPermissionError({ ...request, signInputs: request.kind === 'sign-psbts'
          ? Object.fromEntries(request.items.flatMap(item => Object.entries(item.signInputs)))
          : request.signInputs }, request.address, permissions);
    if (permissionError) throw new Error(permissionError);

    // Repeat structural ownership validation using background wallet data. The
    // request is immutable, but grants and the selected identity are not.
    if (request.kind === 'sign-psbt' || request.kind === 'sign-psbts') {
      const paired = activeWallet?.type === 'mnemonic' && getPairedAddressFormats(activeWallet.addressFormat)
        ? await wallet.getPairedAddresses() : null;
      const allowed = [request.address, ...(paired ? [paired.legacy.address, paired.segwit.address] : [])];
      const items = request.kind === 'sign-psbt' ? [request] : request.items;
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
            throw new Error('Missing sighash entry for a requested input');
          }
        }
      }
    }
  }

  async function getReview(requestId: string): Promise<ProviderSigningReview> {
    const request = await getRequest(requestId);
    if (!request) throw new Error('Signing request not found or no longer pending');
    await assertAuthorization(request);
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
          throw new Error('Invalid or reserved message signing request');
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
          request.bitcoinPaymentIntent, request.marketplaceIntent);
        review = { kind: request.kind, request, decodedInfo, fastestFee,
          policy: getPsbtApprovalPolicy(request, decodedInfo, strictMode, fastestFee) };
        break;
      }
      case 'sign-psbts': {
        const decodedInfo = await decodePsbtBundleForApproval(request);
        // A linked phase has its own exact semantic proof (including the CPFP
        // child's funding); its review card contains the whole authorization.
        review = { kind: request.kind, request, decodedInfo, fastestFee, policy: {
          ...ordinaryPolicy,
          blocked: decodedInfo.review.status === 'blocked' || decodedInfo.review.status === 'retry',
        } };
        break;
      }
    }
    if (!await getRequest(requestId)) throw new Error('Signing request expired during review');
    // The precise quote can change without changing any consequence. Include
    // the fee policy decision, rather than that volatile quote, in the digest.
    const { fastestFee: _quote, ...facts } = review;
    return { ...review, reviewKey: fingerprintReview({ facts, strictMode }) } as ProviderSigningReview;
  }

  async function execute(requestId: string, decision: SigningDecision): Promise<void> {
    const sessionGeneration = getSessionGeneration();
    if (!decision || typeof decision.reviewKey !== 'string' || typeof decision.risksAcknowledged !== 'boolean') {
      throw new Error('Invalid signing decision');
    }
    const review = await getReview(requestId);
    if (review.policy.blocked) throw new Error('This request did not pass transaction verification');
    if (review.reviewKey !== decision.reviewKey) {
      throw new Error('The transaction review changed. Reload this approval and review it again.');
    }
    if (review.policy.requiresAcknowledgement && !decision.risksAcknowledged) {
      throw new Error('Review and acknowledge the transaction risks before signing');
    }
    const request = effectiveRequest(await claimSignFlow(requestId));
    try {
      await assertAuthorization(request);
      const wallet = getWalletService();
      const identity = { walletId: request.walletId, address: request.address };
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
            await assertAuthorization(request);
            return wallet.signPsbt(item.psbtHex, item.signInputs, item.sighashTypes, identity);
          };
          const attach = request.items[0]?.marketplaceIntent;
          const signedPsbtHexes = request.bundleKind === 'attach-and-list'
            ? await signAttachAndListingForDelivery(request.items,
              attach?.action === 'attach_for_listing' ? attach.expectedAttachedOutpoint
                : (() => { throw new Error('Missing attachment parent'); })(), sign)
            : await signPsbtPhaseForDelivery(request.items, sign);
          result = { signedPsbtHexes };
          break;
        }
      }
      // A user may revoke a site while a device or key operation is outstanding.
      // Do not disclose the result after revocation, cancellation, or expiration.
      await assertAuthorization(request);
      const current = await getSignFlow(requestId);
      if (current?.status !== 'signing') throw new Error('Signing request was cancelled or expired');
      await recordSignOutcome(requestId, 'completed', result);
      const completed = await getSignFlow(requestId);
      if (completed?.status !== 'completed') throw new Error('Signing request expired before completion');
      const assertDelivery = await assertSignDeliveryAuthorized(completed, needsPairedAddressGrant(request), sessionGeneration);
      assertDelivery();
      eventEmitterService.emit(`${getSignFlowEventPrefix(request.kind)}-complete-${requestId}`, completed.result);
    } catch (error) {
      const outcome = await recordSignOutcome(requestId, 'cancelled');
      if (outcome?.status === 'cancelled') {
        eventEmitterService.emit(`${getSignFlowEventPrefix(request.kind)}-cancel-${requestId}`, { reason: 'Signing failed' });
      }
      throw error;
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
