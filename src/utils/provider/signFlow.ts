/**
 * Persistent lifecycle for dApp signing requests so they survive a service-worker
 * restart. The awaited Promise + event listeners live only in worker memory; this
 * store persists the request's status/result keyed by requestId, and a deterministic
 * requestKey lets a dApp re-request rejoin (or recover the result of) the original
 * flow instead of opening a duplicate popup.
 */

import { RequestStorage, BaseRequest } from '@/utils/storage/requestStorage';

export type SignFlowStatus = 'pending' | 'completed' | 'cancelled';

export interface SignFlowEntry extends BaseRequest {
  /** Deterministic key over (origin, method, params); identical re-requests share it. */
  requestKey: string;
  status: SignFlowStatus;
  /** The completion payload (e.g. { signedTxHex }) once status === 'completed'. */
  result?: unknown;
}

/** Active flows older than this are treated as stale and ignored for rejoin/recovery. */
export const SIGN_FLOW_TTL_MS = 10 * 60 * 1000; // matches the in-memory approval timeout

export const signFlowStorage = new RequestStorage<SignFlowEntry>({
  storageKey: 'pending_sign_flow',
  requestName: 'sign flow',
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

/** Record a new pending flow for a request. */
export async function beginSignFlow(id: string, origin: string, requestKey: string): Promise<void> {
  await signFlowStorage.store({ id, origin, requestKey, status: 'pending', timestamp: Date.now() });
}

/** Update a flow's outcome (called when the popup signals completion/cancellation). */
export async function recordSignOutcome(id: string, status: SignFlowStatus, result?: unknown): Promise<void> {
  const entry = await signFlowStorage.get(id);
  if (!entry) return;
  // store() appends rather than upserts, so replace the existing entry.
  await signFlowStorage.remove(id);
  await signFlowStorage.store({ ...entry, status, result });
}

/** Find a non-stale flow for a request key (for dedup/rejoin/recovery). */
export async function findActiveFlowByKey(requestKey: string): Promise<SignFlowEntry | null> {
  const now = Date.now();
  const all = await signFlowStorage.getAll();
  return (
    all.find((e) => e.requestKey === requestKey && now - e.timestamp < SIGN_FLOW_TTL_MS) ?? null
  );
}

export const getSignFlow = (id: string) => signFlowStorage.get(id);
export const removeSignFlow = (id: string) => signFlowStorage.remove(id);
