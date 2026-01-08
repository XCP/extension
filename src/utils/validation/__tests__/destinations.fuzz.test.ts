/**
 * Fuzz tests for destination validation functions
 * Tests multi-destination validation, parsing, and limits
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateDestinations,
  areDestinationsComplete,
  validateDestinationCount,
  parseMultiLineDestinations,
  isMPMASupported,
  type Destination,
} from '../destinations';

// Valid Bitcoin addresses for testing
const VALID_ADDRESSES = [
  '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
  'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
];

// Arbitraries for fast-check
const validAddressArb = fc.constantFrom(...VALID_ADDRESSES);

const destinationArb = (addressArb: fc.Arbitrary<string>) =>
  fc.record({
    id: fc.nat(),
    address: addressArb,
  });

describe('Destinations Validation Fuzz Tests', () => {
  describe('validateDestinations', () => {
    it('should handle arbitrary destination arrays without crashing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer(),
              address: fc.string(),
            }),
            { maxLength: 50 }
          ),
          (destinations) => {
            expect(() => {
              validateDestinations(destinations);
            }).not.toThrow();

            const result = validateDestinations(destinations);
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('duplicates');
            expect(typeof result.isValid).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate arrays of valid addresses', () => {
      fc.assert(
        fc.property(
          fc.array(destinationArb(validAddressArb), { minLength: 1, maxLength: 10 })
            .filter(dests => {
              // Ensure unique addresses for this test
              const addresses = dests.map(d => d.address.toLowerCase());
              return new Set(addresses).size === addresses.length;
            }),
          (destinations) => {
            const result = validateDestinations(destinations);
            expect(result.isValid).toBe(true);
            expect(Object.keys(result.errors)).toHaveLength(0);
            expect(result.duplicates.size).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect duplicate addresses', () => {
      fc.assert(
        fc.property(
          validAddressArb,
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 101, max: 200 }),
          (address, id1, id2) => {
            const destinations: Destination[] = [
              { id: id1, address },
              { id: id2, address },
            ];

            const result = validateDestinations(destinations);
            expect(result.isValid).toBe(false);
            expect(result.duplicates.has(address.toLowerCase())).toBe(true);
            // Second occurrence should have the error
            expect(result.errors[id2]).toContain('Duplicate');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect invalid addresses', () => {
      const invalidAddresses = [
        'not_an_address',
        '1234567890',
        'invalid',
        'bc1invalid',
        '',
      ];

      invalidAddresses.forEach((address) => {
        const destinations: Destination[] = [{ id: 1, address }];
        const result = validateDestinations(destinations);

        if (address === '') {
          // Empty addresses are skipped in validation loop but fail completeness check
          expect(result.isValid).toBe(false);
        } else {
          expect(result.isValid).toBe(false);
          expect(result.errors[1]).toBeDefined();
        }
      });
    });

    it('should handle empty destination arrays', () => {
      const result = validateDestinations([]);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should handle destinations with empty addresses', () => {
      const destinations: Destination[] = [
        { id: 1, address: '' },
        { id: 2, address: '   ' },
      ];

      const result = validateDestinations(destinations);
      expect(result.isValid).toBe(false);
    });

    it('should handle mixed valid and invalid addresses', () => {
      fc.assert(
        fc.property(
          fc.tuple(validAddressArb, fc.string({ maxLength: 20 })),
          ([validAddress, randomString]) => {
            const destinations: Destination[] = [
              { id: 1, address: validAddress },
              { id: 2, address: randomString },
            ];

            const result = validateDestinations(destinations);

            // Should not crash
            expect(result).toHaveProperty('isValid');

            // Valid address should not have error (unless it matches randomString which is unlikely)
            if (validAddress.toLowerCase() !== randomString.toLowerCase()) {
              expect(result.errors[1]).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be case-insensitive for duplicate detection', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const destinations: Destination[] = [
        { id: 1, address: address.toLowerCase() },
        { id: 2, address: address.toUpperCase() },
      ];

      const result = validateDestinations(destinations);
      // Both should be detected as duplicates (case-insensitive)
      expect(result.duplicates.size).toBeGreaterThan(0);
    });

    it('should handle injection attempts in addresses', () => {
      const injections = [
        '<script>alert(1)</script>',
        "'; DROP TABLE users;--",
        '${process.env.SECRET}',
        '../../etc/passwd',
        '{{template}}',
      ];

      injections.forEach((injection) => {
        const destinations: Destination[] = [{ id: 1, address: injection }];

        expect(() => validateDestinations(destinations)).not.toThrow();

        const result = validateDestinations(destinations);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('areDestinationsComplete', () => {
    it('should handle arbitrary destination arrays without crashing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer(),
              address: fc.string(),
            }),
            { maxLength: 50 }
          ),
          (destinations) => {
            expect(() => {
              areDestinationsComplete(destinations);
            }).not.toThrow();

            const result = areDestinationsComplete(destinations);
            expect(typeof result).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true when all destinations have addresses', () => {
      fc.assert(
        fc.property(
          fc.array(destinationArb(validAddressArb), { minLength: 1, maxLength: 10 }),
          (destinations) => {
            const result = areDestinationsComplete(destinations);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for empty arrays', () => {
      expect(areDestinationsComplete([])).toBe(false);
    });

    it('should return false when any destination has empty address', () => {
      const testCases = [
        [{ id: 1, address: '' }],
        [{ id: 1, address: '   ' }],
        [{ id: 1, address: VALID_ADDRESSES[0] }, { id: 2, address: '' }],
        [{ id: 1, address: '\t\n' }],
      ];

      testCases.forEach((destinations) => {
        expect(areDestinationsComplete(destinations)).toBe(false);
      });
    });

    it('should handle whitespace-only addresses correctly', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')),
          (whitespace) => {
            const destinations: Destination[] = [{ id: 1, address: whitespace }];
            expect(areDestinationsComplete(destinations)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('validateDestinationCount', () => {
    it('should handle arbitrary numbers without crashing', () => {
      fc.assert(
        fc.property(fc.integer(), (count) => {
          expect(() => {
            validateDestinationCount(count);
          }).not.toThrow();

          const result = validateDestinationCount(count);
          expect(result).toHaveProperty('isValid');
          expect(typeof result.isValid).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });

    it('should accept valid counts (1-1000)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000 }), (count) => {
          const result = validateDestinationCount(count);
          expect(result.isValid).toBe(true);
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should reject zero and negative counts', () => {
      fc.assert(
        fc.property(fc.integer({ max: 0 }), (count) => {
          const result = validateDestinationCount(count);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('At least one');
        }),
        { numRuns: 100 }
      );
    });

    it('should reject counts over 1000', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1001, max: 100000 }), (count) => {
          const result = validateDestinationCount(count);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('Maximum');
        }),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases', () => {
      expect(validateDestinationCount(1).isValid).toBe(true);
      expect(validateDestinationCount(1000).isValid).toBe(true);
      expect(validateDestinationCount(0).isValid).toBe(false);
      expect(validateDestinationCount(1001).isValid).toBe(false);
      expect(validateDestinationCount(-1).isValid).toBe(false);
    });
  });

  describe('parseMultiLineDestinations', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(fc.string(), (text) => {
          expect(() => {
            parseMultiLineDestinations(text);
          }).not.toThrow();

          const result = parseMultiLineDestinations(text);
          expect(Array.isArray(result)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should split on newlines correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), {
            minLength: 1,
            maxLength: 10,
          }),
          (addresses) => {
            const input = addresses.join('\n');
            const result = parseMultiLineDestinations(input);

            // Should have at least as many results as non-empty lines
            const expectedCount = addresses.filter(a => a.trim().length > 0).length;
            expect(result.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle different line endings', () => {
      const addresses = VALID_ADDRESSES.slice(0, 3);

      // Unix style
      expect(parseMultiLineDestinations(addresses.join('\n'))).toHaveLength(3);

      // Windows style
      expect(parseMultiLineDestinations(addresses.join('\r\n'))).toHaveLength(3);

      // Old Mac style
      expect(parseMultiLineDestinations(addresses.join('\r'))).toHaveLength(3);

      // Mixed
      expect(parseMultiLineDestinations(
        `${addresses[0]}\n${addresses[1]}\r\n${addresses[2]}`
      )).toHaveLength(3);
    });

    it('should trim whitespace from lines', () => {
      const input = '  address1  \n\t  address2\t\n   address3   ';
      const result = parseMultiLineDestinations(input);

      expect(result).toEqual(['address1', 'address2', 'address3']);
    });

    it('should filter empty lines', () => {
      const input = 'address1\n\n\naddress2\n   \n\naddress3';
      const result = parseMultiLineDestinations(input);

      expect(result).toEqual(['address1', 'address2', 'address3']);
    });

    it('should handle empty input', () => {
      expect(parseMultiLineDestinations('')).toEqual([]);
      expect(parseMultiLineDestinations('   ')).toEqual([]);
      expect(parseMultiLineDestinations('\n\n\n')).toEqual([]);
    });

    it('should handle very long input', () => {
      const longInput = VALID_ADDRESSES[0] + '\n'.repeat(100) + VALID_ADDRESSES[1];

      const start = performance.now();
      const result = parseMultiLineDestinations(longInput);
      const elapsed = performance.now() - start;

      expect(result).toHaveLength(2);
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle injection attempts in multi-line input', () => {
      const injections = [
        '<script>alert(1)</script>',
        "'; DROP TABLE users;--",
        '${process.env.SECRET}',
      ];

      const input = injections.join('\n');

      expect(() => parseMultiLineDestinations(input)).not.toThrow();

      const result = parseMultiLineDestinations(input);
      expect(result).toHaveLength(3);
      // Should preserve the strings as-is (validation happens elsewhere)
      expect(result).toEqual(injections);
    });
  });

  describe('isMPMASupported', () => {
    it('should handle arbitrary asset names without crashing', () => {
      fc.assert(
        fc.property(fc.string(), (asset) => {
          expect(() => {
            isMPMASupported(asset);
          }).not.toThrow();

          const result = isMPMASupported(asset);
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });

    it('should return false for BTC', () => {
      expect(isMPMASupported('BTC')).toBe(false);
    });

    it('should return true for non-BTC assets', () => {
      const assets = ['XCP', 'PEPECASH', 'RAREPEPE', 'A123456789', 'TEST'];

      assets.forEach((asset) => {
        expect(isMPMASupported(asset)).toBe(true);
      });
    });

    it('should be case-sensitive for BTC check', () => {
      // Only exact 'BTC' should be false
      expect(isMPMASupported('BTC')).toBe(false);
      expect(isMPMASupported('btc')).toBe(true);
      expect(isMPMASupported('Btc')).toBe(true);
    });
  });

  describe('Security and edge case tests', () => {
    it('should handle extremely large destination arrays', () => {
      const largeArray: Destination[] = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        address: VALID_ADDRESSES[i % VALID_ADDRESSES.length],
      }));

      const start = performance.now();
      const result = validateDestinations(largeArray);
      const elapsed = performance.now() - start;

      expect(result).toHaveProperty('isValid');
      expect(elapsed).toBeLessThan(500);
    });

    it('should handle destinations with special characters in IDs', () => {
      // IDs should be numbers, but test resilience
      const destinations = [
        { id: 0, address: VALID_ADDRESSES[0] },
        { id: -1, address: VALID_ADDRESSES[1] },
        { id: Number.MAX_SAFE_INTEGER, address: VALID_ADDRESSES[2] },
      ];

      expect(() => validateDestinations(destinations)).not.toThrow();
    });

    it('should maintain consistency across multiple calls', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.nat({ max: 100 }),
              address: fc.constantFrom(...VALID_ADDRESSES, 'invalid', ''),
            }),
            { maxLength: 10 }
          ),
          (destinations) => {
            const result1 = validateDestinations(destinations);
            const result2 = validateDestinations(destinations);

            expect(result1.isValid).toBe(result2.isValid);
            expect(Object.keys(result1.errors).sort()).toEqual(
              Object.keys(result2.errors).sort()
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
