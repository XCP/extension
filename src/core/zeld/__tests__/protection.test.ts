import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { assessZeldExposure, firstSpendableOutputPays } from '@/core/zeld/protection';
import { opReturnScript, PREV_TXID, SOURCE_ADDRESS, SOURCE_P2WPKH, unsignedRawTx } from './fixtures';

const ZELD_TXID = '000000' + PREV_TXID.slice(6);
const CLEAN_TXID = 'abcdef' + PREV_TXID.slice(6);
const otherScript = hexToBytes('0014' + '7'.repeat(40));

/** A parent that cannot be read; the heuristic then treats a six-zero output as ZELD-bearing. */
const noParent = async () => null;

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
      { fetchUtxos, fetchParent: noParent },
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
      { fetchUtxos, fetchParent: noParent },
    );
    expect(exposure).toEqual({ exposed: [`${ZELD_TXID}:1`], carriedForward: [], apiUnavailable: true });
  });

  it('never calls the indexer when told not to', async () => {
    const fetchUtxos = vi.fn(async () => []);
    const exposure = await assessZeldExposure(btcSend([{ txid: ZELD_TXID, index: 0 }]), SOURCE_ADDRESS, { fetchUtxos, useIndexer: false, fetchParent: noParent });
    expect(fetchUtxos).not.toHaveBeenCalled();
    expect(exposure.exposed).toEqual([`${ZELD_TXID}:0`]);
    expect(exposure.apiUnavailable).toBe(false);
  });

  it('treats unparseable bytes as nothing to protect', async () => {
    expect(await assessZeldExposure('nope', SOURCE_ADDRESS, { useIndexer: false })).toEqual({
      exposed: [], carriedForward: [], apiUnavailable: false,
    });
  });

  describe('six-zero parents', () => {
    // A hunted enhanced send: OP_RETURN first, so the reward sits on vout 1, not vout 0.
    const parent = enhancedSend([{ txid: CLEAN_TXID, index: 0 }]);
    const parentTxid = parseRawTransactionLocally(parent)!.txid;
    const fetchParent = async (txid: string) => (txid === parentTxid ? parent : null);

    it('flags only the parent output a reward could have landed on', async () => {
      const options = { useIndexer: false, fetchParent, isZeldTxid: (txid: string) => txid === parentTxid };
      const spendsChange = await assessZeldExposure(btcSend([{ txid: parentTxid, index: 1 }]), SOURCE_ADDRESS, options);
      expect(spendsChange.exposed).toEqual([`${parentTxid}:1`]);
      // vout 0 is the parent's OP_RETURN; a spend of it cannot even exist, but the classifier must
      // not call it ZELD-bearing, and the same holds for any output after the first spendable one.
      const spendsOther = await assessZeldExposure(btcSend([{ txid: parentTxid, index: 0 }]), SOURCE_ADDRESS, options);
      expect(spendsOther.exposed).toEqual([]);
    });

    it('clears the clean change a park leaves behind, and keeps its small output protected', async () => {
      // A park: small own output first (ZELD), clean change second, then the distribution.
      const park = unsignedRawTx({
        outputs: [
          { script: SOURCE_P2WPKH.script, amount: 330n },
          { script: SOURCE_P2WPKH.script, amount: 90_000n },
          { script: opReturnScript(8), amount: 0n },
        ],
      });
      const parkTxid = parseRawTransactionLocally(park)!.txid;
      const options = {
        useIndexer: false,
        fetchParent: async (txid: string) => (txid === parkTxid ? park : null),
        isZeldTxid: (txid: string) => txid === parkTxid,
      };
      expect((await assessZeldExposure(btcSend([{ txid: parkTxid, index: 1 }]), SOURCE_ADDRESS, options)).exposed).toEqual([]);
      expect((await assessZeldExposure(btcSend([{ txid: parkTxid, index: 0 }]), SOURCE_ADDRESS, options)).exposed).toEqual([`${parkTxid}:0`]);
    });

    it('treats an unreadable parent as ZELD-bearing rather than guessing clean', async () => {
      const exposure = await assessZeldExposure(
        btcSend([{ txid: ZELD_TXID, index: 3 }]),
        SOURCE_ADDRESS,
        { useIndexer: false, fetchParent: async () => { throw new Error('offline'); } },
      );
      expect(exposure.exposed).toEqual([`${ZELD_TXID}:3`]);
    });
  });
});
