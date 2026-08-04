import { describe, expect, it } from 'vitest';
import { BinaryReadError, bytesToHex, hexToBytes } from '@/core/blockchain/counterparty/unpack/binary';

describe('hexToBytes', () => {
  it('decodes a well-formed string', () => {
    expect(bytesToHex(hexToBytes('4a6f686e'))).toBe('4a6f686e');
  });

  it('accepts either case and an optional 0x prefix', () => {
    expect(bytesToHex(hexToBytes('0xDEADbeef'))).toBe('deadbeef');
  });

  it('decodes an empty string to no bytes', () => {
    expect(hexToBytes('')).toHaveLength(0);
  });

  it('rejects an odd-length string', () => {
    expect(() => hexToBytes('abc')).toThrow(BinaryReadError);
  });

  // `parseInt('9z', 16)` returns 9 rather than NaN, so a per-pair isNaN check passes and the
  // pair decodes to 0x09. These strings used to come back as bytes with no error at all, which
  // matters because unpackCounterpartyMessage hands this untrusted API hex directly.
  it.each([
    ['9z', 'bad trailing nibble'],
    ['0g', 'bad trailing nibble, zero leading'],
    ['a!', 'punctuation'],
    ['7-', 'hyphen'],
    ['ff 0a', 'embedded space'],
  ])('rejects %s (%s) instead of decoding it', (bad) => {
    expect(() => hexToBytes(bad)).toThrow(BinaryReadError);
  });

  it('rejects a bad nibble in the middle of an otherwise valid string', () => {
    expect(() => hexToBytes('4a6f686e6e9z')).toThrow(BinaryReadError);
  });

  it('reports the position of the offending character', () => {
    expect(() => hexToBytes('4a6fzz')).toThrow(/position 4/);
  });
});
