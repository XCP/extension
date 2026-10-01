/**
 * Reconcile missing locked coins using fresh answers from both Bitcoin indexers.
 * Release only on matching confirmed spends, or mark an orphan candidate on matching 404s.
 * Errors, disagreement and unconfirmed spends preserve the lock.
 */

import { apiClient, isApiError, type RequestConfig } from '@/core/api/client';
import { isRecord } from '@/core/isRecord';

/** Esplora sources, the same the wallet reads UTXOs from; both serve the same paths and shapes. */
export const OUTSPEND_SOURCES = ['https://mempool.space/api', 'https://blockstream.info/api'] as const;
/** Each request's own clock. */
export const OUTSPEND_TIMEOUT_MS = 5_000;
/** Total requests per pass, including funding lookups after a 404; the rest wait. */
export const MAX_OUTSPEND_LOOKUPS_PER_PASS = 20;
/** How long before the same coin is asked about again. */
export const OUTSPEND_RECHECK_MS = 5 * 60 * 1000;

export type OutspendVerdict = 'spent' | 'unknown' | 'keep';

type OutspendAnswer = { spent: false } | { spent: true; confirmed: boolean; txid: string };

function parseOutspend(data: unknown): OutspendAnswer | null {
  if (!isRecord(data) || typeof data.spent !== 'boolean') return null;
  if (!data.spent) return { spent: false };
  return isRecord(data.status) && typeof data.status.confirmed === 'boolean'
    && typeof data.txid === 'string' && /^[0-9a-f]{64}$/i.test(data.txid)
    ? { spent: true, confirmed: data.status.confirmed, txid: data.txid.toLowerCase() }
    : null;
}

const request: RequestConfig = { timeout: OUTSPEND_TIMEOUT_MS, retries: 0, reportStatus: false, cache: 'no-store' };

async function readOutspend(source: string, txid: string, vout: number): Promise<OutspendAnswer | 'missing' | null> {
  try {
    return parseOutspend((await apiClient.get<unknown>(`${source}/tx/${txid}/outspend/${vout}`, request)).data);
  } catch (error) {
    return isApiError(error) && error.code === 'HTTP_ERROR' && error.status === 404 ? 'missing' : null;
  }
}

/** Whether `source` has never heard of `txid`: a 404, and nothing less. */
async function unknownTransaction(source: string, txid: string): Promise<boolean> {
  try {
    await apiClient.get<unknown>(`${source}/tx/${txid}`, request);
    return false;
  } catch (error) {
    return isApiError(error) && error.code === 'HTTP_ERROR' && error.status === 404;
  }
}

/** The chain's verdict on `outpoint` (`txid:vout`). Never throws. */
export async function checkOutspend(outpoint: string): Promise<OutspendVerdict> {
  const [txid = '', voutText = ''] = outpoint.split(':');
  const vout = Number(voutText);
  if (!/^[0-9a-f]{64}:\d+$/.test(outpoint) || !Number.isSafeInteger(vout) || vout < 0 || vout > 0xffffffff) return 'keep';
  const answers = await Promise.all(OUTSPEND_SOURCES.map(source => readOutspend(source, txid, vout)));
  const first = answers[0];
  if (first && first !== 'missing' && first.spent && first.confirmed
    && answers.every(answer => answer && answer !== 'missing' && answer.spent && answer.confirmed && answer.txid === first.txid)) return 'spent';
  // Only consistent missing-output responses warrant an orphan check. Unspent, a mempool spend,
  // malformed data or an unavailable source all preserve the lock.
  if (!answers.every(answer => answer === 'missing')) return 'keep';
  const unknown = await Promise.all(OUTSPEND_SOURCES.map(source => unknownTransaction(source, txid)));
  return unknown.every(Boolean) ? 'unknown' : 'keep';
}

const lastChecked = new Map<string, number>();

/** Forget when coins were last checked (tests). */
export function resetOutspendChecks(): void {
  lastChecked.clear();
}

/**
 * Check as many of `candidates` as one pass allows, skipping any checked in the last
 * OUTSPEND_RECHECK_MS, and say which are spent and which unknown. Every other keeps its lock.
 */
export async function checkOutspends(
  candidates: readonly string[],
  nowMs = Date.now(),
): Promise<{ spent: string[]; unknown: string[] }> {
  const due = [...new Set(candidates)]
    .filter(outpoint => nowMs - (lastChecked.get(outpoint) ?? Number.NEGATIVE_INFINITY) >= OUTSPEND_RECHECK_MS)
    .sort((a, b) => (lastChecked.get(a) ?? Number.NEGATIVE_INFINITY) - (lastChecked.get(b) ?? Number.NEGATIVE_INFINITY))
    .slice(0, Math.floor(MAX_OUTSPEND_LOOKUPS_PER_PASS / (OUTSPEND_SOURCES.length * 2)));
  for (const outpoint of due) lastChecked.set(outpoint, nowMs);
  // Match the store's bounded scale without retaining every coin ever checked in this context.
  if (lastChecked.size > 4_000) {
    const oldest = [...lastChecked].sort((a, b) => a[1] - b[1]).slice(0, lastChecked.size - 2_000);
    for (const [outpoint] of oldest) lastChecked.delete(outpoint);
  }
  const verdicts = await Promise.all(due.map(async outpoint => [outpoint, await checkOutspend(outpoint)] as const));
  return {
    spent: verdicts.flatMap(([outpoint, verdict]) => verdict === 'spent' ? [outpoint] : []),
    unknown: verdicts.flatMap(([outpoint, verdict]) => verdict === 'unknown' ? [outpoint] : []),
  };
}
