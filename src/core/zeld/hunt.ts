/**
 * Run a time-boxed hunt for a txid with leading zeros across Web Workers, over whichever job
 * `mineJob.ts` describes.
 *
 * The nonce space (`LOCKTIME_NONCE_COUNT` values) is split into one contiguous slice per worker.
 * A txid with `stopZeros` ends the hunt at once. A txid with `targetZeros` is kept as the best so
 * far while the hunt goes on for a rarer one; the deadline, the caller's `acceptEarly` signal or
 * every slice running out then settles for the best in hand. The caller's abort signal discards
 * everything. Workers are always terminated on the way out, so a hunt never outlives the compose
 * that started it.
 *
 * Without `Worker` (unit tests, an unusual runtime) the hunt runs on the calling thread in short
 * batches, yielding to the event loop between them.
 */

import type { HuntWorkerRequest, HuntWorkerResponse } from '@/core/zeld/huntWorkerProtocol';
import { huntLegacySignaturePool, type LegacySignaturePoolJob } from '@/core/zeld/legacySignaturePool';
import { createMiner, type HuntJob } from '@/core/zeld/mineJob';
import type { MineRangeFound } from '@/core/zeld/mineRange';
import { LOCKTIME_NONCE_COUNT } from '@/core/zeld/protocol';
import type { ZeldHuntProgress } from '@/core/zeld/types';

export type HuntTxidResult =
  | { status: 'found'; nonce: number; txid: string; zeroCount: number; attempts: number; elapsedMs: number; signedTx?: Uint8Array }
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
  /** Leading zeros a txid needs to be worth keeping. */
  targetZeros: number;
  /** Leading zeros that end the hunt at once; defaults to `targetZeros`. */
  stopZeros?: number;
  /** Discards the hunt. Signing callers must treat this as cancellation, not consent to sign. */
  signal?: AbortSignal;
  /** Ends hunting, keeping the best txid in hand if one exists. */
  acceptEarly?: AbortSignal;
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
const INLINE_BATCH_SIZE = 1_000;
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

function better(candidate: MineRangeFound | undefined, best: MineRangeFound | undefined): MineRangeFound | undefined {
  if (!candidate) return best;
  if (!best || candidate.zeroCount > best.zeroCount) return candidate;
  return best;
}

function settled(best: MineRangeFound | undefined, attempts: number, elapsedMs: number): HuntTxidResult {
  return best ? { status: 'found', ...best, attempts, elapsedMs } : { status: 'not_found', attempts, elapsedMs };
}

export async function huntTxid(job: HuntJob | LegacySignaturePoolJob, options: HuntTxidOptions): Promise<HuntTxidResult> {
  // Signing closures stay local, including on browsers that support background workers.
  if (job.kind === 'legacy-signature-pool') return huntLegacySignaturePool(job, options);
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const budgetMs = Math.max(0, options.seconds) * 1000;
  const deadline = startedAt + budgetMs;
  const stopZeros = options.stopZeros ?? options.targetZeros;
  const createWorker = options.createWorker ?? createHuntWorker;
  const workerCount = Math.max(1, options.workerCount ?? defaultWorkerCount());

  if (options.signal?.aborted) return { status: 'aborted', attempts: 0, elapsedMs: 0 };
  if (!(budgetMs > 0) || options.acceptEarly?.aborted) return { status: 'not_found', attempts: 0, elapsedMs: 0 };

  const workers: HuntWorkerLike[] = [];
  for (let index = 0; index < workerCount; index++) {
    try {
      const worker = createWorker();
      if (!worker) break;
      workers.push(worker);
    } catch {
      break;
    }
  }
  if (workers.length === 0) return huntInline(job, options, stopZeros, now, deadline, startedAt);

  const attemptsByWorker = Array.from({ length: workers.length }, () => 0);
  const totalAttempts = () => attemptsByWorker.reduce((sum, count) => sum + count, 0);
  let best: MineRangeFound | undefined;
  const report = () => {
    const elapsedMs = now() - startedAt;
    const attempts = totalAttempts();
    options.onProgress?.({
      attempts,
      elapsedMs,
      hashRate: elapsedMs > 0 ? (attempts * 1000) / elapsedMs : 0,
      seconds: options.seconds,
      targetZeros: options.targetZeros,
      ...(best ? { bestZeroCount: best.zeroCount } : {}),
    });
  };

  return new Promise<HuntTxidResult>((resolve) => {
    let finished = false;
    let exhausted = 0;
    const completed = new Set<number>();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const progressTimer = setInterval(report, PROGRESS_INTERVAL_MS);

    const finish = (result: HuntTxidResult) => {
      if (finished) return;
      finished = true;
      clearInterval(progressTimer);
      for (const timer of timers) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      options.acceptEarly?.removeEventListener('abort', onAccept);
      workers.forEach((worker, index) => { if (!completed.has(index)) worker.terminate(); });
      report();
      resolve(result);
    };
    const elapsed = () => now() - startedAt;
    const settle = () => finish(settled(best, totalAttempts(), elapsed()));
    const onAbort = () => finish({ status: 'aborted', attempts: totalAttempts(), elapsedMs: elapsed() });
    const onAccept = settle;
    options.signal?.addEventListener('abort', onAbort);
    options.acceptEarly?.addEventListener('abort', onAccept);
    if (options.signal?.aborted) { onAbort(); return; }
    if (options.acceptEarly?.aborted) queueMicrotask(onAccept);
    timers.push(setTimeout(settle, Math.max(0, deadline - now())));

    const oneDown = (index: number) => {
      if (finished || completed.has(index)) return;
      completed.add(index);
      workers[index]!.terminate();
      exhausted++;
      if (exhausted === workers.length) settle();
    };
    const slice = Math.floor(LOCKTIME_NONCE_COUNT / workers.length);
    workers.forEach((worker, index) => {
      if (finished) return;
      worker.addEventListener('message', ({ data }) => {
        if (finished || completed.has(index)) return;
        switch (data.type) {
          case 'progress':
            attemptsByWorker[index] = data.attempts;
            best = better(data.best, best);
            break;
          case 'found':
            attemptsByWorker[index] = data.attempts;
            best = better(data.best, best);
            settle();
            break;
          case 'exhausted':
            attemptsByWorker[index] = data.attempts;
            best = better(data.best, best);
            oneDown(index);
            break;
          case 'error':
            // One worker failing leaves the others hunting; if every worker fails the hunt settles
            // for whatever was found, which is the honest outcome.
            oneDown(index);
            break;
        }
      });
      worker.addEventListener('error', () => {
        oneDown(index);
      });
      const startNonce = index * slice;
      const endNonce = index === workers.length - 1 ? LOCKTIME_NONCE_COUNT : startNonce + slice;
      try {
        worker.postMessage({
          job,
          startNonce,
          endNonce,
          targetZeros: options.targetZeros,
          stopZeros,
          batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
        });
      } catch {
        oneDown(index);
      }
    });
  });
}

async function huntInline(
  job: HuntJob,
  options: HuntTxidOptions,
  stopZeros: number,
  now: () => number,
  deadline: number,
  startedAt: number,
): Promise<HuntTxidResult> {
  const miner = createMiner(job);
  let batchSize = options.batchSize ?? INLINE_BATCH_SIZE;
  const end = LOCKTIME_NONCE_COUNT;
  let nonce = 0;
  let attempts = 0;
  let best: MineRangeFound | undefined;
  let lastReport = startedAt;
  const elapsed = () => now() - startedAt;
  while (nonce < end) {
    if (options.signal?.aborted) return { status: 'aborted', attempts, elapsedMs: elapsed() };
    if (now() >= deadline || options.acceptEarly?.aborted) break;
    const count = Math.min(batchSize, end - nonce);
    const batchStarted = now();
    const result = miner.mine(nonce, count, options.targetZeros, stopZeros);
    if (options.batchSize === undefined) {
      // Aim for short 16ms slices, adapting to device speed and the number of legacy inputs.
      // A real timer yield lets pending wallet lock/RPC messages run between slices.
      batchSize = Math.max(1, Math.min(20_000, Math.round(count * 16 / Math.max(1, now() - batchStarted))));
    }
    attempts += result.attempts;
    nonce += count;
    best = better(result.best, best);
    if (result.stopped) break;
    if (now() - lastReport >= PROGRESS_INTERVAL_MS) {
      lastReport = now();
      const elapsedMs = elapsed();
      options.onProgress?.({
        attempts,
        elapsedMs,
        hashRate: elapsedMs > 0 ? (attempts * 1000) / elapsedMs : 0,
        seconds: options.seconds,
        targetZeros: options.targetZeros,
        ...(best ? { bestZeroCount: best.zeroCount } : {}),
      });
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return settled(best, attempts, elapsed());
}
