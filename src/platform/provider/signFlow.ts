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

import type { BitcoinPaymentIntentV1 } from '@/core/bitcoin/providerPayment';
import type { MarketplaceBatchKind } from '@/core/counterparty/marketplaceBatch';
import type { BumpAcceptanceFeeIntentClaim } from '@/core/counterparty/marketplaceBundle';
import type { MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplaceIntent';
import { type AuthorizedRequest, RequestStorage } from '@/platform/storage/requestStorage';

export type SignFlowStatus = 'pending' | 'completed' | 'cancelled';

/** Which screen the flow belongs to, and the prefix of the events it emits. */
export type SignFlowKind = 'sign-message' | 'sign-psbt' | 'sign-psbts' | 'sign-transaction';

/**
 * A signing request in flight.
 *
 * `P` carries the parameters of the particular method. They sit alongside the identity the
 * request was authorised for, so signing cannot later use a different address or wallet.
 */
export type SignFlowEntry<P = Record<string, unknown>> = AuthorizedRequest & {
  /** Deterministic key over (origin, method, params); identical re-requests share it. */
  requestKey: string;
  kind: SignFlowKind;
  status: SignFlowStatus;
  /** The completion payload (e.g. { signedTxHex }) once status === 'completed'. */
  result?: unknown;
} & P;

export type SignMessageRequest = SignFlowEntry<{ message: string }>;
export type SignTransactionRequest = SignFlowEntry<{ rawTxHex: string }>;
export type SignPsbtRequest = SignFlowEntry<{
  psbtHex: string;
  signInputs?: Record<string, number[]>;
  sighashTypes?: number[];
  /** Defaults to counterparty for requests stored by older wallet versions. */
  signingPurpose?: 'counterparty' | 'bitcoin-payment';
  bitcoinPaymentIntent?: BitcoinPaymentIntentV1;
  marketplaceIntent?: MarketplaceIntentClaimV1;
  /**
   * A site's claim about the inscription commit this PSBT funds: the reveal's tapleaf script and
   * the taproot internal key, both hex. Never trusted — the approval screen recomputes the commit
   * address and message from it and hard-refuses on any mismatch
   * (`core/counterparty/providerInscriptions.ts`).
   */
  inscription?: { revealScript: string; tapInternalKey: string };
}>;

export interface SignPsbtBundleItem {
  psbtHex: string;
  signInputs: Record<string, number[]>;
  sighashTypes: number[];
  marketplaceIntent: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
}

/** Fail-closed provider bundle: every item is proved before any signer is invoked. */
export type SignPsbtsRequest = SignFlowEntry<{
  bundleKind: 'acceptance-cpfp' | MarketplaceBatchKind;
  items: SignPsbtBundleItem[];
}>;

/**
 * Active flows older than this are treated as stale and ignored for rejoin/recovery. Independent
 * of ApprovalService's own timeout, which covers the separate connection flow.
 */
export const SIGN_FLOW_TTL_MS = 10 * 60 * 1000;

export const signFlowStorage = new RequestStorage<SignFlowEntry>({
  storageKey: 'pending_sign_flow',
  requestName: 'sign flow',
  ttlMs: SIGN_FLOW_TTL_MS,
});

/** Deterministic key for a provider request so a retry maps to the same flow. */
export function computeRequestKey(origin: string, method: string, params: unknown): string {
  const json = JSON.stringify({ origin, method, params });
  // djb2 — collision risk is negligible for this short-lived, per-origin keyspace.
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) >>> 0;
  }
  return `${method}:${hash.toString(16)}`;
}

/** Record a new pending flow, with the parameters the approval screen will render. */
export async function beginSignFlow<P extends Record<string, unknown>>(
  entry: Omit<SignFlowEntry<P>, 'status' | 'result'>
): Promise<void> {
  await signFlowStorage.store({ ...entry, status: 'pending' } as SignFlowEntry);
}

/**
 * Update a flow's outcome.
 *
 * The parameters are dropped as it settles: they exist for the screen, which is finished with
 * them, while the status and result stay until the TTL for a dApp that has yet to reconnect.
 */
export async function recordSignOutcome(
  id: string,
  status: Exclude<SignFlowStatus, 'pending'>,
  result?: unknown
): Promise<void> {
  const entry = await signFlowStorage.get(id);
  if (!entry) return;
  const { id: entryId, origin, timestamp, requestKey, kind, address, walletId } = entry;
  // store() appends rather than upserts, so replace the existing entry.
  await signFlowStorage.remove(id);
  await signFlowStorage.store({
    id: entryId,
    origin,
    timestamp,
    requestKey,
    kind,
    address,
    walletId,
    status,
    result,
  });
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
 * Origin is matched explicitly so a djb2 requestKey collision from another
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
      (e) => e.requestKey === requestKey && e.origin === origin && now - e.timestamp < SIGN_FLOW_TTL_MS
    ) ?? null
  );
}

/** Every flow still awaiting a decision. */
export async function getPendingSignFlows(): Promise<SignFlowEntry[]> {
  const all = await signFlowStorage.getAll();
  return all.filter((entry) => entry.status === 'pending');
}

export const getSignFlow = <P = Record<string, unknown>>(id: string) =>
  signFlowStorage.get(id) as Promise<SignFlowEntry<P> | null>;
export const removeSignFlow = (id: string) => signFlowStorage.remove(id);
