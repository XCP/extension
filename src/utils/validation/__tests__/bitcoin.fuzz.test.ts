/**
 * Fuzz tests for Bitcoin address validation
 * Tests address validation with various inputs including edge cases and malicious inputs
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { 
  validateBitcoinAddress, 
  isValidBitcoinAddress 
} from '../bitcoin';

describe('Bitcoin Address Validation Fuzz Tests', () => {
  describe('validateBitcoinAddress', () => {
    // Valid mainnet addresses
    const validMainnetAddresses = [
      // P2PKH (Legacy)
      { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', type: 'P2PKH' }, // Genesis
      { address: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr', type: 'P2PKH' }, // Counterparty burn
      { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', type: 'P2PKH' },
      
      // P2SH
      { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', type: 'P2SH' },
      { address: '3QJmV3qfvL9SuYo34YihAf3sRCW3qSinyC', type: 'P2SH' },
      
      // P2WPKH (Native SegWit)
      { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', type: 'P2WPKH' },
      { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', type: 'P2WPKH' },
      
      // P2TR (Taproot)
      { address: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', type: 'P2TR' },
      { address: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0', type: 'P2TR' }, // Valid 42-char P2TR
      
      // P2WSH (Native SegWit Script)
      { address: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', type: 'P2WSH' },
    ];

    // Valid testnet addresses
    const validTestnetAddresses = [
      // Testnet P2PKH
      { address: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', type: 'P2PKH' },
      { address: 'n2eMqTT929pb1RDNuqEnxdaLau1rxy3efi', type: 'P2PKH' },
      
      // Testnet P2SH
      { address: '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', type: 'P2SH' },
      
      // Testnet SegWit
      { address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', type: 'P2WPKH' },
      // Skip testnet P2TR for now - hard to find valid test vectors
    ];

    // Valid regtest addresses
    const validRegtestAddresses = [
      { address: 'bcrt1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvseswlauz7', type: 'P2WSH' }, // Valid regtest P2WSH (32 bytes)
    ];

    // Invalid addresses - now with proper checksum validation
    const invalidAddresses = [
      '',
      ' ',
      'not_an_address',
      '1234567890',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t', // Invalid checksum
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t44', // Invalid checksum
      '1InvalidBitcoinAddress12345', // Invalid checksum
      '0A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Invalid prefix
      '4A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Invalid prefix
      'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // Invalid checksum
      'bc2qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // Invalid bech32 prefix
      'BC1qW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4', // Mixed case (bech32 must be all lower or all upper)
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', // Ethereum address
      '1shortaddress', // Invalid base58 checksum
      '3shortaddress', // Invalid base58 checksum
      'bc1qtoolong' + 'a'.repeat(50), // Invalid bech32 format
    ];

    // Test valid mainnet addresses
    it.each(validMainnetAddresses)('should validate mainnet address: $address', ({ address, type }) => {
      const result = validateBitcoinAddress(address);
      expect(result.isValid).toBe(true);
      expect(result.network).toBe('mainnet');
      expect(result.addressType).toBe(type);
      expect(result.error).toBeUndefined();
    });

    // Test valid testnet addresses
    it.each(validTestnetAddresses)('should validate testnet address: $address', ({ address, type }) => {
      const result = validateBitcoinAddress(address);
      expect(result.isValid).toBe(true);
      expect(result.network).toBe('testnet');
      expect(result.addressType).toBe(type);
      expect(result.error).toBeUndefined();
    });

    // Test valid regtest addresses
    it.each(validRegtestAddresses)('should validate regtest address: $address', ({ address, type }) => {
      const result = validateBitcoinAddress(address);
      expect(result.isValid).toBe(true);
      expect(result.network).toBe('regtest');
      expect(result.addressType).toBe(type);
      expect(result.error).toBeUndefined();
    });

    // Test invalid addresses
    it.each(invalidAddresses)('should reject invalid address: %s', (address) => {
      const result = validateBitcoinAddress(address);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.addressType).toBeUndefined();
    });

    // Test injection attempts
    it('should reject addresses with injection characters', () => {
      const injectionAttempts = [
        '1A1zP1eP5QGefi2D<script>alert(1)</script>',
        "1A1zP1eP5QGefi2D'; DROP TABLE users;--",
        '1A1zP1eP5QGefi2D"onmouseover="alert(1)"',
        '1A1zP1eP5QGefi2D`rm -rf /`',
        '1A1zP1eP5QGefi2D;ls -la',
      ];

      injectionAttempts.forEach(address => {
        const result = validateBitcoinAddress(address);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid characters');
      });
    });

    // Test edge cases
    it('should handle edge cases correctly', () => {
      // Null/undefined
      expect(validateBitcoinAddress(null as any).isValid).toBe(false);
      expect(validateBitcoinAddress(undefined as any).isValid).toBe(false);
      
      // Non-string types
      expect(validateBitcoinAddress(123 as any).isValid).toBe(false);
      expect(validateBitcoinAddress({} as any).isValid).toBe(false);
      expect(validateBitcoinAddress([] as any).isValid).toBe(false);
      
      // Whitespace handling
      expect(validateBitcoinAddress('  1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa  ').isValid).toBe(true);
      expect(validateBitcoinAddress('\t1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n').isValid).toBe(true);
    });

    // Fast-check property-based testing with reduced iterations
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              validateBitcoinAddress(input);
            }).not.toThrow();
            
            const result = validateBitcoinAddress(input);
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
            
            if (!result.isValid) {
              expect(result.error).toBeDefined();
            }
          }
        ),
        { numRuns: 100 } // Reduced from 1000 for faster execution
      );
    });

    // Test with injection patterns using fast-check
    it('should reject addresses with injection patterns', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }).map(s => 
            '1A1zP1eP5QGefi2D' + s + 'MPTfTL5SLmv7DivfNa'
          ),
          (address) => {
            if (/[<>'"`;]/.test(address)) {
              const result = validateBitcoinAddress(address);
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('Invalid characters');
            }
          }
        ),
        { numRuns: 50 } // Reduced iterations
      );
    });

    // Fuzz test with specific patterns
    it('should handle various malformed inputs', () => {
      const fuzzInputs = [
        // Very long strings
        'a'.repeat(100),
        '1'.repeat(100),
        'bc1q' + 'x'.repeat(50),
        
        // Unicode and special characters
        '🚀🌙💎',
        '中文地址测试',
        'אדרס ביטקוין',
        '\x00\x01\x02',
        String.fromCharCode(0),
        
        // Mixed valid/invalid patterns
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'bc1q' + '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        
        // Numbers and special formats
        '0x1234567890abcdef',
        '::1',
        '127.0.0.1',
        'localhost',
        
        // SQL/Command injection attempts
        "'; DROP TABLE addresses; --",
        '$(echo vulnerable)',
        '${7*7}',
        '{{7*7}}',
        
        // Path traversal attempts
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        
        // Large numbers
        Number.MAX_SAFE_INTEGER.toString(),
        Number.MIN_SAFE_INTEGER.toString(),
        Infinity.toString(),
        NaN.toString(),
      ];

      fuzzInputs.forEach(input => {
        expect(() => validateBitcoinAddress(input)).not.toThrow();
        const result = validateBitcoinAddress(input);
        expect(typeof result.isValid).toBe('boolean');
        if (!result.isValid) {
          expect(result.error).toBeDefined();
        }
      });
    });

    // Performance test
    it('should handle rapid validation calls efficiently', () => {
      const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const iterations = 1000;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        validateBitcoinAddress(testAddress);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should complete 1000 validations in under 50ms
      expect(totalTime).toBeLessThan(50);
    });

    // Consistency test
    it('should be consistent across multiple calls', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }),
          (input) => {
            const result1 = validateBitcoinAddress(input);
            const result2 = validateBitcoinAddress(input);
            
            expect(result1.isValid).toBe(result2.isValid);
            expect(result1.error).toBe(result2.error);
            expect(result1.addressType).toBe(result2.addressType);
            expect(result1.network).toBe(result2.network);
          }
        ),
        { numRuns: 50 } // Reduced iterations
      );
    });

    // Unicode handling
    it('should handle Unicode in addresses gracefully', () => {
      const unicodeAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf' + '测试',
        'bc1q' + '🔑',
        '密码地址',
        '١٢٣٤٥٦٧٨٩٠', // Arabic-Indic numerals
        'А1zР1еР5QGеfi2DМРТfТL5SLmv7DivfNа', // Cyrillic look-alikes
      ];

      unicodeAddresses.forEach(address => {
        expect(() => {
          validateBitcoinAddress(address);
        }).not.toThrow();
        
        const result = validateBitcoinAddress(address);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('isValidBitcoinAddress', () => {
    // Test the boolean wrapper function
    it('should return true for valid addresses', () => {
      expect(isValidBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
      expect(isValidBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(true);
      expect(isValidBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidBitcoinAddress('')).toBe(false);
      expect(isValidBitcoinAddress('invalid')).toBe(false);
      expect(isValidBitcoinAddress('1234567890')).toBe(false);
    });

    it('should handle edge cases without throwing', () => {
      expect(() => isValidBitcoinAddress(null as any)).not.toThrow();
      expect(() => isValidBitcoinAddress(undefined as any)).not.toThrow();
      expect(() => isValidBitcoinAddress(123 as any)).not.toThrow();
      
      expect(isValidBitcoinAddress(null as any)).toBe(false);
      expect(isValidBitcoinAddress(undefined as any)).toBe(false);
      expect(isValidBitcoinAddress(123 as any)).toBe(false);
    });

    // Performance test for boolean wrapper
    it('should efficiently handle rapid boolean checks', () => {
      const addresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'invalid',
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        '',
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      ];
      
      const iterations = 200;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        addresses.forEach(addr => isValidBitcoinAddress(addr));
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should handle 1000 checks (200 iterations * 5 addresses) in under 50ms
      expect(totalTime).toBeLessThan(50);
    });
  });
});