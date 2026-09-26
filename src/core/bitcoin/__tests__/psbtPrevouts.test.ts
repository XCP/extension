import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { PrevoutMismatchError, verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';

const PUBLIC_KEY = getPublicKey(hexToBytes('01'.padStart(64, '0')), true);
const SCRIPT = p2wpkh(PUBLIC_KEY).script;

function fixture(witnessAmount = 25_000n) {
  const parent = new Transaction();
  parent.addInput({ txid: hexToBytes('ab'.repeat(32)), index: 0 });
  parent.addOutput({ script: SCRIPT, amount: 25_000n });

  const spending = new Transaction();
  spending.addInput({
    txid: hexToBytes(parent.id),
    index: 0,
    witnessUtxo: { script: SCRIPT, amount: witnessAmount },
  });
  spending.addOutput({ script: SCRIPT, amount: 24_000n });

  return {
    parent,
    parentHex: bytesToHex(parent.toBytes(true, true)),
    psbtHex: bytesToHex(spending.toPSBT()),
  };
}

describe('verifyPsbtPrevouts', () => {
  it('resolves every outpoint from its raw parent transaction', async () => {
    const { parent, parentHex, psbtHex } = fixture();
    const fetchRawTransaction = vi.fn(async () => parentHex);

    const verified = await verifyPsbtPrevouts(psbtHex, { fetchRawTransaction });

    expect(fetchRawTransaction).toHaveBeenCalledWith(parent.id);
    expect(verified.prevouts).toHaveLength(1);
    expect(verified.prevouts[0]).toMatchObject({
      txid: parent.id,
      vout: 0,
      amount: 25_000n,
    });
    expect(bytesToHex(verified.prevouts[0]!.script)).toBe(bytesToHex(SCRIPT));
  });

  it('rejects a forged witness amount', async () => {
    const { parentHex, psbtHex } = fixture(99_000n);
    await expect(verifyPsbtPrevouts(psbtHex, {
      fetchRawTransaction: async () => parentHex,
    })).rejects.toThrow(/does not match its real previous output/);
    // Typed, so the approval screen can say the site's data is wrong rather than "Signing failed".
    await expect(verifyPsbtPrevouts(psbtHex, {
      fetchRawTransaction: async () => parentHex,
    })).rejects.toBeInstanceOf(PrevoutMismatchError);
  });

  it('rejects raw transaction bytes for a different txid', async () => {
    const { psbtHex } = fixture();
    const other = fixture();
    other.parent.addOutput({ script: SCRIPT, amount: 1n });
    await expect(verifyPsbtPrevouts(psbtHex, {
      fetchRawTransaction: async () => bytesToHex(other.parent.toBytes(true, true)),
    })).rejects.toThrow(/does not match PSBT input/);
  });

  it('accepts an explicitly supplied unbroadcast package parent', async () => {
    const { parent, parentHex, psbtHex } = fixture();
    const fetchRawTransaction = vi.fn(async () => null);
    const verified = await verifyPsbtPrevouts(psbtHex, {
      packageTransactions: new Map([[parent.id, parentHex]]),
      fetchRawTransaction,
    });

    expect(verified.prevouts[0]!.txid).toBe(parent.id);
    expect(fetchRawTransaction).not.toHaveBeenCalled();
  });

  it('uses a txid-bound non-witness parent without a network lookup', async () => {
    const { parent } = fixture();
    const spending = new Transaction();
    spending.addInput({
      txid: hexToBytes(parent.id),
      index: 0,
      nonWitnessUtxo: parent.toBytes(true, true),
    });
    spending.addOutput({ script: SCRIPT, amount: 24_000n });
    const fetchRawTransaction = vi.fn(async () => null);

    const verified = await verifyPsbtPrevouts(bytesToHex(spending.toPSBT()), {
      fetchRawTransaction,
    });

    expect(verified.prevouts[0]!.amount).toBe(25_000n);
    expect(fetchRawTransaction).not.toHaveBeenCalled();
  });

  it('can verify only the inputs requested for a partial marketplace signature', async () => {
    const { parent, parentHex } = fixture();
    const spending = new Transaction();
    spending.addInput({
      txid: hexToBytes('00'.repeat(32)),
      index: 0,
      witnessUtxo: { script: SCRIPT, amount: 1n },
    });
    spending.addInput({
      txid: hexToBytes(parent.id),
      index: 0,
      witnessUtxo: { script: SCRIPT, amount: 25_000n },
    });
    spending.addOutput({ script: SCRIPT, amount: 24_000n });

    const verified = await verifyPsbtPrevouts(bytesToHex(spending.toPSBT()), {
      inputIndices: [1],
      fetchRawTransaction: async (txid) => txid === parent.id ? parentHex : null,
    });
    expect(verified.prevouts.map(({ index }) => index)).toEqual([1]);
  });
});

/**
 * Inputs spending one parent share one lookup and one parse. The checks each input gets are the
 * same as before, so a single bad input among many from a shared parent still fails the whole PSBT.
 */
describe('verifyPsbtPrevouts with many inputs from one parent', () => {
  function parentWith(outputs: number, tag = 'ab') {
    const parent = new Transaction();
    parent.addInput({ txid: hexToBytes(tag.repeat(32)), index: 0 });
    for (let i = 0; i < outputs; i++) parent.addOutput({ script: SCRIPT, amount: 10_000n + BigInt(i) });
    return parent;
  }
  function spend(parents: Transaction[], perParent: number, edit?: (i: number, amount: bigint) => { index?: number; amount?: bigint }) {
    const spending = new Transaction();
    let n = 0;
    for (const parent of parents) {
      for (let i = 0; i < perParent; i++, n++) {
        const amount = 10_000n + BigInt(i);
        const changed = edit?.(n, amount) ?? {};
        spending.addInput({
          txid: hexToBytes(parent.id), index: changed.index ?? i,
          witnessUtxo: { script: SCRIPT, amount: changed.amount ?? amount },
        });
      }
    }
    spending.addOutput({ script: SCRIPT, amount: 1_000n });
    return bytesToHex(spending.toPSBT());
  }
  const rawOf = (parent: Transaction) => bytesToHex(parent.toBytes(true, true));

  it('looks each parent up once however many inputs spend it', async () => {
    const first = parentWith(60);
    const second = parentWith(40, 'cd');
    const byId = new Map([[first.id, rawOf(first)], [second.id, rawOf(second)]]);
    const fetchRawTransaction = vi.fn(async (txid: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return byId.get(txid) ?? null;
    });
    const resolveTrustedPrevout = vi.fn(async () => null);
    const psbtHex = spend([first, second], 40);

    const verified = await verifyPsbtPrevouts(psbtHex, { fetchRawTransaction, resolveTrustedPrevout });

    expect(fetchRawTransaction).toHaveBeenCalledTimes(2);
    expect(resolveTrustedPrevout).toHaveBeenCalledTimes(2);
    expect(verified.prevouts).toHaveLength(80);
    verified.prevouts.forEach((prevout, index) => {
      expect(prevout.index).toBe(index);
      expect(prevout.txid).toBe(index < 40 ? first.id : second.id);
      expect(prevout.amount).toBe(10_000n + BigInt(index % 40));
      expect(bytesToHex(prevout.rawTransaction)).toBe(rawOf(index < 40 ? first : second));
    });
  });

  it('still rejects one forged amount among many inputs from the shared parent', async () => {
    const parent = parentWith(50);
    const psbtHex = spend([parent], 50, (i, amount) => (i === 37 ? { amount: amount + 1n } : {}));
    await expect(verifyPsbtPrevouts(psbtHex, { fetchRawTransaction: async () => rawOf(parent) }))
      .rejects.toThrow(/PSBT input 37 does not match its real previous output/);
  });

  it('still rejects one input naming an output the shared parent does not have', async () => {
    const parent = parentWith(10);
    const psbtHex = spend([parent], 10, (i) => (i === 4 ? { index: 99 } : {}));
    await expect(verifyPsbtPrevouts(psbtHex, { fetchRawTransaction: async () => rawOf(parent) }))
      .rejects.toThrow(/does not exist|Wrong output index/);
  });

  it('rejects every input of a parent whose lookup fails, after one attempt', async () => {
    const parent = parentWith(10);
    const fetchRawTransaction = vi.fn(async () => null);
    await expect(verifyPsbtPrevouts(spend([parent], 10), { fetchRawTransaction }))
      .rejects.toThrow(/Could not independently verify previous transaction/);
    expect(fetchRawTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a shared parent whose bytes hash to another txid', async () => {
    const parent = parentWith(10);
    const other = parentWith(10, 'ef');
    await expect(verifyPsbtPrevouts(spend([parent], 10), { fetchRawTransaction: async () => rawOf(other) }))
      .rejects.toBeInstanceOf(PrevoutMismatchError);
  });
});
