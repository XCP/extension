import * as secp256k1 from '@noble/secp256k1';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { extractPsbtDetails } from '@/core/bitcoin/psbt';
import { estimateSignedPsbtVsize, hasHighPsbtFee } from '@/core/bitcoin/signedVsize';

const PRIVATE_KEY = hex.decode('0101010101010101010101010101010101010101010101010101010101010101');
const PUBLIC_KEY = secp256k1.getPublicKey(PRIVATE_KEY, true);
const P2WPKH = btc.p2wpkh(PUBLIC_KEY);
const P2TR = btc.p2tr(secp256k1.schnorr.getPublicKey(PRIVATE_KEY));
const PAYEE = btc.p2wpkh(secp256k1.getPublicKey(hex.decode('02'.repeat(32)), true));
const INPUT_VALUE = 1_000_000n;

/** A real 1-in-2-out spend: the unsigned PSBT a site sends, and the vsize once it is signed. */
function realSpend(spent: typeof P2WPKH | typeof P2TR, feeRate: number) {
  const build = (fee: bigint) => {
    const tx = new btc.Transaction();
    tx.addInput({
      txid: 'aa'.repeat(32), index: 0,
      witnessUtxo: { script: spent.script, amount: INPUT_VALUE },
      ...('tapInternalKey' in spent ? { tapInternalKey: spent.tapInternalKey } : {}),
    });
    tx.addOutput({ script: PAYEE.script, amount: 400_000n });
    tx.addOutput({ script: spent.script, amount: INPUT_VALUE - 400_000n - fee });
    return tx;
  };
  // Size the signed transaction, then set the fee from its real vsize.
  const sizing = build(1_000n);
  sizing.sign(PRIVATE_KEY);
  sizing.finalize();
  const realVsize = sizing.vsize;
  const fee = BigInt(Math.round(realVsize * feeRate));
  const unsigned = build(fee);
  return { psbtHex: hex.encode(unsigned.toPSBT()), realVsize, fee: Number(fee) };
}

describe('estimateSignedPsbtVsize', () => {
  it('sizes a real 150 sat/vB P2WPKH 1-in-2-out spend near its signed vsize', () => {
    const { psbtHex, realVsize, fee } = realSpend(P2WPKH, 150);
    const details = extractPsbtDetails(psbtHex);
    expect(details.inputs[0]?.scriptType).toBe('p2wpkh');
    const estimate = estimateSignedPsbtVsize(details)!;
    expect(Math.abs(estimate - realVsize)).toBeLessThanOrEqual(2);
    expect(fee / estimate).toBeGreaterThan(145);
    expect(fee / estimate).toBeLessThan(155);
    // The old estimate (unsigned bytes plus 110 per input) read this as ~95 sat/vB.
    expect(fee / (details.rawTxHex.length / 2 + 110)).toBeLessThan(100);
  });

  it('sizes a P2TR key-path spend near its signed vsize', () => {
    const { psbtHex, realVsize } = realSpend(P2TR, 20);
    const details = extractPsbtDetails(psbtHex);
    expect(details.inputs[0]?.scriptType).toBe('p2tr');
    expect(Math.abs(estimateSignedPsbtVsize(details)! - realVsize)).toBeLessThanOrEqual(2);
  });

  it('has nothing to size without inputs', () => {
    expect(estimateSignedPsbtVsize({ inputs: [], outputs: [] })).toBeUndefined();
  });
});

describe('hasHighPsbtFee', () => {
  it('warns on a real 150 sat/vB spend when the network asks for 10', () => {
    const details = extractPsbtDetails(realSpend(P2WPKH, 150).psbtHex);
    expect(hasHighPsbtFee(details, 10)).toBe(true);
  });

  it('does not warn on an ordinary rate', () => {
    const details = extractPsbtDetails(realSpend(P2WPKH, 12).psbtHex);
    expect(hasHighPsbtFee(details, 10)).toBe(false);
  });
});
