import { describe, expect, it } from 'vitest';
import { validateBitcoinAddress } from '@/core/validation/bitcoin';

// PR-gating (non-fuzz) checks for legacy address checksum validation.
describe('validateBitcoinAddress checksum', () => {
  it('accepts valid mainnet P2PKH and P2SH addresses', () => {
    expect(validateBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toMatchObject({
      isValid: true,
      addressFormat: 'P2PKH',
      network: 'mainnet',
    });
    expect(validateBitcoinAddress('3P14159f73E4gFr7JterCCQh9QjiTjiZrG')).toMatchObject({
      isValid: true,
      addressFormat: 'P2SH',
      network: 'mainnet',
    });
  });

  it('rejects a legacy address with a corrupted checksum', () => {
    // Genesis address, last character altered — stays in the base58 alphabet
    // and decodes to the right length/version, but the checksum is wrong.
    expect(validateBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb').isValid).toBe(false);
  });

  it('accepts valid bech32 SegWit addresses', () => {
    expect(validateBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4').isValid).toBe(true);
  });
});
