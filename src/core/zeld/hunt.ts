/**
 * Run a time-boxed hunt for a txid with leading zeros across Web Workers.
 *
 * The nonce space (`LOCKTIME_NONCE_COUNT` values) is split into one contiguous slice per worker.
 * The first worker to find a qualifying txid ends the hunt; otherwise the deadline does, or the
 * caller's abort signal. Workers are always terminated on the way out, so a hunt never outlives
 * the compose that started it.
 *
 * Without `Worker` (unit tests, an unusual runtime) the hunt runs on the calling thread in short
 * batches, yielding to the event loop between them.
 */

import type { HuntTemplate } from '@/core/zeld/huntTemplate';
import type { HuntWorkerRequest, HuntWorkerResponse } from '@/core/zeld/huntWorkerProtocol';
import { mineRange } from '@/core/zeld/mineRange';
import { LOCKTIME_NONCE_COUNT } from '@/core/zeld/protocol';
import { MutableSha256d } from '@/core/zeld/sha256d';
import type { ZeldHuntProgress } from '@/core/zeld/types';

export type HuntTxidResult =
  | { status: 'found'; nonce: number; txid: string; zeroCount: number; attempts: number; elapsedMs: number }
  | { status: 'not_found'; attempts: number; elapsedMs: number }
  | { status: 'aborted'; attempts: number; elapsedMs: number };

/** The subset of `Worker` the coordinator uses, so tests can supply a stand-in. */
export interface HuntWorkerLike {
  postMessage(message: HuntWorkerRequest): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: { data: HuntWorkerResponse }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export interface HuntTxidOptions {
  /** Time budget. Fractional seconds are accepted for tests; the setting itself is whole seconds. */
  seconds: number;
  targetZeros: number;
  signal?: AbortSignal;
  onProgress?: (progress: ZeldHuntProgress) => void;
  /** Defaults to the hardware concurrency, capped at eight. */
  workerCount?: number;
  /** Returns null when workers are unavailable; the hunt then runs inline. */
  createWorker?: () => HuntWorkerLike | null;
  now?: () => number;
  /** Hashes per worker batch; also how often inline hunting yields. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 50_000;
const INLINE_BATCH_SIZE = 20_000;
const PROGRESS_INTERVAL_MS = 200;
const MAX_WORKERS = 8;

/** Default worker factory: the Vite worker syntax the KDF worker already relies on. */
function createHuntWorker(): HuntWorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./hunt-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

function defaultWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  return Math.max(1, Math.min(MAX_WORKERS, cores || 2));
}

export async function huntTxid(template: HuntTemplate, options: HuntTxidOptions): Promise<HuntTxidResult> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const budgetMs = Math.max(0, options.seconds) * 1000;
  const deadline = startedAt + budgetMs;
  const createWorker = options.createWorker ?? createHuntWorker;
  const workerCount = Math.max(1, options.workerCount ?? defaultWorkerCount());

  if (options.signal?.aborted) return { status: 'aborted', attempts: 0, elapsedMs: 0 };

  const workers: HuntWorkerLike[] = [];
  for (let index = 0; index < workerCount; index++) {
    const worker = createWorker();
    if (!worker) break;
    workers.push(worker);
  }
  if (workers.length === 0) return huntInline(template, options, now, deadline, startedAt);

  const attemptsByWorker = Array.from({ length: workers.length }, () => 0);
  const totalAttempts = () => attemptsByWorker.reduce((sum, count) => sum + count, 0);
  const report = () => {
    const elapsedMs = now() - startedAt;
    const attempts = totalAttempts();
    options.onProgress?.({
      attempts,
      elapsedMs,
      hashRate: elapsedMs > 0 ? (attempts * 1000) / elapsedMs : 0,
      seconds: options.seconds,
      targetZeros: options.targetZeros,
    });
  };

  return new Promise<HuntTxidResult>((resolve) => {
    let settled = false;
    let exhausted = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const progressTimer = setInterval(report, PROGRESS_INTERVAL_MS);

    const finish = (result: HuntTxidResult) => {
      if (settled) return;
      settled = true;
      clearInterval(progressTimer);
      for (const timer of timers) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      for (const worker of workers) worker.terminate();
      report();
      resolve(result);
    };
    const elapsed = () => now() - startedAt;
    const onAbort = () => finish({ status: 'aborted', attempts: totalAttempts(), elapsedMs: elapsed() });
    options.signal?.addEventListener('abort', onAbort);
    timers.push(setTimeout(
      () => finish({ status: 'not_found', attempts: totalAttempts(), elapsedMs: elapsed() }),
      budgetMs,
    ));

    const slice = Math.floor(LOCKTIME_NONCE_COUNT / workers.length);
    workers.forEach((worker, index) => {
      worker.addEventListener('message', ({ data }) => {
        if (settled) return;
        switch (data.type) {
          case 'progress':
            attemptsByWorker[index] = data.attempts;
            break;
          case 'found':
            attemptsByWorker[index] = data.attempts;
            finish({
              status: 'found',
              nonce: data.nonce,
              txid: data.txid,
              zeroCount: data.zeroCount,
              attempts: totalAttempts(),
              elapsedMs: elapsed(),
            });
            break;
          case 'exhausted':
            attemptsByWorker[index] = data.attempts;
            exhausted++;
            if (exhausted === workers.length) {
              finish({ status: 'not_found', attempts: totalAttempts(), elapsedMs: elapsed() });
            }
            break;
          case 'error':
            // One worker failing leaves the others hunting; if every worker fails the deadline
            // ends the hunt with nothing found, which is the honest outcome.
            exhausted++;
            if (exhausted === workers.length) {
              finish({ status: 'not_found', attempts: totalAttempts(), elapsedMs: elapsed() });
            }
            break;
        }
      });
      worker.addEventListener('error', () => {
        if (settled) return;
        exhausted++;
        if (exhausted === workers.length) {
          finish({ status: 'not_found', attempts: totalAttempts(), elapsedMs: elapsed() });
        }
      });
      const startNonce = index * slice;
      const endNonce = index === workers.length - 1 ? LOCKTIME_NONCE_COUNT : startNonce + slice;
      worker.postMessage({
        message: template.message,
        nonceOffset: template.nonceOffset,
        startNonce,
        endNonce,
        targetZeros: options.targetZeros,
        batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      });
    });
  });
}

async function huntInline(
  template: HuntTemplate,
  options: HuntTxidOptions,
  now: () => number,
  deadline: number,
  startedAt: number,
): Promise<HuntTxidResult> {
  const hasher = new MutableSha256d(template.message, template.nonceOffset);
  const batchSize = options.batchSize ?? INLINE_BATCH_SIZE;
  const end = LOCKTIME_NONCE_COUNT;
  let nonce = 0;
  let attempts = 0;
  let lastReport = startedAt;
  const elapsed = () => now() - startedAt;
  while (nonce < end) {
    if (options.signal?.aborted) return { status: 'aborted', attempts, elapsedMs: elapsed() };
    if (now() >= deadline) break;
    const count = Math.min(batchSize, end - nonce);
    const result = mineRange(template.message, template.nonceOffset, nonce, count, options.targetZeros, hasher);
    attempts += result.attempts;
    nonce += count;
    if (result.found) {
      return { status: 'found', ...result.found, attempts, elapsedMs: elapsed() };
    }
    if (now() - lastReport >= PROGRESS_INTERVAL_MS) {
      lastReport = now();
      const elapsedMs = elapsed();
      options.onProgress?.({
        attempts,
        elapsedMs,
        hashRate: elapsedMs > 0 ? (attempts * 1000) / elapsedMs : 0,
        seconds: options.seconds,
        targetZeros: options.targetZeros,
      });
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return { status: 'not_found', attempts, elapsedMs: elapsed() };
}
