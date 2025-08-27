import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateMessage,
  validateSignatureFormat,
  validateAddressForVerification,
  validateSignatureAddressCompatibility,
  sanitizeMessage,
  sanitizeSignature,
  checkMessageForReDoS,
  validateMessageVerificationParams,
  type MessageVerificationResult,
} from '../messageVerification';

describe('Message Verification Security Tests', () => {
  describe('validateMessage', () => {
    it('should accept valid messages', () => {
      const validMessages = [
        'Hello, Bitcoin!',
        'This is a test message.',
        '',  // Empty message should be allowed
        '🚀💎 Unicode message 🎯',
        'Multi\nline\nmessage',
        'Message with tabs\t\there',
      ];

      validMessages.forEach(message => {
        const result = validateMessage(message);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject non-string inputs', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true];
      
      invalidInputs.forEach(input => {
        const result = validateMessage(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Message must be a string');
      });
    });

    it('should reject formula injection attempts', () => {
      const injectionAttempts = [
        '=SUM(1,1)',
        '@NOW()',
        '+malicious',
        '-command',
        '=cmd|/C calc',
      ];

      injectionAttempts.forEach(attempt => {
        const result = validateMessage(attempt);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid message format');
      });
    });

    it('should reject messages with control characters', () => {
      const controlChars = [
        'test\x00null',
        'test\x01start',
        'test\x07bell',
        'test\x1Funit',
        'test\x7Fdel',
      ];

      controlChars.forEach(msg => {
        const result = validateMessage(msg);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Message contains invalid control characters');
      });
    });

    it('should reject extremely long messages', () => {
      const longMessage = 'a'.repeat(100001);
      const result = validateMessage(longMessage);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Message too long');
    });

    // Fuzz testing for message validation
    it('should handle random message inputs safely', () => {
      fc.assert(fc.property(
        fc.string(),
        (randomMessage) => {
          const result = validateMessage(randomMessage);
          
          // Should never throw an exception
          expect(typeof result.isValid).toBe('boolean');
          
          if (!result.isValid) {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
          }
        }
      ), { numRuns: 500 });
    });

    // Test for potential ReDoS patterns
    it('should handle ReDoS-prone patterns quickly', () => {
      const redosPatterns = [
        'a'.repeat(10000),
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
        'x'.repeat(1000) + 'y',
      ];

      redosPatterns.forEach(pattern => {
        const start = Date.now();
        const result = validateMessage(pattern);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(100); // Should complete quickly
        expect(typeof result.isValid).toBe('boolean');
      });
    });
  });

  describe('validateSignatureFormat', () => {
    it('should accept valid base64 signatures', () => {
      // Valid base64 signatures with correct recovery flags
      const validSignatures = [
        'HxMHMRLx4MCmTJw9HjODNcNs1MfTcQKj48+GnDHRc6z6bFTtTZP3hj4A0wPmDI7T4sJXzCqNhTJ8YP2NmDLKJ8I=', // 65 bytes
        'H/3GCzFP4XHh7ELPpQCG9Tk+KWDKkSzHJP/OJGzUJmJzCxoK+xO8KfOEQNGxjJ2A/7FV0hJFPJQmYGKxOhV5M3w=',
      ];

      validSignatures.forEach(sig => {
        const result = validateSignatureFormat(sig);
        expect(result.isValid).toBe(true);
        expect(result.signatureFormat).toBe('base64');
        expect(result.addressType).toBeDefined();
      });
    });

    it('should accept valid Taproot signatures', () => {
      const validTaprootSigs = [
        'tr:' + '0'.repeat(128), // 128 hex chars
        'tr:' + 'a1b2c3d4'.repeat(16), // 128 hex chars
      ];

      validTaprootSigs.forEach(sig => {
        const result = validateSignatureFormat(sig);
        expect(result.isValid).toBe(true);
        expect(result.signatureFormat).toBe('taproot');
        expect(result.addressType).toBe('P2TR');
      });
    });

    it('should reject invalid signature formats', () => {
      const invalidSigs = [
        '',  // Empty
        'not-base64',
        'tr:tooshort',  // Too short for Taproot
        'tr:' + 'Z'.repeat(128), // Invalid hex chars
        'InvalidBase64!@#',
        'tr:' + '0'.repeat(127), // One char short
      ];

      invalidSigs.forEach(sig => {
        const result = validateSignatureFormat(sig);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject formula injection in signatures', () => {
      const injectionAttempts = [
        '=SUM(1,1)',
        '@cmd',
        '+malicious',
        '-attack',
      ];

      injectionAttempts.forEach(attempt => {
        const result = validateSignatureFormat(attempt);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid signature format');
      });
    });

    it('should validate recovery flags correctly', () => {
      // Test different recovery flags
      const flags = [27, 31, 35, 39]; // Valid flags for different address types
      
      flags.forEach(flag => {
        // Create a dummy 65-byte signature with the flag
        const sigBytes = Buffer.alloc(65);
        sigBytes[0] = flag;
        // Fill with dummy data
        for (let i = 1; i < 65; i++) {
          sigBytes[i] = i % 256;
        }
        
        const sig = sigBytes.toString('base64');
        const result = validateSignatureFormat(sig);
        expect(result.isValid).toBe(true);
      });

      // Test invalid flags
      const invalidFlags = [0, 26, 43, 100];
      invalidFlags.forEach(flag => {
        const sigBytes = Buffer.alloc(65);
        sigBytes[0] = flag;
        
        const sig = sigBytes.toString('base64');
        const result = validateSignatureFormat(sig);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid signature recovery flag');
      });
    });

    // Fuzz testing for signature validation
    it('should handle random signature inputs safely', () => {
      fc.assert(fc.property(
        fc.string(),
        (randomSig) => {
          const result = validateSignatureFormat(randomSig);
          
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
        }
      ), { numRuns: 500 });
    });
  });

  describe('validateAddressForVerification', () => {
    it('should accept valid Bitcoin addresses', () => {
      const validAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // P2PKH
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH
        'bc1qw508d6qejxtdg4y5r3zrvahq62q1xw3j5p7cdy', // P2WPKH
        'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // P2TR
        'tb1qw508d6qejxtdg4y5r3zrvahq62q1xw3j5p7c6y', // Testnet
      ];

      validAddresses.forEach(addr => {
        const result = validateAddressForVerification(addr);
        expect(result.isValid).toBe(true);
        expect(result.addressType).toBeDefined();
      });
    });

    it('should reject invalid address formats', () => {
      const invalidAddresses = [
        '',  // Empty
        '1234',  // Too short
        'InvalidAddress',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa!', // Invalid chars
        'bc1qtooshort',
        'bc1p' + 'x'.repeat(100), // Too long
      ];

      invalidAddresses.forEach(addr => {
        const result = validateAddressForVerification(addr);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject formula injection in addresses', () => {
      const injectionAttempts = [
        '=cmd',
        '@formula',
        '+malicious',
        '-attack',
      ];

      injectionAttempts.forEach(attempt => {
        const result = validateAddressForVerification(attempt);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid address format');
      });
    });

    it('should reject addresses with path traversal patterns', () => {
      const traversalAttempts = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7../etc',
        'bc1q../passwd',
        '3J98t1WpEZ73CNmQviecrnyiW/root',
      ];

      traversalAttempts.forEach(attempt => {
        const result = validateAddressForVerification(attempt);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid address format');
      });
    });

    // Fuzz testing for address validation
    it('should handle random address inputs safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (randomAddr) => {
          const result = validateAddressForVerification(randomAddr);
          
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
        }
      ), { numRuns: 500 });
    });
  });

  describe('validateSignatureAddressCompatibility', () => {
    it('should validate Taproot signature with Taproot address', () => {
      const taprootSig = 'tr:' + '0'.repeat(128);
      const taprootAddr = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
      
      const result = validateSignatureAddressCompatibility(taprootSig, taprootAddr);
      expect(result.isValid).toBe(true);
    });

    it('should reject Taproot signature with non-Taproot address', () => {
      const taprootSig = 'tr:' + '0'.repeat(128);
      const p2pkhAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      
      const result = validateSignatureAddressCompatibility(taprootSig, p2pkhAddr);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Taproot signature requires Taproot address');
    });

    it('should validate legacy signatures with compatible addresses', () => {
      // P2PKH signature (flag 31) with P2PKH address
      const sigBytes = Buffer.alloc(65);
      sigBytes[0] = 31; // P2PKH compressed flag
      const p2pkhSig = sigBytes.toString('base64');
      const p2pkhAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      
      const result = validateSignatureAddressCompatibility(p2pkhSig, p2pkhAddr);
      expect(result.isValid).toBe(true);
    });
  });

  describe('sanitizeMessage', () => {
    it('should remove control characters but preserve valid chars', () => {
      const input = 'Hello\x00World\x07Test\nNewline\tTab';
      const result = sanitizeMessage(input);
      expect(result).toBe('HelloWorldTest\nNewline\tTab');
    });

    it('should handle non-string inputs safely', () => {
      const inputs = [null, undefined, 123, {}, []];
      inputs.forEach(input => {
        const result = sanitizeMessage(input as any);
        expect(result).toBe('');
      });
    });

    // Fuzz test sanitization
    it('should handle random inputs without crashing', () => {
      fc.assert(fc.property(
        fc.string(),
        (randomInput) => {
          expect(() => sanitizeMessage(randomInput)).not.toThrow();
          const result = sanitizeMessage(randomInput);
          expect(typeof result).toBe('string');
        }
      ), { numRuns: 300 });
    });
  });

  describe('checkMessageForReDoS', () => {
    it('should detect long messages', () => {
      const longMessage = 'a'.repeat(10001);
      expect(checkMessageForReDoS(longMessage)).toBe(true);
    });

    it('should detect repeated patterns', () => {
      const repeatedPattern = 'abcd'.repeat(11);
      expect(checkMessageForReDoS(repeatedPattern)).toBe(true);
    });

    it('should allow normal messages', () => {
      const normalMessages = [
        'Hello World',
        'This is a normal message.',
        'Some Unicode: 🚀💎',
      ];

      normalMessages.forEach(msg => {
        expect(checkMessageForReDoS(msg)).toBe(false);
      });
    });

    // Fuzz test ReDoS detection
    it('should perform ReDoS detection quickly', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 1000 }),
        (message) => {
          const start = Date.now();
          const result = checkMessageForReDoS(message);
          const duration = Date.now() - start;
          
          expect(duration).toBeLessThan(50); // Should be very fast
          expect(typeof result).toBe('boolean');
        }
      ), { numRuns: 200 });
    });
  });

  describe('validateMessageVerificationParams', () => {
    it('should validate complete valid parameter sets', () => {
      const validSets = [
        {
          message: 'Hello Bitcoin!',
          signature: 'tr:' + '0'.repeat(128),
          address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
        },
      ];

      validSets.forEach(set => {
        const result = validateMessageVerificationParams(
          set.message,
          set.signature,
          set.address
        );
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject parameter sets with ReDoS risks', () => {
      const redosMessage = 'a'.repeat(15000);
      const validSig = 'tr:' + '0'.repeat(128);
      const validAddr = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
      
      const result = validateMessageVerificationParams(redosMessage, validSig, validAddr);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('performance issues');
    });

    // Comprehensive fuzz testing
    it('should handle completely random parameter combinations', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 1000 }),
        fc.string({ maxLength: 200 }),
        fc.string({ maxLength: 100 }),
        (message, signature, address) => {
          const result = validateMessageVerificationParams(message, signature, address);
          
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
        }
      ), { numRuns: 300 });
    });
  });

  // Security-specific edge case testing
  describe('Security Edge Cases', () => {
    it('should handle Unicode normalization attacks', () => {
      // Different Unicode representations of similar characters
      const unicodeAttacks = [
        'café', // é as single character
        'cafe\u0301', // é as e + combining acute accent
        '\u0041\u0300', // À as A + combining grave
      ];

      unicodeAttacks.forEach(attack => {
        const result = validateMessage(attack);
        expect(typeof result.isValid).toBe('boolean');
      });
    });

    it('should handle null byte injection attempts', () => {
      const nullByteAttempts = [
        'message\x00.png',
        'signature\x00hidden',
        'address\x00/../etc',
      ];

      nullByteAttempts.forEach(attempt => {
        expect(validateMessage(attempt).isValid).toBe(false);
        expect(validateSignatureFormat(attempt).isValid).toBe(false);
        expect(validateAddressForVerification(attempt).isValid).toBe(false);
      });
    });

    it('should handle extremely long input combinations', () => {
      const longMessage = 'M'.repeat(50000);
      const longSig = 'S'.repeat(1000);
      const longAddr = 'A'.repeat(500);
      
      const start = Date.now();
      const result = validateMessageVerificationParams(longMessage, longSig, longAddr);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result.isValid).toBe(false); // Should reject long inputs
    });

    it('should prevent signature format confusion attacks', () => {
      // Mix Taproot prefix with base64 data
      const confusionAttempts = [
        'tr:' + Buffer.alloc(65).toString('base64'),
        'TR:' + '0'.repeat(128), // Wrong case
        'tr:' + 'g'.repeat(128), // Invalid hex
      ];

      confusionAttempts.forEach(attempt => {
        const result = validateSignatureFormat(attempt);
        expect(result.isValid).toBe(false);
      });
    });
  });
});