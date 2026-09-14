/**
 * Web Worker that grinds one slice of the nonce space for a ZELD txid.
 *
 * The loop is synchronous, so the worker cannot hear a stop message; the coordinator ends a hunt
 * by terminating the worker. Progress is posted between batches, and `attempts` in every message
 * is this worker's running total so a lost message cannot skew the count.
 */

import type { HuntWorkerRequest, HuntWorkerResponse } from '@/core/zeld/huntWorkerProtocol';
import { mineRange } from '@/core/zeld/mineRange';
import { MutableSha256d } from '@/core/zeld/sha256d';

function post(response: HuntWorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<HuntWorkerRequest>) => {
  try {
    const { message, nonceOffset, startNonce, endNonce, targetZeros, batchSize } = event.data;
    const hasher = new MutableSha256d(message, nonceOffset);
    let nonce = startNonce;
    let attempts = 0;
    while (nonce < endNonce) {
      const count = Math.min(batchSize, endNonce - nonce);
      const result = mineRange(message, nonceOffset, nonce, count, targetZeros, hasher);
      attempts += result.attempts;
      nonce += count;
      if (result.found) {
        post({ type: 'found', ...result.found, attempts });
        return;
      }
      post({ type: 'progress', attempts });
    }
    post({ type: 'exhausted', attempts });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'hunt worker failed' });
  }
});
