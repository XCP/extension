import { describe, expect, it } from 'vitest';
import {
  parseSecPublicKey,
  publicKeyMatchesAddress,
  publicKeyPointId,
} from '@/core/bitcoin/publicKeyIdentity';

const COMPRESSED = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const UNCOMPRESSED =
  '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
  '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';

describe('SEC public-key identity', () => {
  it('treats compressed and uncompressed serialization as the same signing point', () => {
    expect(publicKeyPointId(COMPRESSED)).toBe(publicKeyPointId(UNCOMPRESSED));
  });

  it('keeps exact serialization significant when binding a P2PKH address', () => {
    expect(publicKeyMatchesAddress(COMPRESSED, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH')).toBe(true);
    expect(publicKeyMatchesAddress(UNCOMPRESSED, '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm')).toBe(true);
    expect(publicKeyMatchesAddress(COMPRESSED, '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm')).toBe(false);
    expect(publicKeyMatchesAddress(UNCOMPRESSED, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH')).toBe(false);
  });

  it('validates that SEC-shaped bytes are actually on secp256k1', () => {
    expect(parseSecPublicKey(`02${'00'.repeat(32)}`)).toBeNull();
    expect(parseSecPublicKey('not-a-key')).toBeNull();
  });
});
