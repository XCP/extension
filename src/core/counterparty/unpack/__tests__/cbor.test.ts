import { describe, expect, it } from 'vitest';
import { decodeCbor } from '../cbor';

describe('decodeCbor', () => {
  it('decodes the canonical value types used by Counterparty messages', () => {
    expect(decodeCbor(new Uint8Array([
      0x85,
      0x18, 0x2a,
      0x20,
      0x62, 0x58, 0x43,
      0x42, 0xaa, 0xbb,
      0xf5,
    ]))).toEqual([
      42n,
      -1n,
      'XC',
      new Uint8Array([0xaa, 0xbb]),
      true,
    ]);
  });

  it('rejects truncated values', () => {
    expect(() => decodeCbor(new Uint8Array([0x62, 0x58]))).toThrow('Unexpected end of CBOR data');
  });

  it('rejects indefinite-length values', () => {
    expect(() => decodeCbor(new Uint8Array([0x9f, 0xff]))).toThrow('Invalid CBOR length');
  });

  it('rejects trailing data', () => {
    expect(() => decodeCbor(new Uint8Array([0x01, 0x02]))).toThrow('Unexpected trailing CBOR data');
  });
});
