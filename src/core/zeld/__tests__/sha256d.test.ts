import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { countLeadingZeroNibbles } from '@/core/zeld/protocol';
import { MutableSha256d } from '@/core/zeld/sha256d';

/** Deterministic pseudo-random bytes so a failure names its seed. */
function pseudoRandomBytes(seed: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    out[i] = state & 0xff;
  }
  return out;
}

function referenceTxid(message: Uint8Array): string {
  return bytesToHex(Uint8Array.from(sha256(sha256(message))).reverse());
}

describe('MutableSha256d', () => {
  it('matches @noble/hashes for every padding boundary up to four blocks', () => {
    for (let length = 0; length <= 200; length++) {
      const message = pseudoRandomBytes(length + 1, length);
      const hasher = new MutableSha256d(message);
      hasher.hashLeadingZeroNibbles();
      expect(bytesToHex(hasher.digest()), `length ${length}`).toBe(bytesToHex(sha256(sha256(message))));
      expect(hasher.txid(), `length ${length}`).toBe(referenceTxid(message));
    }
  });

  it('reports the leading zero nibbles of the txid, not of the digest', () => {
    // Search a small space until a couple of zeros show up so the count path past zero is covered.
    let seen = 0;
    for (let seed = 1; seed < 20_000 && seen < 5; seed++) {
      const message = pseudoRandomBytes(seed, 131);
      const hasher = new MutableSha256d(message);
      const zeros = hasher.hashLeadingZeroNibbles();
      const txid = referenceTxid(message);
      expect(zeros).toBe(countLeadingZeroNibbles(txid));
      if (zeros > 0) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('rehashes after a four-byte little-endian window is overwritten', () => {
    const message = pseudoRandomBytes(7, 131);
    const hasher = new MutableSha256d(message);
    // Offsets that sit inside one word and offsets that straddle two.
    for (const offset of [0, 1, 2, 3, 42, 61, 127]) {
      for (const value of [0, 1, 0x8000_0000, 0xdead_beef, 0xffff_ffff]) {
        hasher.setUint32LE(offset, value);
        const expected = new Uint8Array(message);
        new DataView(expected.buffer).setUint32(offset, value, true);
        hasher.hashLeadingZeroNibbles();
        expect(hasher.txid(), `offset ${offset} value ${value}`).toBe(referenceTxid(expected));
        message.set(expected);
      }
    }
  });

  it('refuses a window outside the message', () => {
    const hasher = new MutableSha256d(pseudoRandomBytes(3, 10));
    expect(() => hasher.setUint32LE(7, 1)).toThrow(RangeError);
    expect(() => hasher.setUint32LE(-1, 1)).toThrow(RangeError);
    expect(() => hasher.setUint32LE(6, 1)).not.toThrow();
  });
});
