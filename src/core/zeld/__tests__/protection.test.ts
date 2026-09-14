import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { assessZeldExposure, firstSpendableOutputPays } from '@/core/zeld/protection';
import { opReturnScript, PREV_TXID, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from './fixtures';

const ZELD_TXID = '000000' + PREV_TXID.slice(6);
const CLEAN_TXID = 'abcdef' + PREV_TXID.slice(6);
const otherScript = hexToBytes('0014' + '7'.repeat(40));

const enhancedSend = (inputs: Array<{ txid: string; index: number }>) => unsignedRawTx({
  inputs,
  outputs: [
    { script: opReturnScript(), amount: 0n },
    { script: SOURCE_P2WPKH.script, amount: 90_000n },
  ],
});

const btcSend = (inputs: Array<{ txid: string; index: number }>) => unsignedRawTx({
  inputs,
  outputs: [
    { script: otherScript, amount: 5_000n },
    { script: SOURCE_P2WPKH.script, amount: 90_000n },
  ],
});

describe('firstSpendableOutputPays', () => {
  it('skips OP_RETURN outputs and compares scripts', () => {
    expect(firstSpendableOutputPays(enhancedSend([{ txid: CLEAN_TXID, index: 0 }]), SOURCE_ADDRESS)).toBe(true);
    expect(firstSpendableOutputPays(btcSend([{ txid: CLEAN_TXID, index: 0 }]), SOURCE_ADDRESS)).toBe(false);
    expect(firstSpendableOutputPays('zz', SOURCE_ADDRESS)).toBe(false);
  });
});

describe('assessZeldExposure', () => {
  it('finds nothing to protect when no input carries ZELD', async () => {
    const fetchUtxos = vi.fn(async () => []);
    const exposure = await assessZeldExposure(btcSend([{ txid: CLEAN_TXID, index: 0 }]), SOURCE_ADDRESS, { fetchUtxos });
    expect(exposure).toEqual({ exposed: [], carriedForward: [], apiUnavailable: false });
    expect(fetchUtxos).toHaveBeenCalledWith(SOURCE_ADDRESS);
  });

  it('exposes an indexed ZELD input when the recipient comes first', async () => {
    const fetchUtxos = vi.fn(async () => [{ txid: CLEAN_TXID, vout: 0, balance: 5n }]);
    const exposure = await assessZeldExposure(btcSend([{ txid: CLEAN_TXID, index: 0 }]), SOURCE_ADDRESS, { fetchUtxos });
    expect(exposure.exposed).toEqual([`${CLEAN_TXID}:0`]);
  });

  it('skips the indexer when change comes first, since nothing can leave', async () => {
    const fetchUtxos = vi.fn(async () => [{ txid: CLEAN_TXID, vout: 0, balance: 5n }]);
    const exposure = await assessZeldExposure(
      enhancedSend([{ txid: CLEAN_TXID, index: 0 }, { txid: ZELD_TXID, index: 2 }]),
      SOURCE_ADDRESS,
      { fetchUtxos },
    );
    expect(fetchUtxos).not.toHaveBeenCalled();
    // The six-zero output is still named, so the review can say the ZELD rolled forward.
    expect(exposure).toEqual({ exposed: [], carriedForward: [`${ZELD_TXID}:2`], apiUnavailable: false });
  });

  it('recognises a six-zero txid without the indexer', async () => {
    const fetchUtxos = vi.fn(async () => { throw new Error('down'); });
    const exposure = await assessZeldExposure(
      btcSend([{ txid: ZELD_TXID, index: 1 }, { txid: CLEAN_TXID, index: 0 }]),
      SOURCE_ADDRESS,
      { fetchUtxos },
    );
    expect(exposure).toEqual({ exposed: [`${ZELD_TXID}:1`], carriedForward: [], apiUnavailable: true });
  });

  it('never calls the indexer when told not to', async () => {
    const fetchUtxos = vi.fn(async () => []);
    const exposure = await assessZeldExposure(btcSend([{ txid: ZELD_TXID, index: 0 }]), SOURCE_ADDRESS, { fetchUtxos, useIndexer: false });
    expect(fetchUtxos).not.toHaveBeenCalled();
    expect(exposure.exposed).toEqual([`${ZELD_TXID}:0`]);
    expect(exposure.apiUnavailable).toBe(false);
  });

  it('treats unparseable bytes as nothing to protect', async () => {
    expect(await assessZeldExposure('nope', SOURCE_ADDRESS, { useIndexer: false })).toEqual({
      exposed: [], carriedForward: [], apiUnavailable: false,
    });
  });
});
