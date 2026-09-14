import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { type HuntWorkerLike, huntTxid } from '@/core/zeld/hunt';
import { assessZeldHunt, type HuntTemplate, rawTransactionWithSequence } from '@/core/zeld/huntTemplate';
import type { HuntWorkerRequest, HuntWorkerResponse } from '@/core/zeld/huntWorkerProtocol';
import { mineRange } from '@/core/zeld/mineRange';
import { SEQUENCE_NONCE_BASE, SEQUENCE_NONCE_COUNT } from '@/core/zeld/protocol';
import { enhancedSendRawTx, SOURCE_ADDRESS } from './fixtures';

function template(): HuntTemplate {
  const assessment = assessZeldHunt({
    rawTxHex: enhancedSendRawTx(),
    sourceAddress: SOURCE_ADDRESS,
    addressFormat: AddressFormat.P2WPKH,
  });
  if (!assessment.eligible) throw new Error(assessment.reason);
  return assessment.template;
}

describe('mineRange', () => {
  it('finds a txid with two leading zeros and reports the nonce that produced it', () => {
    const t = template();
    // 1 in 256 per attempt; 20,000 attempts fail with probability e^-78.
    const result = mineRange(t.message, t.nonceOffset, SEQUENCE_NONCE_BASE, 20_000, 2);
    expect(result.found).toBeDefined();
    const found = result.found!;
    expect(found.txid.startsWith('00')).toBe(true);
    expect(found.zeroCount).toBeGreaterThanOrEqual(2);
    expect(result.attempts).toBe(found.nonce - SEQUENCE_NONCE_BASE + 1);
    const patched = rawTransactionWithSequence(enhancedSendRawTx(), found.nonce);
    expect(parseRawTransactionLocally(patched)?.txid).toBe(found.txid);
  });

  it('counts every attempt when nothing qualifies', () => {
    const t = template();
    const result = mineRange(t.message, t.nonceOffset, SEQUENCE_NONCE_BASE, 100, 32);
    expect(result).toEqual({ attempts: 100 });
  });

  it('refuses a range outside 32 bits', () => {
    const t = template();
    expect(() => mineRange(t.message, t.nonceOffset, SEQUENCE_NONCE_BASE, SEQUENCE_NONCE_COUNT + 1, 1)).toThrow(RangeError);
  });
});

/** A worker stand-in that runs the real mining loop synchronously on request. */
class InlineWorker implements HuntWorkerLike {
  private listeners: Array<(event: { data: HuntWorkerResponse }) => void> = [];
  terminated = false;
  postMessage(request: HuntWorkerRequest): void {
    let nonce = request.startNonce;
    let attempts = 0;
    while (nonce < request.endNonce) {
      const count = Math.min(request.batchSize, request.endNonce - nonce);
      const result = mineRange(request.message, request.nonceOffset, nonce, count, request.targetZeros);
      attempts += result.attempts;
      nonce += count;
      if (result.found) {
        this.emit({ type: 'found', ...result.found, attempts });
        return;
      }
      this.emit({ type: 'progress', attempts });
      // Stop long before the nonce space is exhausted; tests never need more than this.
      if (attempts >= 60_000) return;
    }
    this.emit({ type: 'exhausted', attempts });
  }
  terminate(): void {
    this.terminated = true;
  }
  addEventListener(type: 'message' | 'error', listener: (event: any) => void): void {
    if (type === 'message') this.listeners.push(listener);
  }
  private emit(data: HuntWorkerResponse): void {
    // Deliver asynchronously, as a real worker would.
    for (const listener of this.listeners) queueMicrotask(() => listener({ data }));
  }
}

describe('huntTxid', () => {
  it('returns the first worker result and terminates every worker', async () => {
    const workers: InlineWorker[] = [];
    const result = await huntTxid(template(), {
      seconds: 10,
      targetZeros: 2,
      workerCount: 3,
      batchSize: 500,
      createWorker: () => {
        const worker = new InlineWorker();
        workers.push(worker);
        return worker;
      },
    });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.txid.startsWith('00')).toBe(true);
    expect(result.nonce).toBeGreaterThanOrEqual(SEQUENCE_NONCE_BASE);
    expect(workers).toHaveLength(3);
    expect(workers.every(worker => worker.terminated)).toBe(true);
  });

  it('gives up at the deadline when no worker finds anything', async () => {
    vi.useFakeTimers();
    try {
      const silent: HuntWorkerLike = {
        postMessage: () => {},
        terminate: vi.fn(),
        addEventListener: () => {},
      };
      const onProgress = vi.fn();
      const pending = huntTxid(template(), {
        seconds: 2,
        targetZeros: 6,
        workerCount: 1,
        createWorker: () => silent,
        onProgress,
      });
      await vi.advanceTimersByTimeAsync(2_100);
      const result = await pending;
      expect(result.status).toBe('not_found');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(2_000);
      expect(silent.terminate).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.lastCall?.[0]).toMatchObject({ seconds: 2, targetZeros: 6 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports not found once every worker exhausts its slice', async () => {
    const created: Array<{ terminate: ReturnType<typeof vi.fn> }> = [];
    const result = await huntTxid(template(), {
      seconds: 30,
      targetZeros: 32,
      workerCount: 2,
      createWorker: () => {
        const listeners: Array<(event: { data: HuntWorkerResponse }) => void> = [];
        const worker: HuntWorkerLike = {
          postMessage: () => {
            for (const listener of listeners) queueMicrotask(() => listener({ data: { type: 'exhausted', attempts: 10 } }));
          },
          terminate: vi.fn(),
          addEventListener: (type, listener) => {
            if (type === 'message') listeners.push(listener as (event: { data: HuntWorkerResponse }) => void);
          },
        };
        created.push(worker as unknown as { terminate: ReturnType<typeof vi.fn> });
        return worker;
      },
    });
    expect(result).toMatchObject({ status: 'not_found', attempts: 20 });
    expect(created.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
  });

  it('returns aborted without starting when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const createWorker = vi.fn();
    const result = await huntTxid(template(), {
      seconds: 30,
      targetZeros: 6,
      signal: controller.signal,
      createWorker,
    });
    expect(result.status).toBe('aborted');
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('terminates workers and reports aborted when the signal fires mid-hunt', async () => {
    const controller = new AbortController();
    const silent: HuntWorkerLike = { postMessage: () => {}, terminate: vi.fn(), addEventListener: () => {} };
    const pending = huntTxid(template(), {
      seconds: 30,
      targetZeros: 6,
      workerCount: 1,
      signal: controller.signal,
      createWorker: () => silent,
    });
    controller.abort();
    expect((await pending).status).toBe('aborted');
    expect(silent.terminate).toHaveBeenCalledTimes(1);
  });

  it('hunts inline when no worker can be created', async () => {
    const onProgress = vi.fn();
    const result = await huntTxid(template(), {
      seconds: 10,
      targetZeros: 2,
      createWorker: () => null,
      batchSize: 200,
      onProgress,
    });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.txid.startsWith('00')).toBe(true);
  });

  it('honours the deadline inline', async () => {
    let clock = 0;
    const result = await huntTxid(template(), {
      seconds: 1,
      targetZeros: 32,
      createWorker: () => null,
      batchSize: 100,
      now: () => (clock += 400),
    });
    expect(result.status).toBe('not_found');
    expect(result.attempts).toBeGreaterThan(0);
  });
});
