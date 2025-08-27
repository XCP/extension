/**
 * Fuzz testing for transaction parser - critical security component
 * Tests our custom parsing logic that shows users what they're signing
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseTransaction, validateTransactionSafety } from '../transactionParser';
import { Buffer } from 'buffer';

// Helper to generate hex strings
const hexString = (constraints?: { minLength?: number; maxLength?: number }) => {
  const min = constraints?.minLength ?? 0;
  const max = constraints?.maxLength ?? 100;
  return fc.string({ minLength: min, maxLength: max }).map(s => {
    // Convert string to hex
    return Buffer.from(s).toString('hex');
  });
};

describe('Transaction Parser Fuzz Testing', () => {
  describe('parseTransaction fuzzing', () => {
    it('should handle arbitrary hex strings without crashing', () => {
      fc.assert(
        fc.property(
          hexString({ minLength: 0, maxLength: 10000 }),
          (hexString) => {
            const result = parseTransaction(hexString);
            
            // Should always return a valid structure
            expect(result).toBeDefined();
            expect(result.type).toBeDefined();
            expect(result.details).toBeDefined();
            expect(result.raw).toBe(hexString);
            
            // Should not throw
            expect(() => parseTransaction(hexString)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle malformed params objects', () => {
      fc.assert(
        fc.property(
          hexString({ minLength: 60, maxLength: 2000 }),
          fc.object({ maxDepth: 3 }),
          (hexString, params) => {
            const result = parseTransaction(hexString, params);
            
            // Should gracefully handle any params shape
            expect(result).toBeDefined();
            expect(result.type).toBeDefined();
            expect(typeof result.details).toBe('object');
            
            // Should not expose raw object internals
            const detailsStr = JSON.stringify(result.details);
            expect(detailsStr).not.toMatch(/\[object Object\]/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle params with extreme numeric values', () => {
      fc.assert(
        fc.property(
          hexString({ minLength: 100, maxLength: 500 }),
          fc.record({
            type: fc.constantFrom('send', 'order', 'issuance', 'dispenser', 'dividend'),
            quantity: fc.oneof(
              fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
              fc.double({ noNaN: true }),
              fc.constantFrom(Infinity, -Infinity, 0, -0)
            ),
            give_quantity: fc.bigInt({ min: BigInt('-1' + '0'.repeat(100)), max: BigInt('1' + '0'.repeat(100)) }).map(String),
            get_quantity: fc.float({ noNaN: true, min: Math.fround(-1e10), max: Math.fround(1e10) }),
            quantity_per_unit: fc.nat().map(n => n.toString()),
            divisible: fc.boolean(),
            expiration: fc.integer()
          }),
          (hexString, params) => {
            const result = parseTransaction(hexString, params);
            
            // Should handle extreme numbers gracefully
            expect(result).toBeDefined();
            
            // Check formatted amounts don't cause issues
            if (result.amount) {
              expect(result.amount).not.toMatch(/undefined/);
              expect(result.amount).not.toMatch(/null/);
              expect(result.amount).not.toMatch(/NaN/);
            }
            
            // Details should be safely stringified
            for (const value of Object.values(result.details)) {
              if (typeof value === 'string') {
                expect(value).not.toMatch(/undefined/);
                expect(value).not.toMatch(/\[object/);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle Unicode and special characters in params', () => {
      fc.assert(
        fc.property(
          hexString({ minLength: 100, maxLength: 500 }),
          fc.record({
            type: fc.constantFrom('send', 'order', 'issuance'),
            asset: fc.string({ minLength: 0, maxLength: 100 }),
            destination: fc.string(), // Any string
            description: fc.string({ minLength: 0, maxLength: 1000 }),
            memo: fc.oneof(
              fc.string(),
              fc.constantFrom('', null, undefined),
              fc.string().map(s => '\x00' + s), // Null bytes
              fc.string().map(s => s + '\r\n\t') // Control chars
            ),
            dividend_asset: fc.string(), // Any string
          }),
          (hexString, params) => {
            const result = parseTransaction(hexString, params);
            
            // Should safely handle Unicode
            expect(result).toBeDefined();
            
            // Check for XSS prevention
            const jsonStr = JSON.stringify(result);
            expect(jsonStr).not.toMatch(/<script/i);
            expect(jsonStr).not.toMatch(/javascript:/i);
            
            // Should not have null bytes in output
            for (const value of Object.values(result.details)) {
              if (typeof value === 'string') {
                expect(value).not.toContain('\x00');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle Buffer edge cases', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('0'),
            fc.constant('00'),
            hexString({ minLength: 1, maxLength: 1 }), // Odd length
            hexString().map(s => 'zz' + s), // Invalid hex
            fc.string(), // Non-hex
            fc.constantFrom(null, undefined, {}, [], true, false).map(String)
          ),
          (input) => {
            // Should handle invalid hex gracefully
            const result = parseTransaction(input);
            expect(result).toBeDefined();
            expect(result.type).toBeDefined();
            
            // Should not leak Buffer errors
            if (result.details['Error']) {
              expect(result.details['Error']).not.toMatch(/Buffer/);
              expect(result.details['Error']).not.toMatch(/offset/);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle deeply nested params', () => {
      fc.assert(
        fc.property(
          hexString({ minLength: 100, maxLength: 500 }),
          fc.object({ maxDepth: 10 }), // Very deep nesting
          (hexString, params) => {
            // Add transaction type to deeply nested object
            const paramsWithType = { ...params, type: 'send' };
            
            // Should not crash on deep objects
            expect(() => parseTransaction(hexString, paramsWithType)).not.toThrow();
            
            const result = parseTransaction(hexString, paramsWithType);
            expect(result).toBeDefined();
            
            // Should not have circular reference issues
            expect(() => JSON.stringify(result)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateTransactionSafety fuzzing', () => {
    it('should handle arbitrary parsed transactions', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.string({ minLength: 0, maxLength: 1000 }),
            amount: fc.oneof(
              fc.string(),
              fc.float().map(String),
              fc.constantFrom('', 'NaN', 'Infinity', '-Infinity', null, undefined).map(String)
            ),
            details: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 100 }),
              fc.anything()
            ),
            raw: fc.string()
          }),
          (parsed) => {
            const result = validateTransactionSafety(parsed as any);
            
            // Should always return valid structure
            expect(result).toBeDefined();
            expect(typeof result.isSafe).toBe('boolean');
            expect(Array.isArray(result.warnings)).toBe(true);
            
            // Warnings should be strings
            for (const warning of result.warnings) {
              expect(typeof warning).toBe('string');
              expect(warning.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect dangerous amounts correctly', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.float({ min: 1000001, max: Math.fround(1e15) }),
            fc.bigInt({ min: BigInt(1000001), max: BigInt('100000000000000000000') })
          ).map(String),
          (amount) => {
            const parsed = {
              type: 'Send Asset',
              amount,
              details: {},
              raw: ''
            };
            
            const result = validateTransactionSafety(parsed);
            
            // Should warn about large amounts
            expect(result.warnings.some(w => w.includes('Large amount'))).toBe(true);
            expect(result.isSafe).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle malformed amount fields', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 1000 }),
            fc.array(fc.anything()),
            fc.object(),
            fc.constantFrom(null, undefined, NaN, Infinity, -Infinity)
          ),
          (amount) => {
            const parsed = {
              type: 'Send Asset',
              amount: amount as any,
              details: {},
              raw: ''
            };
            
            // Should not crash on bad amounts
            expect(() => validateTransactionSafety(parsed)).not.toThrow();
            
            const result = validateTransactionSafety(parsed);
            expect(result).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle details with prototype pollution attempts', () => {
      fc.assert(
        fc.property(
          fc.record({
            '__proto__': fc.anything(),
            'constructor': fc.anything(),
            'prototype': fc.anything(),
            'Transfer To': fc.string(),
            'Locked': fc.constantFrom('Yes', 'No', 'yes', 'YES', true, false, 1, 0)
          }),
          (details) => {
            const parsed = {
              type: 'Issue Asset',
              details,
              raw: ''
            };
            
            // Should not be affected by prototype pollution
            const result = validateTransactionSafety(parsed as any);
            expect(result).toBeDefined();
            expect(result.warnings).toBeDefined();
            
            // Original object prototype should be unchanged
            expect(Object.prototype.toString()).toBe('[object Object]');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('formatQuantity edge cases', () => {
    it('should handle formatting with extreme divisibility values through parseTransaction', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant('send'),
            quantity: fc.oneof(
              fc.nat(),
              fc.float({ noNaN: true }),
              fc.bigInt().map(n => n.toString())
            ),
            divisible: fc.oneof(
              fc.boolean(),
              fc.constantFrom(null, undefined, 0, 1, 'true', 'false', '', NaN)
            ),
            asset: fc.constant('TEST')
          }),
          (params) => {
            const result = parseTransaction('aabbccdd', params);
            
            // Should handle divisibility edge cases
            expect(result).toBeDefined();
            if (result.amount) {
              // Amount should be a string
              expect(typeof result.amount).toBe('string');
              // Amount should be properly formatted
              if (result.amount !== 'Unknown' && result.amount !== 'Invalid' && 
                  result.amount !== 'Value too large' && result.amount !== 'Invalid (negative)') {
                expect(result.amount).not.toMatch(/e[+-]/i);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Cross-function interaction fuzzing', () => {
    it('should maintain consistency between parse and validate', () => {
      fc.assert(
        fc.property(
          hexString({ minLength: 60, maxLength: 2000 }),
          fc.oneof(
            fc.record({
              type: fc.constantFrom('send', 'order', 'issuance', 'dispenser', 'dividend'),
              quantity: fc.nat(),
              asset: fc.string({ minLength: 1, maxLength: 20 }),
              divisible: fc.boolean()
            }),
            fc.constant(undefined)
          ),
          (hex, params) => {
            // Parse then validate
            const parsed = parseTransaction(hex, params);
            const validation = validateTransactionSafety(parsed);
            
            // Validate the parsed result again should give same result
            const validation2 = validateTransactionSafety(parsed);
            expect(validation.isSafe).toBe(validation2.isSafe);
            expect(validation.warnings.length).toBe(validation2.warnings.length);
            
            // Parse again should give same structure
            const parsed2 = parseTransaction(hex, params);
            expect(parsed.type).toBe(parsed2.type);
            expect(Object.keys(parsed.details).length).toBe(Object.keys(parsed2.details).length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});