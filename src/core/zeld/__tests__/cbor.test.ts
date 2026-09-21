import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { decodeCborUintArray, encodeCborUint, encodeCborUintArray, zeldDistributionScript } from '@/core/zeld/cbor';

describe('CBOR unsigned integers', () => {
  it.each([
    [0n, '00'],
    [23n, '17'],
    [24n, '1818'],
    [255n, '18ff'],
    [256n, '190100'],
    [65535n, '19ffff'],
    [65536n, '1a00010000'],
    [0xffff_ffffn, '1affffffff'],
    [0x1_0000_0000n, '1b0000000100000000'],
    [409_600_000_000n, '1b0000005f5e100000'],
  ])('encodes %s canonically as %s', (value, hex) => {
    expect(bytesToHex(encodeCborUint(value))).toBe(hex);
  });

  it('refuses negatives and values past 64 bits', () => {
    expect(() => encodeCborUint(-1n)).toThrow(RangeError);
    expect(() => encodeCborUint(2n ** 64n)).toThrow(RangeError);
  });

  it('matches the reference miner example for [600, 300, 100, 42]', () => {
    // From zeldhash-miner cbor.rs: 0x84, 0x19 0x02 0x58, 0x19 0x01 0x2c, 0x18 0x64, 0x18 0x2a.
    expect(bytesToHex(encodeCborUintArray([600n, 300n, 100n, 42n]))).toBe('8419025819012c18641 82a'.replace(/ /g, ''));
  });

  it('round-trips arrays of every width', () => {
    const values = [0n, 23n, 24n, 255n, 256n, 65535n, 65536n, 0xffff_ffffn, 0x1_0000_0000n, 2n ** 64n - 1n];
    expect(decodeCborUintArray(encodeCborUintArray(values))).toEqual(values);
    expect(decodeCborUintArray(encodeCborUintArray([]))).toEqual([]);
  });
});

describe('zeldDistributionScript', () => {
  it('is OP_RETURN, one push, ZELD, then the CBOR array', () => {
    const script = zeldDistributionScript([409_600_000_000n, 100_000_000n]);
    expect(script[0]).toBe(0x6a);
    expect(script[1]).toBe(script.length - 2);
    expect(bytesToHex(script.subarray(2, 6))).toBe('5a454c44');
    expect(decodeCborUintArray(script.subarray(6))).toEqual([409_600_000_000n, 100_000_000n]);
  });

  it('refuses a payload that would need a long push', () => {
    expect(() => zeldDistributionScript(Array.from({ length: 30 }, () => 2n ** 40n))).toThrow(RangeError);
  });
});
