import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { describe, expect, it, vi } from 'vitest';
import { verifyPsbtPrevouts } from '@/core/bitcoin/psbtPrevouts';

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
