/**
 * Persistent lifecycle for connection approvals, on the same footing as {@link signFlow}.
 *
 * The request is the record; the Promise a caller awaits is a courtesy to a caller that happens to
 * still be alive. A worker can stop while an approval screen is being read, and when it does the
 * Promise and the port carrying its answer go together — so neither is the source of truth.
 *
 * Sharing signFlow's storage class rather than persisting service state by hand means the TTL is
 * enforced on every read: a request that outlived its window is simply not there, whether it is
 * being read back after a restart or resolved by a click on a screen left open.
 */

import { type BaseRequest, RequestStorage } from '@/platform/storage/requestStorage';
import type { ApprovalRequest, ApprovalResult } from '@/types/provider';

export type ApprovalFlowStatus = 'pending' | 'completed' | 'cancelled';

export interface ApprovalFlowEntry extends BaseRequest {
  method: string;
  type: ApprovalRequest['type'];
  params: unknown;
  metadata?: ApprovalRequest['metadata'];
  status: ApprovalFlowStatus;
  /** The decision once status is no longer pending. */
  result?: ApprovalResult;
}

/** Matches the in-memory request timeout, so a stored request cannot outlive the timer it lost. */
export const APPROVAL_TTL_MS = 5 * 60 * 1000;

export const approvalFlowStorage = new RequestStorage<ApprovalFlowEntry>({
  storageKey: 'pending_approval_flow',
  requestName: 'approval',
  ttlMs: APPROVAL_TTL_MS,
});

/** Record a new pending approval. */
export async function beginApprovalFlow(
  request: ApprovalRequest
): Promise<void> {
  await approvalFlowStorage.store({ ...request, status: 'pending' });
}

/** Update an approval's outcome, so a caller that reconnects can see what was decided. */
export async function recordApprovalOutcome(
  id: string,
  status: Exclude<ApprovalFlowStatus, 'pending'>,
  result?: ApprovalResult
): Promise<void> {
  const entry = await approvalFlowStorage.get(id);
  if (!entry) return;
  // store() appends rather than upserts, so replace the existing entry.
  await approvalFlowStorage.remove(id);
  await approvalFlowStorage.store({ ...entry, status, result });
}

/**
 * The approval still awaiting a decision, if there is one.
 *
 * Only one is ever outstanding — a new request supersedes the last — so the most recent pending
 * entry is the answer. Expired entries are already filtered out by the store.
 */
export async function findPendingApproval(): Promise<ApprovalFlowEntry | null> {
  const all = await approvalFlowStorage.getAll();
  const pending = all.filter((entry) => entry.status === 'pending');
  return pending.sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

export const removeApprovalFlow = (id: string) => approvalFlowStorage.remove(id);
