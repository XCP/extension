import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import {
  validatePrivateKeyFormat,
  sanitizePrivateKey,
  containsDangerousChars,
  validatePrivateKeyLength,
  detectPrivateKeyFormat,
  type PrivateKeyValidationResult,
} from '../privateKey';

describe('Private Key Validation Security Tests', () => {
  describe('validatePrivateKeyFormat', () => {
    it('should accept valid hex private keys', () => {
      // Valid hex private key
      const validHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validatePrivateKeyFormat(validHex);
      
      expect(result.isValid).toBe(true);
      expect(result.format).toBe('hex');
      expect(result.suggestedAddressFormat).toBe(AddressFormat.P2TR);
    });

    it('should accept valid WIF private keys', () => {
      // Valid WIF compressed (starts with K or L)
      const validWIFCompressed = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
      const result1 = validatePrivateKeyFormat(validWIFCompressed);
      
      expect(result1.isValid).toBe(true);
      expect(result1.format).toBe('wif-compressed');
      expect(result1.suggestedAddressFormat).toBe(AddressFormat.P2SH_P2WPKH);

      // Valid WIF uncompressed (starts with 5)
      const validWIFUncompressed = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ';
      const result2 = validatePrivateKeyFormat(validWIFUncompressed);
      
      expect(result2.isValid).toBe(true);
      expect(result2.format).toBe('wif-uncompressed');
      expect(result2.suggestedAddressFormat).toBe(AddressFormat.P2PKH);
    });

    it('should reject empty or null inputs', () => {
      expect(validatePrivateKeyFormat('')).toEqual({
        isValid: false,
        error: 'Private key is required'
      });
      expect(validatePrivateKeyFormat('   ')).toEqual({
        isValid: false,
        error: 'Private key is required'
      });
    });

    it('should reject formula injection attempts', () => {
      const injectionAttempts = ['=cmd', '@formula', '+calc', '-function'];
      
      injectionAttempts.forEach(attempt => {
        const result = validatePrivateKeyFormat(attempt);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid private key format');
      });
    });

    it('should reject hex with 0x prefix', () => {
      const hexWith0x = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validatePrivateKeyFormat(hexWith0x);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Remove 0x prefix from hexadecimal private key');
    });

    it('should reject invalid hex lengths', () => {
      const shortHex = '0123456789abcdef';
      const longHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00';
      
      expect(validatePrivateKeyFormat(shortHex)).toEqual({
        isValid: false,
        error: 'Private key is too short'
      });
      expect(validatePrivateKeyFormat(longHex)).toEqual({
        isValid: false,
        error: 'Hexadecimal private key must be exactly 64 characters'
      });
    });

    // Fuzz testing for various edge cases
    it('should handle random invalid inputs safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 })
          .filter(s => !/^[0-9a-fA-F]{64}$/.test(s.trim()) && !/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s.trim())),
        (invalidInput) => {
          const result = validatePrivateKeyFormat(invalidInput);
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ), { numRuns: 500 });
    });

    // Test for ReDoS vulnerability in regex
    it('should handle extremely long strings without timeout', () => {
      const longString = 'a'.repeat(100000);
      const start = Date.now();
      const result = validatePrivateKeyFormat(longString);
      const duration = Date.now() - start;
      
      expect(result.isValid).toBe(false);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    // Fuzz test for potential injection attempts
    it('should reject all formula injection patterns', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.string({ minLength: 1 }).map(s => '=' + s),
          fc.string({ minLength: 1 }).map(s => '@' + s),
          fc.string({ minLength: 1 }).map(s => '+' + s),
          fc.string({ minLength: 1 }).map(s => '-' + s)
        ),
        (injectionAttempt) => {
          const result = validatePrivateKeyFormat(injectionAttempt);
          expect(result.isValid).toBe(false);
        }
      ), { numRuns: 200 });
    });
  });

  describe('sanitizePrivateKey', () => {
    it('should trim whitespace', () => {
      const withWhitespace = '  test  ';
      expect(sanitizePrivateKey(withWhitespace)).toBe('test');
    });

    it('should handle various whitespace characters', () => {
      fc.assert(fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        fc.string(),
        (prefix, content, suffix) => {
          const input = prefix + content + suffix;
          const result = sanitizePrivateKey(input);
          expect(result).toBe(input.trim());
        }
      ), { numRuns: 100 });
    });
  });

  describe('containsDangerousChars', () => {
    it('should detect control characters', () => {
      const withNull = 'test\x00test';
      const withBell = 'test\x07test';
      
      expect(containsDangerousChars(withNull)).toBe(true);
      expect(containsDangerousChars(withBell)).toBe(true);
    });

    it('should allow normal characters', () => {
      const normal = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
      expect(containsDangerousChars(normal)).toBe(false);
    });

    // Fuzz test for control character detection
    it('should detect all control characters', () => {
      fc.assert(fc.property(
        fc.string(),
        fc.integer({ min: 0, max: 31 }).filter(x => x !== 9 && x !== 10 && x !== 13), // Exclude tab, LF, CR
        fc.string(),
        (prefix, controlChar, suffix) => {
          const input = prefix + String.fromCharCode(controlChar) + suffix;
          expect(containsDangerousChars(input)).toBe(true);
        }
      ), { numRuns: 100 });
    });
  });

  describe('validatePrivateKeyLength', () => {
    it('should reject empty strings', () => {
      const result = validatePrivateKeyLength('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private key cannot be empty');
    });

    it('should reject extremely long strings', () => {
      const longString = 'a'.repeat(1001);
      const result = validatePrivateKeyLength(longString);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Private key is suspiciously long');
    });

    it('should accept valid lengths', () => {
      const hex64 = 'a'.repeat(64);
      const wif51 = 'a'.repeat(51);
      const wif52 = 'a'.repeat(52);
      
      expect(validatePrivateKeyLength(hex64).isValid).toBe(true);
      expect(validatePrivateKeyLength(wif51).isValid).toBe(true);
      expect(validatePrivateKeyLength(wif52).isValid).toBe(true);
    });

    // Fuzz test for length validation
    it('should correctly validate all possible lengths', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 2000 }),
        (length) => {
          const input = 'a'.repeat(length);
          const result = validatePrivateKeyLength(input);
          
          if (length === 0) {
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Private key cannot be empty');
          } else if (length > 1000) {
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Private key is suspiciously long');
          } else if (length !== 64 && length !== 51 && length !== 52) {
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Invalid private key length');
          } else {
            expect(result.isValid).toBe(true);
          }
        }
      ), { numRuns: 200 });
    });
  });

  describe('detectPrivateKeyFormat', () => {
    it('should detect hex format', () => {
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(detectPrivateKeyFormat(hexKey)).toBe('hex');
    });

    it('should detect WIF format', () => {
      const wifKey = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
      expect(detectPrivateKeyFormat(wifKey)).toBe('wif');
    });

    it('should detect unknown format', () => {
      const unknownKey = 'not-a-valid-key';
      expect(detectPrivateKeyFormat(unknownKey)).toBe('unknown');
    });

    // Fuzz test for format detection
    it('should correctly classify random inputs', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (input) => {
          const result = detectPrivateKeyFormat(input);
          const trimmed = input.trim();
          
          if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
            expect(result).toBe('hex');
          } else if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(trimmed)) {
            expect(result).toBe('wif');
          } else {
            expect(result).toBe('unknown');
          }
        }
      ), { numRuns: 500 });
    });
  });

  // Edge case testing
  describe('Edge Cases', () => {
    it('should handle Unicode characters safely', () => {
      const unicodeKey = '🔑🔐🗝️💎🚀🌙⭐🔥💰🎯';
      const result = validatePrivateKeyFormat(unicodeKey);
      expect(result.isValid).toBe(false);
    });

    it('should handle mixed case hex', () => {
      const mixedCaseHex = '0123456789ABCDEFabcdef0123456789ABCDEFabcdef0123456789ABCDEFabcd';
      const result = validatePrivateKeyFormat(mixedCaseHex);
      expect(result.isValid).toBe(true);
      expect(result.format).toBe('hex');
    });

    it('should handle boundary WIF characters', () => {
      // Test boundary cases for WIF base58 alphabet
      const edgeCases = [
        '5' + 'H'.repeat(50), // Minimum valid characters
        'K' + 'z'.repeat(50), // Maximum valid characters
        'L' + '9'.repeat(50), // Number boundaries
      ];
      
      edgeCases.forEach(wif => {
        const result = detectPrivateKeyFormat(wif);
        expect(result).toBe('wif');
      });
    });

    // Test for potential buffer overflow or memory issues
    it('should handle gradually increasing input sizes', () => {
      for (let i = 1; i <= 1000; i += 50) {
        const input = 'a'.repeat(i);
        expect(() => validatePrivateKeyFormat(input)).not.toThrow();
      }
    });
  });

  // Security-specific tests
  describe('Security Tests', () => {
    it('should not leak information about invalid keys', () => {
      const invalidKeys = [
        'invalid-key-123',
        '12345',
        'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // Invalid hex chars
        '5InvalidWIFKey123456789012345678901234567890123456789'
      ];
      
      invalidKeys.forEach(key => {
        const result = validatePrivateKeyFormat(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).not.toContain(key); // Don't echo back the input
      });
    });

    it('should handle potential timing attacks safely', () => {
      const validHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const invalidHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg';
      
      // Time both operations - should be similar
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const start1 = performance.now();
        validatePrivateKeyFormat(validHex);
        const end1 = performance.now();
        
        const start2 = performance.now();
        validatePrivateKeyFormat(invalidHex);
        const end2 = performance.now();
        
        times.push(Math.abs((end1 - start1) - (end2 - start2)));
      }
      
      const avgTimeDiff = times.reduce((a, b) => a + b) / times.length;
      expect(avgTimeDiff).toBeLessThan(5); // Less than 5ms difference on average
    });
  });
});