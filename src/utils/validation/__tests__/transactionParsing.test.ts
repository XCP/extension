import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateRawTransactionHex,
  validateTransactionParams,
  validateTransactionType,
  sanitizeTransactionParams,
  checkTransactionForReDoS,
  validateTransactionParsingRequest,
  estimateTransactionParsingMemory,
  type TransactionValidationResult,
  type SafeTransactionParams,
} from '../transactionParsing';

describe('Transaction Parsing Security Tests', () => {
  describe('validateRawTransactionHex', () => {
    it('should accept valid transaction hex', () => {
      const validTxHex = [
        '0100000001a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890000000006a4730440220123456789012345678901234567890123456789012345678901234567890123402207890123456789012345678901234567890123456789012345678901234567890123401210387654321098765432109876543210987654321098765432109876543210987654321ffffffff01402fb4060000000017a914b2c3d4e5f6789012345678901234567890123456788700000000',
        '020000000001010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263',
      ];

      validTxHex.forEach(hex => {
        const result = validateRawTransactionHex(hex);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid hex formats', () => {
      const invalidHex = [
        '',  // Empty
        'not-hex',
        '12345g',  // Invalid hex character
        '123',     // Odd length
        '=SUM(1,1)', // Formula injection
        '@cmd',
        '+malicious',
        '-attack',
      ];

      invalidHex.forEach(hex => {
        const result = validateRawTransactionHex(hex);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject extremely short or long transactions', () => {
      const tooShort = '0'.repeat(58); // 58 chars = 29 bytes, too short
      const tooLong = '0'.repeat(2000002); // Exceeds 1MB limit
      
      expect(validateRawTransactionHex(tooShort).isValid).toBe(false);
      expect(validateRawTransactionHex(tooLong).isValid).toBe(false);
    });

    it('should reject non-string inputs', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true];
      
      invalidInputs.forEach(input => {
        const result = validateRawTransactionHex(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Raw transaction must be a string');
      });
    });

    // Fuzz testing for hex validation
    it('should handle random hex strings safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 60, maxLength: 10000 }).filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0),
        (hexString) => {
          const result = validateRawTransactionHex(hexString);
          
          if (result.isValid) {
            expect(hexString.length % 2).toBe(0); // Valid hex must have even length
            expect(hexString.length).toBeGreaterThanOrEqual(60);
            expect(hexString.length).toBeLessThanOrEqual(2000000);
          }
        }
      ), { numRuns: 50 }); // Reduced for performance
    });

    // Performance test for ReDoS protection
    it('should validate very long hex strings quickly', () => {
      const longHex = '0'.repeat(1000000); // 1MB of hex
      
      const start = Date.now();
      const result = validateRawTransactionHex(longHex);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should complete quickly
      expect(result.isValid).toBe(true); // Should be valid but large
    });
  });

  describe('validateTransactionParams', () => {
    it('should accept valid transaction parameters', () => {
      const validParams = [
        null, // No params should be valid
        undefined,
        {},
        {
          type: 'send',
          asset: 'XCP',
          quantity: '1000000',
          destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        },
        {
          type: 'order',
          give_asset: 'XCP',
          give_quantity: 1000000,
          get_asset: 'BTC',
          get_quantity: 100000000,
        },
      ];

      validParams.forEach(params => {
        const result = validateTransactionParams(params);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid quantities', () => {
      const invalidQuantities = [
        { quantity: -1 },
        { quantity: 'not-a-number' },
        { quantity: Number.MAX_SAFE_INTEGER + 1 },
        { quantity: NaN },
        { quantity: Infinity },
      ];

      invalidQuantities.forEach(params => {
        const result = validateTransactionParams(params);
        expect(result.isValid).toBe(false);
      });
    });

    it('should reject invalid asset names', () => {
      const invalidAssets = [
        { asset: '' },
        { asset: '=SUM(1,1)' },
        { asset: '@malicious' },
        { asset: '+attack' },
        { asset: '-injection' },
        { asset: 'a'.repeat(251) }, // Too long
        { asset: 123 }, // Non-string
      ];

      invalidAssets.forEach(params => {
        const result = validateTransactionParams(params);
        expect(result.isValid).toBe(false);
      });
    });

    it('should reject invalid Bitcoin addresses', () => {
      const invalidAddresses = [
        { destination: '' },
        { destination: '=malicious' },
        { destination: 'invalid-address' },
        { destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7../etc' },
        { to: 'bc1qtooshort' },
      ];

      invalidAddresses.forEach(params => {
        const result = validateTransactionParams(params);
        expect(result.isValid).toBe(false);
      });
    });

    it('should generate warnings for dangerous operations', () => {
      const dangerousParams = [
        { lock: true }, // Asset locking
        { transfer_destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' }, // Ownership transfer
        { status: '10' }, // Dispenser closing
        { quantity: 2000000 }, // Large amount
      ];

      dangerousParams.forEach(params => {
        const result = validateTransactionParams(params);
        expect(result.isValid).toBe(true);
        expect(result.warnings).toBeDefined();
        expect(result.warnings!.length).toBeGreaterThan(0);
      });
    });

    // Fuzz testing for transaction parameters
    it('should handle random parameter objects safely', () => {
      fc.assert(fc.property(
        fc.record({
          asset: fc.string({ maxLength: 100 }),
          quantity: fc.oneof(fc.float(), fc.string({ maxLength: 50 })),
          destination: fc.string({ maxLength: 100 }),
        }, { requiredKeys: [] }),
        (randomParams) => {
          const result = validateTransactionParams(randomParams);
          
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
        }
      ), { numRuns: 50 }); // Reduced for performance
    });
  });

  describe('validateTransactionType', () => {
    it('should accept valid transaction types', () => {
      const validTypes = [
        'send', 'order', 'issuance', 'dispenser', 'dividend',
        'destroy', 'broadcast', 'bet', 'cancel'
      ];

      validTypes.forEach(type => {
        const result = validateTransactionType(type);
        expect(result.isValid).toBe(true);
      });

      validTypes.forEach(method => {
        const result = validateTransactionType('send', method);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid transaction types', () => {
      const invalidTypes = [
        'invalid-type',
        'malicious',
        '=SUM',
        '@cmd',
        '',
      ];

      invalidTypes.forEach(type => {
        const result = validateTransactionType(type);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Unknown transaction type');
      });
    });

    // Fuzz test for type validation
    it('should handle random type strings safely', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 50 }),
        fc.string({ maxLength: 50 }),
        (type, method) => {
          const result = validateTransactionType(type, method);
          expect(typeof result.isValid).toBe('boolean');
        }
      ), { numRuns: 50 }); // Reduced for performance
    });
  });

  describe('sanitizeTransactionParams', () => {
    it('should sanitize dangerous parameter values', () => {
      const dangerousParams = {
        asset: '=SUM(1,1)',
        description: '@malicious\x00command',
        memo: '+injection\x07attack',
        unknown_param: 'should-be-removed',
        quantity: 1000000,
        very_long_string: 'a'.repeat(2000),
      };

      const sanitized = sanitizeTransactionParams(dangerousParams);
      
      expect(sanitized.asset).toBe('SUM(1,1)'); // Injection prefix removed
      expect(sanitized.description).toBe('@maliciouscommand'); // Control chars removed
      expect(sanitized.memo).toBe('injectionattack'); // Cleaned
      expect(sanitized.unknown_param).toBeUndefined(); // Unknown param removed
      expect(sanitized.quantity).toBe(1000000); // Valid number preserved
      expect(sanitized.very_long_string?.length).toBe(1000); // Truncated
    });

    it('should handle non-object inputs safely', () => {
      const invalidInputs = [null, undefined, 'string', 123, []];
      
      invalidInputs.forEach(input => {
        const result = sanitizeTransactionParams(input);
        expect(result).toEqual({});
      });
    });

    it('should preserve valid values', () => {
      const validParams = {
        type: 'send',
        asset: 'XCP',
        quantity: 1000000,
        divisible: true,
        lock: false,
      };

      const sanitized = sanitizeTransactionParams(validParams);
      expect(sanitized).toEqual(validParams);
    });

    // Fuzz test sanitization
    it('should sanitize random parameter objects safely', () => {
      fc.assert(fc.property(
        fc.dictionary(
          fc.string({ maxLength: 50 }),
          fc.oneof(
            fc.string({ maxLength: 200 }),
            fc.float(),
            fc.boolean()
          )
        ),
        (randomParams) => {
          const result = sanitizeTransactionParams(randomParams);
          
          expect(typeof result).toBe('object');
          expect(result).not.toBeNull();
          
          // All values should be safe types
          Object.values(result).forEach(value => {
            expect(['string', 'number', 'boolean'].includes(typeof value)).toBe(true);
          });
        }
      ), { numRuns: 50 }); // Reduced for performance
    });
  });

  describe('checkTransactionForReDoS', () => {
    it('should detect extremely long transaction hex', () => {
      const longHex = '0'.repeat(1000001);
      expect(checkTransactionForReDoS(longHex)).toBe(true);
    });

    it('should detect repeated patterns in parameters', () => {
      const params = {
        description: 'abc'.repeat(150), // Repeated pattern
      };
      
      expect(checkTransactionForReDoS('validhex123', params)).toBe(true);
    });

    it('should detect very long parameter strings', () => {
      const params = {
        memo: 'a'.repeat(50001),
      };
      
      expect(checkTransactionForReDoS('validhex123', params)).toBe(true);
    });

    it('should allow normal transaction data', () => {
      const normalHex = '0'.repeat(1000);
      const normalParams = {
        type: 'send',
        asset: 'XCP',
        quantity: 1000000,
      };
      
      expect(checkTransactionForReDoS(normalHex, normalParams)).toBe(false);
    });

    // Performance test for ReDoS detection
    it('should perform ReDoS detection quickly', () => {
      const testCases = [
        ['0'.repeat(10000), null],
        ['validhex', { description: 'test'.repeat(100) }],
      ];

      testCases.forEach(([hex, params]) => {
        const start = Date.now();
        const result = checkTransactionForReDoS(hex as string, params);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(50); // Should be very fast
        expect(typeof result).toBe('boolean');
      });
    });
  });

  describe('validateTransactionParsingRequest', () => {
    it('should validate complete valid requests', () => {
      const validRequests = [
        {
          rawTxHex: '0'.repeat(200),
          params: {
            type: 'send',
            asset: 'XCP',
            quantity: 1000000,
            destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          },
        },
        {
          rawTxHex: 'a1b2c3d4'.repeat(50),
          params: null,
        },
      ];

      validRequests.forEach(({ rawTxHex, params }) => {
        const result = validateTransactionParsingRequest(rawTxHex, params);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject requests with invalid hex', () => {
      const result = validateTransactionParsingRequest('invalid-hex', {});
      expect(result.isValid).toBe(false);
    });

    it('should reject requests with ReDoS risks', () => {
      const longHex = '0'.repeat(1000001);
      const result = validateTransactionParsingRequest(longHex, null);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('performance issues');
    });

    it('should reject requests with invalid parameters', () => {
      const validHex = '0'.repeat(200);
      const invalidParams = { quantity: -1 };
      
      const result = validateTransactionParsingRequest(validHex, invalidParams);
      expect(result.isValid).toBe(false);
    });

    // Comprehensive fuzz testing
    it('should handle completely random requests safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 60, maxLength: 1000 }).filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0),
        fc.oneof(
          fc.constant(null),
          fc.record({
            type: fc.string({ maxLength: 20 }),
            asset: fc.string({ maxLength: 50 }),
            quantity: fc.oneof(fc.float(), fc.string({ maxLength: 30 })),
          }, { requiredKeys: [] })
        ),
        (rawTxHex, params) => {
          const result = validateTransactionParsingRequest(rawTxHex, params);
          
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
        }
      ), { numRuns: 50 }); // Reduced for performance
    });
  });

  describe('estimateTransactionParsingMemory', () => {
    it('should estimate memory usage correctly', () => {
      const txHex = '0'.repeat(1000);
      const params = { asset: 'XCP', quantity: 1000000 };
      
      const estimate = estimateTransactionParsingMemory(txHex, params);
      
      expect(estimate).toBeGreaterThan(0);
      expect(typeof estimate).toBe('number');
      
      // Should be reasonable estimate (not negative or extremely large)
      expect(estimate).toBeLessThan(100000000); // Less than 100MB
    });

    it('should handle different input sizes', () => {
      const sizes = [100, 1000, 10000];
      
      sizes.forEach(size => {
        const txHex = '0'.repeat(size);
        const estimate = estimateTransactionParsingMemory(txHex);
        
        expect(estimate).toBeGreaterThan(size); // Should be at least input size
      });
    });

    // Fuzz test memory estimation
    it('should estimate memory for random inputs', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 10000 }).filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length > 0),
        fc.oneof(
          fc.constant(null),
          fc.record({ asset: fc.string({ maxLength: 100 }) })
        ),
        (txHex, params) => {
          const estimate = estimateTransactionParsingMemory(txHex, params);
          
          expect(typeof estimate).toBe('number');
          expect(estimate).toBeGreaterThan(0);
          expect(estimate).toBeLessThan(1000000000); // Reasonable upper bound
        }
      ), { numRuns: 25 }); // Reduced for performance
    });
  });

  // Security-specific edge case testing
  describe('Security Edge Cases', () => {
    it('should handle null byte injection attempts', () => {
      const nullByteAttacks = [
        'validhex\x00malicious',
        { asset: 'XCP\x00.exe' },
        { memo: 'message\x00hidden' },
      ];

      // Hex with null byte
      const hexResult = validateRawTransactionHex(nullByteAttacks[0] as string);
      expect(hexResult.isValid).toBe(false);

      // Parameters with null bytes
      nullByteAttacks.slice(1).forEach(params => {
        const result = validateTransactionParams(params);
        // Should either reject or sanitize
        if (result.isValid) {
          const sanitized = sanitizeTransactionParams(params);
          Object.values(sanitized).forEach(value => {
            if (typeof value === 'string') {
              expect(value).not.toContain('\x00');
            }
          });
        }
      });
    });

    it('should handle Unicode normalization attacks', () => {
      const unicodeAttacks = [
        { asset: 'café' }, // é as single character
        { asset: 'cafe\u0301' }, // é as e + combining accent
      ];

      unicodeAttacks.forEach(params => {
        const result = validateTransactionParams(params);
        expect(typeof result.isValid).toBe('boolean');
      });
    });

    it('should handle prototype pollution attempts', () => {
      const pollutionAttempts = [
        { __proto__: { polluted: true } } as any,
        { constructor: { prototype: { polluted: true } } } as any,
        { 'constructor.prototype.polluted': true } as any,
      ];

      pollutionAttempts.forEach(params => {
        const sanitized = sanitizeTransactionParams(params);
        expect(sanitized.__proto__).toBeUndefined();
        expect(sanitized.constructor).toBeUndefined();
      });
    });

    it('should handle extremely nested object attacks', () => {
      // Create deeply nested object
      let nested: any = { value: 'deep' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }

      const result = sanitizeTransactionParams(nested);
      expect(typeof result).toBe('object');
    });

    it('should handle circular reference attacks', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not crash or hang
      const start = Date.now();
      const result = sanitizeTransactionParams(circular);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000);
      expect(typeof result).toBe('object');
    });

    it('should handle buffer overflow attempts', () => {
      const overflowAttempts = [
        'a'.repeat(10000000), // 10MB string
        { description: 'x'.repeat(1000000) }, // 1MB description
      ];

      // Large hex string
      const start1 = Date.now();
      const hexResult = validateRawTransactionHex(overflowAttempts[0] as string);
      const duration1 = Date.now() - start1;
      
      expect(duration1).toBeLessThan(1000);
      expect(hexResult.isValid).toBe(false); // Should reject

      // Large parameter
      const start2 = Date.now();
      const paramResult = validateTransactionParams(overflowAttempts[1]);
      const duration2 = Date.now() - start2;
      
      expect(duration2).toBeLessThan(1000);
      expect(typeof paramResult.isValid).toBe('boolean');
    });
  });
});