import { describe, it, expect, vi } from 'vitest';
import {
  generateNewMnemonic,
  decodeWIF,
  isWIF,
  getPublicKeyFromPrivateKey,
  getAddressFromPrivateKey,
  getPrivateKeyFromMnemonic
} from '@/utils/blockchain/bitcoin/privateKey';
import { AddressFormat } from '@/types';

vi.mock('@/utils/blockchain/counterwallet', () => ({
  getCounterwalletSeed: vi.fn(() => new Uint8Array(64).fill(1))
}));

describe('Private Key Utilities', () => {
  describe('generateNewMnemonic', () => {
    it('should generate a valid 12-word mnemonic', () => {
      const mnemonic = generateNewMnemonic();
      expect(typeof mnemonic).toBe('string');
      expect(mnemonic.split(' ')).toHaveLength(12);
    });

    it('should generate different mnemonics each time', () => {
      const mnemonic1 = generateNewMnemonic();
      const mnemonic2 = generateNewMnemonic();
      expect(mnemonic1).not.toBe(mnemonic2);
    });

    it('should generate mnemonics with valid words', () => {
      const mnemonic = generateNewMnemonic();
      const words = mnemonic.split(' ');
      expect(words.every(word => word.length > 0)).toBe(true);
      expect(words.every(word => /^[a-z]+$/.test(word))).toBe(true);
    });
  });

  describe('decodeWIF', () => {
    it('should decode uncompressed WIF correctly', () => {
      // Known test vector: private key all zeros, uncompressed
      const wif = '5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf';
      const result = decodeWIF(wif);
      
      expect(result.privateKey).toBe('0000000000000000000000000000000000000000000000000000000000000001');
      expect(result.compressed).toBe(false);
    });

    it('should decode compressed WIF correctly', () => {
      // Known test vector: private key all zeros, compressed
      const wif = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
      const result = decodeWIF(wif);
      
      expect(result.privateKey).toBe('0000000000000000000000000000000000000000000000000000000000000001');
      expect(result.compressed).toBe(true);
    });

    it('should throw error for invalid WIF version byte', () => {
      // Create a valid base58check encoded string but with wrong version byte (0x81 instead of 0x80)
      // This is a properly encoded string with valid checksum but wrong version byte
      const invalidWif = '5KmUQFjtyMQhCFwkTZ1Q9xJm81kkAW5XgsAVkXbcPdUHXwLumZN';
      expect(() => decodeWIF(invalidWif)).toThrow('Invalid WIF version byte');
    });

    it('should throw error for invalid base58 encoding', () => {
      const invalidWif = 'invalid-wif-string';
      expect(() => decodeWIF(invalidWif)).toThrow();
    });

    it('should handle edge case with minimum valid private key', () => {
      const wif = '5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf';
      const result = decodeWIF(wif);
      expect(result.privateKey).toHaveLength(64); // 32 bytes = 64 hex chars
    });
  });

  describe('isWIF', () => {
    it('should return true for valid uncompressed WIF', () => {
      const wif = '5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf';
      expect(isWIF(wif)).toBe(true);
    });

    it('should return true for valid compressed WIF', () => {
      const wif = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
      expect(isWIF(wif)).toBe(true);
    });

    it('should return false for invalid WIF version byte', () => {
      const invalidWif = '1HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf';
      expect(isWIF(invalidWif)).toBe(false);
    });

    it('should return false for invalid base58 string', () => {
      const invalidWif = 'invalid-wif-string';
      expect(isWIF(invalidWif)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isWIF('')).toBe(false);
    });

    it('should return false for string that is too short', () => {
      expect(isWIF('5')).toBe(false);
    });

    it('should return false for string with invalid characters', () => {
      expect(isWIF('5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuD0')).toBe(false);
    });
  });

  describe('getPublicKeyFromPrivateKey', () => {
    it('should generate compressed public key by default', () => {
      const privateKey = '0000000000000000000000000000000000000000000000000000000000000001';
      const publicKey = getPublicKeyFromPrivateKey(privateKey);
      
      expect(publicKey).toHaveLength(66); // 33 bytes = 66 hex chars for compressed
      expect(publicKey.startsWith('02') || publicKey.startsWith('03')).toBe(true);
    });

    it('should generate uncompressed public key when specified', () => {
      const privateKey = '0000000000000000000000000000000000000000000000000000000000000001';
      const publicKey = getPublicKeyFromPrivateKey(privateKey, false);
      
      expect(publicKey).toHaveLength(130); // 65 bytes = 130 hex chars for uncompressed
      expect(publicKey.startsWith('04')).toBe(true);
    });

    it('should throw error for invalid private key', () => {
      const invalidPrivateKey = 'invalid-hex-string';
      expect(() => getPublicKeyFromPrivateKey(invalidPrivateKey)).toThrow('Invalid private key');
    });

    it('should throw error for empty private key', () => {
      const emptyPrivateKey = '';
      expect(() => getPublicKeyFromPrivateKey(emptyPrivateKey)).toThrow('Invalid private key');
    });

    it('should throw error for private key that is too short', () => {
      const shortPrivateKey = '12345';
      expect(() => getPublicKeyFromPrivateKey(shortPrivateKey)).toThrow('Invalid private key');
    });

    it('should throw error for private key that is too long', () => {
      const longPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001ff';
      expect(() => getPublicKeyFromPrivateKey(longPrivateKey)).toThrow('Invalid private key');
    });

    it('should handle private key with all zeros', () => {
      const privateKey = '0000000000000000000000000000000000000000000000000000000000000001';
      const publicKey = getPublicKeyFromPrivateKey(privateKey);
      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
    });

    it('should handle private key with maximum valid value', () => {
      const privateKey = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140';
      const publicKey = getPublicKeyFromPrivateKey(privateKey);
      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
    });

    it('should generate same public key for same private key', () => {
      const privateKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const publicKey1 = getPublicKeyFromPrivateKey(privateKey);
      const publicKey2 = getPublicKeyFromPrivateKey(privateKey);
      expect(publicKey1).toBe(publicKey2);
    });
  });

  describe('getAddressFromPrivateKey', () => {
    const testPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001';

    it('should generate P2PKH address', () => {
      const address = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2PKH);
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
      expect(address.startsWith('1')).toBe(true);
    });

    it('should generate P2SH_P2WPKH address', () => {
      const address = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2SH_P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
      expect(address.startsWith('3')).toBe(true);
    });

    it('should generate P2WPKH address', () => {
      const address = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2WPKH);
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should generate P2TR address', () => {
      const address = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2TR);
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
      expect(address.startsWith('bc1p')).toBe(true);
    });

    it('should generate different addresses for compressed vs uncompressed keys', () => {
      const compressedAddress = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2PKH, true);
      const uncompressedAddress = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2PKH, false);
      expect(compressedAddress).not.toBe(uncompressedAddress);
    });

    it('should throw error for invalid private key', () => {
      const invalidPrivateKey = 'invalid-hex';
      expect(() => getAddressFromPrivateKey(invalidPrivateKey, AddressFormat.P2PKH))
        .toThrow('Invalid private key');
    });

    it('should generate same address for same private key and type', () => {
      const address1 = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2PKH);
      const address2 = getAddressFromPrivateKey(testPrivateKey, AddressFormat.P2PKH);
      expect(address1).toBe(address2);
    });
  });

  describe('getPrivateKeyFromMnemonic', () => {
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const testPath = "m/84'/0'/0'/0/0";

    it('should derive private key from mnemonic for standard address types', () => {
      const privateKey = getPrivateKeyFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      expect(typeof privateKey).toBe('string');
      expect(privateKey).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should derive private key from mnemonic for Counterwallet', () => {
      const privateKey = getPrivateKeyFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.Counterwallet);
      expect(typeof privateKey).toBe('string');
      expect(privateKey).toHaveLength(64);
    });

    it('should generate different private keys for different paths', () => {
      const privateKey1 = getPrivateKeyFromMnemonic(testMnemonic, "m/84'/0'/0'/0/0", AddressFormat.P2WPKH);
      const privateKey2 = getPrivateKeyFromMnemonic(testMnemonic, "m/84'/0'/0'/0/1", AddressFormat.P2WPKH);
      expect(privateKey1).not.toBe(privateKey2);
    });

    it('should generate different private keys for different address types', () => {
      const privateKey1 = getPrivateKeyFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      const privateKey2 = getPrivateKeyFromMnemonic(testMnemonic, "m/0'/0", AddressFormat.Counterwallet);
      expect(privateKey1).not.toBe(privateKey2);
    });

    it('should generate same private key for same inputs', () => {
      const privateKey1 = getPrivateKeyFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      const privateKey2 = getPrivateKeyFromMnemonic(testMnemonic, testPath, AddressFormat.P2WPKH);
      expect(privateKey1).toBe(privateKey2);
    });

    it('should handle different derivation paths', () => {
      const paths = [
        "m/44'/0'/0'/0/0",  // P2PKH
        "m/49'/0'/0'/0/0",  // P2SH_P2WPKH
        "m/84'/0'/0'/0/0",  // P2WPKH
        "m/86'/0'/0'/0/0",  // P2TR
      ];

      paths.forEach(path => {
        const privateKey = getPrivateKeyFromMnemonic(testMnemonic, path, AddressFormat.P2WPKH);
        expect(privateKey).toHaveLength(64);
      });
    });

    it('should throw error for invalid mnemonic', () => {
      const invalidMnemonic = 'invalid mnemonic phrase';
      expect(() => getPrivateKeyFromMnemonic(invalidMnemonic, testPath, AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should throw error for invalid derivation path', () => {
      const invalidPath = 'invalid/path';
      expect(() => getPrivateKeyFromMnemonic(testMnemonic, invalidPath, AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should handle empty mnemonic gracefully', () => {
      const emptyMnemonic = '';
      expect(() => getPrivateKeyFromMnemonic(emptyMnemonic, testPath, AddressFormat.P2WPKH))
        .toThrow();
    });

    it('should handle edge case with hardened derivation paths', () => {
      const hardenedPath = "m/84'/0'/0'/0'/0'";
      const privateKey = getPrivateKeyFromMnemonic(testMnemonic, hardenedPath, AddressFormat.P2WPKH);
      expect(privateKey).toHaveLength(64);
    });

    it('should handle deep derivation paths', () => {
      const deepPath = "m/84'/0'/0'/0/0/1/2/3";
      const privateKey = getPrivateKeyFromMnemonic(testMnemonic, deepPath, AddressFormat.P2WPKH);
      expect(privateKey).toHaveLength(64);
    });

    it('should work with different mnemonic lengths', () => {
      // Test with 24-word mnemonic
      const longMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      const privateKey = getPrivateKeyFromMnemonic(longMnemonic, testPath, AddressFormat.P2WPKH);
      expect(privateKey).toHaveLength(64);
    });
  });

  describe('integration tests', () => {
    it('should create consistent address from mnemonic through full flow', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const path = "m/84'/0'/0'/0/0";
      
      // Derive private key from mnemonic
      const privateKey = getPrivateKeyFromMnemonic(mnemonic, path, AddressFormat.P2WPKH);
      
      // Generate address from private key
      const address = getAddressFromPrivateKey(privateKey, AddressFormat.P2WPKH);
      
      expect(typeof address).toBe('string');
      expect(address.startsWith('bc1')).toBe(true);
    });

    it('should maintain consistency between public key derivation methods', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const path = "m/84'/0'/0'/0/0";
      
      const privateKey = getPrivateKeyFromMnemonic(mnemonic, path, AddressFormat.P2WPKH);
      const publicKey = getPublicKeyFromPrivateKey(privateKey);
      
      expect(publicKey).toHaveLength(66); // Compressed public key
      expect(publicKey.startsWith('02') || publicKey.startsWith('03')).toBe(true);
    });
  });
});