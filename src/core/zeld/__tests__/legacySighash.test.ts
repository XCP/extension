import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { legacySighashPreimage, preimageLockTimeOffset } from '@/core/zeld/legacySighash';
import { opReturnScript, PREV_TXID } from './fixtures';

// A P2PKH scriptPubKey: what a legacy input signs against.
const SCRIPT_CODE = hexToBytes('76a914' + 'ab'.repeat(20) + '88ac');
const OTHER = hexToBytes('76a914' + 'cd'.repeat(20) + '88ac');

function transaction(lockTime: number, inputs = 1): btc.Transaction {
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true, lockTime });
  for (let index = 0; index < inputs; index++) {
    tx.addInput({ txid: hexToBytes(PREV_TXID), index, sequence: 0xffffffff });
  }
  tx.addOutput({ script: opReturnScript(), amount: 0n });
  tx.addOutput({ script: OTHER, amount: 95_000n });
  return tx;
}

/** The library's legacy sighash, which it computes from its own serialization. */
function librarySighash(tx: btc.Transaction, inputIndex: number): string {
  const digest = (tx as unknown as { preimageLegacy: (idx: number, script: Uint8Array, hashType: number) => Uint8Array })
    .preimageLegacy(inputIndex, SCRIPT_CODE, btc.SigHash.ALL);
  return bytesToHex(digest);
}

describe('legacySighashPreimage', () => {
  it('hashes to the sighash @scure/btc-signer computes, for each input of a two-input spend', () => {
    const tx = transaction(0, 2);
    const unsigned = tx.toBytes(true, false);
    for (const index of [0, 1]) {
      const preimage = legacySighashPreimage(unsigned, index, SCRIPT_CODE);
      expect(bytesToHex(sha256(sha256(preimage)))).toBe(librarySighash(tx, index));
    }
  });

  it('keeps the locktime eight bytes from the end, so a patched preimage matches a re-serialized one', () => {
    const preimage = legacySighashPreimage(transaction(0).toBytes(true, false), 0, SCRIPT_CODE);
    const at = preimageLockTimeOffset(preimage);
    new DataView(preimage.buffer).setUint32(at, 0x8123_4567, true);
    expect(bytesToHex(sha256(sha256(preimage)))).toBe(librarySighash(transaction(0x8123_4567), 0));
    expect(preimage.subarray(preimage.length - 4)).toEqual(Uint8Array.of(1, 0, 0, 0));
  });

  it('refuses a witness serialization, a signed input and a missing input', () => {
    const tx = transaction(0);
    const plain = tx.toBytes(true, false);
    const witness = Uint8Array.of(...plain.subarray(0, 4), 0, 1, ...plain.subarray(4));
    expect(() => legacySighashPreimage(witness, 0, SCRIPT_CODE)).toThrow('non-witness');
    expect(() => legacySighashPreimage(tx.toBytes(true, false), 3, SCRIPT_CODE)).toThrow('no such input');
    const signed = new Uint8Array(tx.toBytes(true, false));
    signed[4 + 1 + 36] = 1; // pretend one scriptSig byte follows
    expect(() => legacySighashPreimage(signed, 0, SCRIPT_CODE)).toThrow('signed');
  });
});
