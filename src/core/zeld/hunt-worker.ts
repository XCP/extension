/**
 * Web Worker that grinds one slice of the nonce space for a ZELD txid.
 *
 * The loop is synchronous, so the worker cannot hear a stop message; the coordinator ends a hunt
 * by terminating the worker. Progress is posted between batches with the best qualifying txid so
 * far, so the coordinator can settle for it at the deadline or on request.
 */

import type { HuntWorkerRequest, HuntWorkerResponse } from '@/core/zeld/huntWorkerProtocol';
import { type MineRangeFound, mineRange } from '@/core/zeld/mineRange';
import { MutableSha256d } from '@/core/zeld/sha256d';

function post(response: HuntWorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<HuntWorkerRequest>) => {
  try {
    const { message, nonceOffset, startNonce, endNonce, targetZeros, stopZeros, batchSize } = event.data;
    const hasher = new MutableSha256d(message, nonceOffset);
    let nonce = startNonce;
    let attempts = 0;
    let best: MineRangeFound | undefined;
    while (nonce < endNonce) {
      const count = Math.min(batchSize, endNonce - nonce);
      const result = mineRange(message, nonceOffset, nonce, count, targetZeros, hasher, stopZeros);
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
