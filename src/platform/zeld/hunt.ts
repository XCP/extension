import { type HuntWorkerLike, huntTxid as runHunt } from '@/core/zeld/hunt';

const MAX_WORKERS = 8;

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

export const huntTxid: typeof runHunt = (job, options) => {
  if (job.kind === 'legacy-signature-pool') return runHunt(job, options);
  return runHunt(job, {
    ...options,
    createWorker: options.createWorker ?? createHuntWorker,
    workerCount: options.workerCount ?? defaultWorkerCount(),
  });
};
