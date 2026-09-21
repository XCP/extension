/**
 * Persistent lifecycle for dApp signing requests so they survive a service-worker
 * restart. The awaited Promise + event listeners live only in worker memory; this
 * store persists the request itself — its parameters, status and result — keyed by
 * requestId, and a deterministic requestKey lets a dApp re-request rejoin (or
 * recover the result of) the original flow instead of opening a duplicate popup.
 *
 * One record per request. The parameters the screen renders and the status the dApp
 * recovers are the same request seen from two ends, and keeping them apart meant two
 * writes and two removes that had to be kept in step by hand.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { BitcoinPaymentIntentV1 } from '@/core/bitcoin/providerPayment';
import type { MarketplaceBatchKind } from '@/core/counterparty/marketplaceBatch';
import type { BumpAcceptanceFeeIntentClaim } from '@/core/counterparty/marketplaceBundle';
import type { MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplaceIntent';
import { type AuthorizedRequest, RequestStorage } from '@/platform/storage/requestStorage';

export type SignFlowKind = 'sign-message' | 'sign-psbt' | 'sign-psbts' | 'sign-transaction';
export type SignFlowEventPrefix = 'sign-message' | 'sign-psbt' | 'sign-psbts' | 'sign-tx';
export const getSignFlowEventPrefix = (kind: SignFlowKind): SignFlowEventPrefix =>
  kind === 'sign-transaction' ? 'sign-tx' : kind;
export type SignFlowStatus = 'pending' | 'signing' | 'completed' | 'cancelled';

interface SignFlowIdentity extends AuthorizedRequest {
  /** SHA-256 over the origin, method, signing identity and canonical parameters. */
  requestKey: string;
}

export interface SignPsbtBundleItem {
  psbtHex: string;
  signInputs: Record<string, number[]>;
  sighashTypes: number[];
  marketplaceIntent: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
}

interface SignFlowParameters {
  'sign-message': { message: string; signingAddress?: string };
  'sign-transaction': { rawTxHex: string };
  'sign-psbt': {
    psbtHex: string;
    signInputs?: Record<string, number[]>;
    sighashTypes?: number[];
    signingPurpose?: 'counterparty' | 'bitcoin-payment';
    bitcoinPaymentIntent?: BitcoinPaymentIntentV1;
    marketplaceIntent?: MarketplaceIntentClaimV1;
    inscription?: { revealScript: string; tapInternalKey: string };
  };
  'sign-psbts': {
    bundleKind: 'acceptance-cpfp' | MarketplaceBatchKind;
    items: SignPsbtBundleItem[];
  };
}

export interface SignFlowResults {
  'sign-message': { signature: string };
  'sign-transaction': { signedTxHex: string; safeOwnChange?: boolean };
  'sign-psbt': { signedPsbtHex: string };
  'sign-psbts': { signedPsbtHexes: string[] };
}
export type SignFlowResult = SignFlowResults[SignFlowKind];
type ActiveRequest<K extends SignFlowKind> = SignFlowIdentity & {
  kind: K;
  status: 'pending' | 'signing';
} & SignFlowParameters[K];
export type SignMessageRequest = ActiveRequest<'sign-message'>;
export type SignTransactionRequest = ActiveRequest<'sign-transaction'>;
export type SignPsbtRequest = ActiveRequest<'sign-psbt'>;
export type SignPsbtsRequest = ActiveRequest<'sign-psbts'>;
export type ProviderSigningRequest = { [K in SignFlowKind]: ActiveRequest<K> }[SignFlowKind];
export type CompletedSignFlow = {
  [K in SignFlowKind]: SignFlowIdentity & { kind: K; status: 'completed'; result: SignFlowResults[K] }
}[SignFlowKind];
export type SignFlowEntry = ProviderSigningRequest | CompletedSignFlow |
  (SignFlowIdentity & { kind: SignFlowKind; status: 'cancelled' });
export type NewSignFlow = { [K in SignFlowKind]: Omit<ActiveRequest<K>, 'status'> }[SignFlowKind];

/**
 * Active flows older than this are treated as stale and ignored for rejoin/recovery. Independent
 * of ApprovalService's own timeout, which covers the separate connection flow.
 */
export const SIGN_FLOW_TTL_MS = 10 * 60 * 1000;

export const signFlowStorage = new RequestStorage<SignFlowEntry>({
  storageKey: 'pending_sign_flow',
  requestName: 'sign flow',
  ttlMs: SIGN_FLOW_TTL_MS,
  validate: isValidSignFlow,
});

/** Canonical JSON avoids changing a request's identity when object keys are reordered. */
function canonical(value: unknown): unknown {
  // Tag every node, so a bigint cannot collide with a string or a site-supplied
  // object that happens to resemble an encoding tag. Decoder quantities remain
  // bigint all the way through the review and Chrome transport.
  if (value === null) return ['null'];
  if (typeof value === 'bigint') return ['bigint', value.toString()];
  if (Array.isArray(value)) return ['array', value.map(canonical)];
  if (value instanceof Uint8Array) return ['bytes', bytesToHex(value)];
  if (typeof value === 'object') {
    return ['object', Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .filter(([, item]) => item !== undefined).map(([key, item]) => [key, canonical(item)])];
  }
  if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'undefined') {
    return [typeof value, value];
  }
  throw new Error('Unsupported review value');
}

export function fingerprintReview(value: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(value)))));
}

export function computeRequestKey(
  origin: string,
  method: string,
  params: unknown,
  identity?: { walletId: string; address: string },
): string {
  return `${method}:${fingerprintReview({ origin, method, params, identity })}`;
}

/** Background-owned insertion; UI contexts submit service commands instead. */
export async function beginSignFlow(entry: NewSignFlow): Promise<void> {
  const pending = { ...entry, status: 'pending' as const };
  if (!isValidSignFlow(pending)) throw new Error('Invalid signing request');
  await signFlowStorage.insert(pending);
}

/** Claim before entering the signer. A worker lost after this point must never replay signing. */
export async function claimSignFlow(id: string): Promise<ProviderSigningRequest> {
  const claimed = await signFlowStorage.update(id, entry => {
    if (entry.status !== 'pending') throw new Error('This signing request is no longer pending');
    return { ...entry, status: 'signing' };
  });
  if (!claimed || claimed.status !== 'signing') throw new Error('Signing request not found or expired');
  return claimed;
}

function validResult(kind: SignFlowKind, result: unknown): result is SignFlowResult {
  if (!result || typeof result !== 'object') return false;
  const value = result as Record<string, unknown>;
  switch (kind) {
    case 'sign-message': return typeof value.signature === 'string';
    case 'sign-transaction': return typeof value.signedTxHex === 'string'
      && (value.safeOwnChange === undefined || typeof value.safeOwnChange === 'boolean');
    case 'sign-psbt': return typeof value.signedPsbtHex === 'string';
    case 'sign-psbts': return Array.isArray(value.signedPsbtHexes)
      && value.signedPsbtHexes.length > 0 && value.signedPsbtHexes.every(hex => typeof hex === 'string');
  }
}

/**
 * Atomic terminal transition. Returns the effective stored outcome, including a
 * competing terminal outcome that already won. Missing or expired requests return null.
 */
export async function recordSignOutcome(
  id: string,
  status: 'completed' | 'cancelled',
  result?: unknown,
): Promise<SignFlowEntry | null> {
  return signFlowStorage.update(id, entry => {
    if (entry.status === 'completed' || entry.status === 'cancelled') return entry;
    if (status === 'completed' && !validResult(entry.kind, result)) {
      throw new Error('Invalid signing outcome');
    }
    const { id: entryId, origin, timestamp, requestKey, kind, address, walletId } = entry;
    const identity = { id: entryId, origin, timestamp, requestKey, kind, address, walletId };
    return status === 'cancelled' ? { ...identity, status } :
      { ...identity, status, result } as CompletedSignFlow;
  });
}

/** Session storage is a serialization boundary; generic BaseRequest validation is insufficient. */
function isValidSignFlow(value: unknown): value is SignFlowEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)
    || entry.timestamp < 0 || entry.timestamp > Date.now()) return false;
  if (['id', 'origin', 'walletId', 'address', 'requestKey'].some(key =>
    typeof entry[key] !== 'string' || (entry[key] as string).length === 0)) return false;
  if (!['sign-message', 'sign-transaction', 'sign-psbt', 'sign-psbts'].includes(entry.kind as string)) return false;
  if (entry.status === 'cancelled') return true;
  if (entry.status === 'completed') return validResult(entry.kind as SignFlowKind, entry.result);
  if (entry.status !== 'pending' && entry.status !== 'signing') return false;
  if (entry.kind === 'sign-message') return typeof entry.message === 'string'
    && (entry.signingAddress === undefined || typeof entry.signingAddress === 'string');
  if (entry.kind === 'sign-transaction') return typeof entry.rawTxHex === 'string';
  const validPsbt = (item: unknown): boolean => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return typeof record.psbtHex === 'string'
      && (record.signInputs === undefined || (record.signInputs !== null
        && typeof record.signInputs === 'object' && !Array.isArray(record.signInputs)
        && Object.values(record.signInputs).every(indices => Array.isArray(indices)
          && indices.every(index => Number.isSafeInteger(index) && index >= 0))))
      && (record.sighashTypes === undefined || (Array.isArray(record.sighashTypes)
        && record.sighashTypes.every(sighash => Number.isSafeInteger(sighash))));
  };
  if (entry.kind === 'sign-psbt') return validPsbt(entry)
    && (entry.signingPurpose === undefined || entry.signingPurpose === 'counterparty' || entry.signingPurpose === 'bitcoin-payment');
  return ['acceptance-cpfp', 'attach-and-list', 'bulk-fanout', 'prepare-assets', 'bulk-attach', 'bulk-listing']
    .includes(entry.bundleKind as string) && Array.isArray(entry.items) && entry.items.length > 0
    && entry.items.length <= 8 && entry.items.every(item => validPsbt(item)
      && item.signInputs && Object.keys(item.signInputs).length > 0 && Array.isArray(item.sighashTypes)
      && item.marketplaceIntent && typeof item.marketplaceIntent.action === 'string');
}

/** A closed document may cancel a pending prompt, never an already approved signer. */
export async function cancelPendingSignFlow(id: string): Promise<boolean> {
  let cancelled = false;
  await signFlowStorage.update(id, entry => {
    if (entry.status !== 'pending') return entry;
    cancelled = true;
    const { id: entryId, origin, timestamp, requestKey, kind, address, walletId } = entry;
    return { id: entryId, origin, timestamp, requestKey, kind, address, walletId, status: 'cancelled' };
  });
  return cancelled;
}

/**
 * Return the address that safely signed this exact raw transaction for this
 * origin, or null when the broadcast is unrelated to a completed provider
 * signing approval. The explicit eligibility bit is set only after the
 * approval screen resolved every signed input and found no attached assets.
 */
export async function findSafeChangeSigningAddress(
  signedTxHex: string,
  origin: string
): Promise<string | null> {
  const now = Date.now();
  const all = await signFlowStorage.getAll();
  const flow = all.find((entry) => {
    if (
      entry.kind !== 'sign-transaction'
      || entry.status !== 'completed'
      || entry.origin !== origin
      || now - entry.timestamp >= SIGN_FLOW_TTL_MS
      || !entry.result
      || typeof entry.result !== 'object'
    ) return false;
    const result = entry.result as Record<string, unknown>;
    return result.signedTxHex === signedTxHex && result.safeOwnChange === true;
  });
  return flow?.address ?? null;
}

/**
 * Find a non-stale flow for a request key (for dedup/rejoin/recovery).
 * Origin is matched explicitly so a requestKey from another
 * origin can never rejoin or recover this origin's flow.
 */
export async function findActiveFlowByKey(
  requestKey: string,
  origin: string
): Promise<SignFlowEntry | null> {
  const now = Date.now();
  const all = await signFlowStorage.getAll();
  return (
    all.find(
      (e) => e.requestKey === requestKey && e.origin === origin && e.status !== 'cancelled'
        && now - e.timestamp < SIGN_FLOW_TTL_MS
    ) ?? null
  );
}

/** Every flow still awaiting a decision. */
export async function getPendingSignFlows(): Promise<SignFlowEntry[]> {
  const all = await signFlowStorage.getAll();
  return all.filter((entry) => entry.status === 'pending');
}

export const getSignFlow = (id: string) => signFlowStorage.get(id);
export const removeSignFlow = (id: string) => signFlowStorage.remove(id);
