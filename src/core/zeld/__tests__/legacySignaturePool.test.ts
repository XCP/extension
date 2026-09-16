import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { huntTxid } from '@/core/zeld/hunt';
import { prepareLegacyHunt, verifyLegacySignatures } from '@/core/zeld/legacyHunt';
import { createLegacySignaturePoolJob } from '@/core/zeld/legacySignaturePool';

function fixture() {
  const key = new Uint8Array(32).fill(17);
  const script = p2pkh(getPublicKey(key)).script;
  const tx = new Transaction();
  for (let i = 0; i < 2; i++) tx.addInput({ txid: new Uint8Array(32).fill(18), index: i });
  tx.addOutput({ script, amount: 90_000n });
  const template = prepareLegacyHunt(tx.toBytes(true, false), [script, script], key, true);
  return { template, job: createLegacySignaturePoolJob(template, key) };
}

describe('legacy signature combinations', () => {
  it.each([0, -1, NaN])('does no signing for an unusable budget (%s)', async seconds => {
    const { job } = fixture();
    const sign = vi.spyOn(job, 'sign');
    expect(await huntTxid(job, { seconds, targetZeros: 6 })).toMatchObject({ status: 'not_found', attempts: 0 });
    expect(sign).not.toHaveBeenCalled();
  });

  it('counts preparation against the deadline and never sends its signing closure to a worker', async () => {
    const { job } = fixture();
    const createWorker = vi.fn();
    const sign = vi.spyOn(job, 'sign');
    let clock = 0;
    const result = await huntTxid(job, { seconds: 0.02, targetZeros: 6, createWorker, now: () => clock++ });
    expect(result.status).toBe('not_found');
    expect(result.attempts).toBe(0);
    expect(sign).toHaveBeenCalled();
    expect(sign.mock.calls.length).toBeLessThan(20);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('yields to cancellation during signature preparation', async () => {
    const { job } = fixture();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);
    const result = await huntTxid(job, { seconds: 10, targetZeros: 6, signal: controller.signal });
    expect(result.status).toBe('aborted');
    expect(result.attempts).toBe(0);
    expect(result.elapsedMs).toBeLessThan(1000);
  });

  it('honors Continue during preparation without returning any candidate', async () => {
    const { job } = fixture();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);
    const result = await huntTxid(job, { seconds: 10, targetZeros: 6, acceptEarly: controller.signal });
    expect(result.status).toBe('not_found');
    expect(result.attempts).toBe(0);
  });

  it('rejects mutations of DER headers, hash types and public keys independently of signature math', () => {
    const { template, job } = fixture();
    expect(() => verifyLegacySignatures(template, job.signed, job.nonce)).not.toThrow();
    const sOffset = template.inputs[0]!.sOffset;
    for (const at of [sOffset - 1, sOffset + 32, sOffset + 35]) {
      const changed = job.signed.slice();
      changed[at] = changed[at]! ^ 1;
      expect(() => verifyLegacySignatures(template, changed, job.nonce)).toThrow('changed outside');
    }
  });
});
