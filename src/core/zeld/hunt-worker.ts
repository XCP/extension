/**
 * Web Worker that grinds one slice of the nonce space for a ZELD txid.
 *
 * The loop is synchronous, so the worker cannot hear a stop message; the coordinator ends a hunt
 * by terminating the worker. Progress is posted between batches with the best qualifying txid so
 * far, so the coordinator can settle for it at the deadline or on request. A legacy job carries
 * key-equivalent constants; they live only in this worker's memory and die with it.
 */

import type { HuntWorkerRequest, HuntWorkerResponse } from '@/core/zeld/huntWorkerProtocol';
import { createMiner } from '@/core/zeld/mineJob';
import type { MineRangeFound } from '@/core/zeld/mineRange';

function post(response: HuntWorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<HuntWorkerRequest>) => {
  try {
    const { job, startNonce, endNonce, targetZeros, stopZeros, batchSize } = event.data;
    const miner = createMiner(job);
    let nonce = startNonce;
    let attempts = 0;
    let best: MineRangeFound | undefined;
    while (nonce < endNonce) {
      const count = Math.min(batchSize, endNonce - nonce);
      const result = miner.mine(nonce, count, targetZeros, stopZeros);
      attempts += result.attempts;
      nonce += count;
      if (result.best && (!best || result.best.zeroCount > best.zeroCount)) best = result.best;
      if (result.stopped && best) {
        post({ type: 'found', attempts, best });
        return;
      }
      post({ type: 'progress', attempts, ...(best ? { best } : {}) });
    }
    post({ type: 'exhausted', attempts, ...(best ? { best } : {}) });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'hunt worker failed' });
  }
});
