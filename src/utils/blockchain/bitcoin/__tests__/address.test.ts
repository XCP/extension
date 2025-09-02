import { describe, it, expect, vi } from 'vitest';
import { getDerivationPathForAddressFormat, encodeAddress, getAddressFromMnemonic, isValidBase58Address } from '@/utils/blockchain/bitcoin/address';
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import { hexToBytes } from '@noble/hashes/utils';

vi.mock('@/utils/blockchain/counterwallet', () => ({
  getCounterwalletSeed: vi.fn(() => new Uint8Array(64).fill(1))
}));

describe('Bitcoin Address Utilities', () => {
  describe('getDerivationPathForAddressFormat', () => {
    it('should return the correct derivation path for P2PKH', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2PKH)).toBe("m/44'/0'/0'/0");
    });

    it('should return the correct derivation path for P2SH_P2WPKH', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2SH_P2WPKH)).toBe("m/49'/0'/0'/0");
    });

    it('should return the correct derivation path for P2WPKH', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2WPKH)).toBe("m/84'/0'/0'/0");
    });

    it('should return the correct derivation path for P2TR', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.P2TR)).toBe("m/86'/0'/0'/0");
    });

    it('should return the correct derivation path for Counterwallet', () => {
      expect(getDerivationPathForAddressFormat(AddressFormat.Counterwallet)).toBe("m/0'/0");
    });

    it('should throw error for unsupported address type', () => {
      expect(() => getDerivationPathForAddressFormat('invalid' as AddressFormat))
        .toThrow('Unsupported address type: invalid');
    });
  });

  describe('encodeAddress', () => {
    // Known test vector: compressed public key
    const testPubKey = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    
    it('should encode P2PKH address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
      expect(address.length).toBeGreaterThan(25);
      expect(address.length).toBeLessThan(36);
    });

    it('should encode P2SH_P2WPKH address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2SH_P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('3')).toBe(true);
      expect(address.length).toBeGreaterThan(25);
      expect(address.length).toBeLessThan(36);
    });

    it('should encode P2WPKH address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
      expect(address.length).toBe(42); // bech32 P2WPKH is always 42 chars
    });

    it('should encode P2TR address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.P2TR);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1p')).toBe(true);
      expect(address.length).toBe(62); // bech32m P2TR is always 62 chars
    });

    it('should encode Counterwallet address correctly', () => {
      const address = encodeAddress(testPubKey, AddressFormat.Counterwallet);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
      expect(address.length).toBeGreaterThan(25);
      expect(address.length).toBeLessThan(36);
    });

    it('should throw error for unsupported address type', () => {
      expect(() => encodeAddress(testPubKey, 'invalid' as AddressFormat))
        .toThrow('Unsupported address type: invalid');
    });

    it('should handle uncompressed public key', () => {
      const uncompressedPubKey = hexToBytes('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');
      const address = encodeAddress(uncompressedPubKey, AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
    });

    it('should generate different addresses for different public keys', () => {
      const pubKey1 = hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
      const pubKey2 = hexToBytes('02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9');
      
      const address1 = encodeAddress(pubKey1, AddressFormat.P2PKH);
      const address2 = encodeAddress(pubKey2, AddressFormat.P2PKH);
      
      expect(address1).not.toBe(address2);
    });

    it('should generate same address for same public key', () => {
      const address1 = encodeAddress(testPubKey, AddressFormat.P2PKH);
      const address2 = encodeAddress(testPubKey, AddressFormat.P2PKH);
      
      expect(address1).toBe(address2);
    });

    it('should handle empty public key gracefully', () => {
      expect(() => encodeAddress(new Uint8Array(0), AddressFormat.P2PKH))
        .not.toThrow(); // Should not crash, but may produce invalid address
    });

    it('should handle very short public key', () => {
      const shortPubKey = hexToBytes('02');
      expect(() => encodeAddress(shortPubKey, AddressFormat.P2PKH))
        .not.toThrow(); // Should not crash
    });
  });

  describe('getAddressFromMnemonic', () => {
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const testPath = "m/84'/0'/0'/0/0";

    it('should derive P2PKH address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/44'/0'/0'/0/0", AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
    });

    it('should derive P2WPKH address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should derive P2SH_P2WPKH address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/49'/0'/0'/0/0", AddressFormat.P2SH_P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.startsWith('3')).toBe(true);
    });

    it('should derive P2TR address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/86'/0'/0'/0/0", AddressFormat.P2TR);
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1p')).toBe(true);
    });

    it('should derive Counterwallet address from mnemonic', () => {
      const address = getAddressFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.Counterwallet);
      expect(typeof address).toBe('string');
      expect(address.startsWith('1')).toBe(true);
    });

    it('should generate different addresses for different paths', () => {
      const address1 = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/0", AddressFormat.P2WPKH);
      const address2 = getAddressFromMnemonic(testMnemonic, "m/84'/0'/0'/0/1", AddressFormat.P2WPKH);
      
      expect(address1).not.toBe(address2);
    });

    it('should generate same address for same inputs', () => {
      const address1 = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      const address2 = getAddressFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      
      expect(address1).toBe(address2);
    });

    it('should handle different mnemonic lengths', () => {
      // 24-word mnemonic
      const longMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      const address = getAddressFromMnemonic(longMnemonic, testPath, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should throw error for invalid mnemonic', () => {
      const invalidMnemonic = 'invalid mnemonic phrase';
      expect(() => getAddressFromMnemonic(invalidMnemonic, testPath, AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should throw error for invalid derivation path', () => {
      expect(() => getAddressFromMnemonic(testMnemonic, 'invalid/path', AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should handle hardened derivation paths', () => {
      const hardenedPath = "m/84'/0'/0'/0'/0'";
      const address = getAddressFromMnemonic(testMnemonic, hardenedPath, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should handle deep derivation paths', () => {
      const deepPath = "m/84'/0'/0'/0/0/1/2/3";
      const address = getAddressFromMnemonic(testMnemonic, deepPath, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });
  });

  describe('isValidBase58Address', () => {
    it('should validate correct P2PKH addresses', () => {
      const validAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis block coinbase
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv'
      ];

      validAddresses.forEach(address => {
        expect(isValidBase58Address(address)).toBe(true);
      });
    });

    it('should validate correct P2SH addresses', () => {
      const validAddresses = [
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        '33iFwdLuRpW1uK1RTRqsoi8rR4NpDzk66k'
      ];

      validAddresses.forEach(address => {
        expect(isValidBase58Address(address)).toBe(true);
      });
    });

    it('should reject invalid Base58 characters', () => {
      const invalidAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN0', // Contains '0'
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNO', // Contains 'O'
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNI', // Contains 'I'
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfnl'  // Contains 'l'
      ];

      invalidAddresses.forEach(address => {
        expect(isValidBase58Address(address)).toBe(false);
      });
    });

    it('should reject addresses that are too short', () => {
      const shortAddresses = [
        '12345',
        '1A1zP1eP5QGefi2DMPTfTL5S', // 25 chars
        ''
      ];

      shortAddresses.forEach(address => {
        expect(isValidBase58Address(address)).toBe(false);
      });
    });

    it('should reject addresses that are too long', () => {
      const longAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNaExtremelyLongAddressThatExceedsMaxLength';
      expect(isValidBase58Address(longAddress)).toBe(false);
    });

    it('should reject completely invalid strings', () => {
      const invalidStrings = [
        'not-an-address',
        '12345 67890', // Contains space
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // bech32 address
        'xyz123',
        null as any,
        undefined as any,
        123 as any
      ];

      invalidStrings.forEach(str => {
        expect(isValidBase58Address(str)).toBe(false);
      });
    });

    it('should handle edge case lengths', () => {
      // Test exactly 26 characters (minimum valid)
      const minLength = '12345678901234567890123456';
      // Test exactly 35 characters (maximum valid)
      const maxLength = '12345678901234567890123456789012345';
      
      // These may or may not be valid depending on the actual base58 content,
      // but they should not crash the function
      expect(() => isValidBase58Address(minLength)).not.toThrow();
      expect(() => isValidBase58Address(maxLength)).not.toThrow();
    });

    it('should reject malformed base58', () => {
      const malformedAddresses = [
        '1111111111111111111111111111111111111', // All 1s may cause issues
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN@', // Invalid character
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfN#'  // Invalid character
      ];

      malformedAddresses.forEach(address => {
        expect(isValidBase58Address(address)).toBe(false);
      });
    });
  });

  describe('integration tests', () => {
    it('should create valid addresses that pass validation', () => {
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      // Generate P2PKH address and validate it
      const p2pkhAddress = getAddressFromMnemonic(testMnemonic, "m/44'/0'/0'/0/0", AddressFormat.P2PKH);
      expect(isValidBase58Address(p2pkhAddress)).toBe(true);
      
      // Generate P2SH address and validate it
      const p2shAddress = getAddressFromMnemonic(testMnemonic, "m/49'/0'/0'/0/0", AddressFormat.P2SH_P2WPKH);
      expect(isValidBase58Address(p2shAddress)).toBe(true);
    });

    it('should maintain consistency across address types', () => {
      const addressFormats = [
        AddressFormat.P2PKH,
        AddressFormat.P2SH_P2WPKH,
        AddressFormat.P2WPKH,
        AddressFormat.P2TR,
        AddressFormat.Counterwallet
      ];

      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      addressFormats.forEach(addressFormat => {
        const path = getDerivationPathForAddressFormat(addressFormat);
        const fullPath = path + '/0';
        const address = getAddressFromMnemonic(testMnemonic, fullPath, addressFormat);
        
        expect(typeof address).toBe('string');
        expect(address.length).toBeGreaterThan(0);
      });
    });
  });
});
