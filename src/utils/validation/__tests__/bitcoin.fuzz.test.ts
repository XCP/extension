/**
 * Fuzz tests for Bitcoin validation
 * Tests address validation, amount validation, and transaction calculations
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateBitcoinAddress,
  validateBitcoinAmount,
  validateTransactionFee,
  validateUTXO,
  estimateTransactionSize,
  DUST_LIMIT,
  MAX_SATOSHIS,
  SATOSHIS_PER_BTC
} from '../bitcoin';

describe('Bitcoin Validation Fuzz Tests', () => {
  describe('validateBitcoinAddress', () => {
    it('should validate known mainnet addresses', () => {
      const validAddresses = [
        { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', type: 'P2PKH' }, // Genesis
        { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', type: 'P2SH' },
        { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', type: 'P2WPKH' },
        { address: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', type: 'P2TR' },
      ];

      validAddresses.forEach(({ address, type }) => {
        const result = validateBitcoinAddress(address);
        expect(result.isValid).toBe(true);
        expect(result.addressType).toBe(type);
        expect(result.network).toBe('mainnet');
      });
    });

    it('should validate testnet addresses', () => {
      const testnetAddresses = [
        { address: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', type: 'P2PKH' },
        { address: '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', type: 'P2SH' },
        { address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', type: 'P2WPKH' },
        { address: 'tb1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', type: 'P2TR' },
      ];

      testnetAddresses.forEach(({ address, type }) => {
        const result = validateBitcoinAddress(address);
        expect(result.isValid).toBe(true);
        expect(result.addressType).toBe(type);
        expect(result.network).toBe('testnet');
      });
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        { address: '', shouldFail: true },
        { address: 'invalid', shouldFail: true },
        { address: '1234567890', shouldFail: true },
        { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', shouldFail: true }, // Ethereum
        { address: 'bc1zzz', shouldFail: true }, // Invalid bech32
        { address: '<script>alert(1)</script>', shouldFail: true },
        { address: '../../../etc/passwd', shouldFail: true },
      ];

      invalidAddresses.forEach(({ address, shouldFail }) => {
        const result = validateBitcoinAddress(address);
        if (shouldFail) {
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
        }
      });
    });

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
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should reject addresses with injection characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => 
            '1A1zP1eP5QGefi2DMPTfTL5SLmv7Div' + s
          ),
          (address) => {
            if (/[<>'"`;]/.test(address)) {
              const result = validateBitcoinAddress(address);
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('Invalid characters');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateBitcoinAmount', () => {
    it('should validate correct BTC amounts', () => {
      const validAmounts = [
        { amount: '0.00000001', unit: 'btc', satoshis: 1 },
        { amount: '0.00000546', unit: 'btc', satoshis: 546 }, // Dust limit
        { amount: '1', unit: 'btc', satoshis: 100000000 },
        { amount: '21000000', unit: 'btc', satoshis: 2100000000000000 },
      ];

      validAmounts.forEach(({ amount, unit, satoshis }) => {
        const result = validateBitcoinAmount(amount, { unit: unit as 'btc' });
        expect(result.isValid).toBe(true);
        expect(result.satoshis).toBe(satoshis);
      });
    });

    it('should validate satoshi amounts', () => {
      const validAmounts = [
        { amount: 1, expected: '0.00000001' },
        { amount: 546, expected: '0.00000546' },
        { amount: 100000000, expected: '1.00000000' },
        { amount: MAX_SATOSHIS, expected: '21000000.00000000' },
      ];

      validAmounts.forEach(({ amount, expected }) => {
        const result = validateBitcoinAmount(amount, { unit: 'satoshis' });
        expect(result.isValid).toBe(true);
        expect(result.btc).toBe(expected);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = [
        { amount: '', error: 'required' },
        { amount: '-1', error: 'negative' },
        { amount: 'abc', error: 'characters' },
        { amount: '=1+1', error: 'Invalid' },
        { amount: 'Infinity', error: 'characters' },
        { amount: 'NaN', error: 'characters' },
        { amount: '21000001', unit: 'btc', error: 'exceeds maximum' },
        { amount: '0.000000001', unit: 'btc', error: 'whole number' }, // Sub-satoshi
      ];

      invalidAmounts.forEach(({ amount, unit, error }) => {
        const result = validateBitcoinAmount(amount, { unit: unit as 'btc' });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain(error);
      });
    });

    it('should enforce dust limit', () => {
      const result1 = validateBitcoinAmount('545', { unit: 'satoshis', allowDust: false });
      expect(result1.isValid).toBe(false);
      expect(result1.error).toContain('dust');

      const result2 = validateBitcoinAmount('545', { unit: 'satoshis', allowDust: true });
      expect(result2.isValid).toBe(true);
    });

    it('should handle zero amounts', () => {
      const result1 = validateBitcoinAmount('0', { allowZero: false });
      expect(result1.isValid).toBe(false);
      expect(result1.error).toContain('greater than zero');

      const result2 = validateBitcoinAmount('0', { allowZero: true });
      expect(result2.isValid).toBe(true);
    });

    it('should handle arbitrary numeric strings safely', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              validateBitcoinAmount(input);
            }).not.toThrow();
            
            const result = validateBitcoinAmount(input);
            expect(result).toHaveProperty('isValid');
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should handle edge case numbers', () => {
      const edgeCases = [
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.EPSILON,
        0,
        -0,
        1e-10,
        1e10,
      ];

      edgeCases.forEach(amount => {
        expect(() => {
          validateBitcoinAmount(amount);
        }).not.toThrow();
      });
    });

    it('should maintain precision for BTC amounts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: MAX_SATOSHIS }),
          (satoshis) => {
            const btc = (satoshis / SATOSHIS_PER_BTC).toFixed(8);
            const result = validateBitcoinAmount(btc, { unit: 'btc', allowDust: true });
            
            if (result.isValid) {
              expect(result.satoshis).toBe(satoshis);
              // Check round-trip conversion
              const backToBtc = parseFloat(result.btc!);
              expect(Math.abs(backToBtc - parseFloat(btc))).toBeLessThan(1e-8);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateTransactionFee', () => {
    it('should validate reasonable fee rates', () => {
      const validRates = [
        { rate: 1, desc: 'minimum' },
        { rate: 10, desc: 'low' },
        { rate: 50, desc: 'medium' },
        { rate: 200, desc: 'high' },
        { rate: 500, desc: 'very high' },
      ];

      validRates.forEach(({ rate }) => {
        const result = validateTransactionFee(rate);
        expect(result.isValid).toBe(true);
        expect(result.satsPerByte).toBe(rate);
      });
    });

    it('should reject invalid fee rates', () => {
      const invalidRates = [
        { rate: 0, error: 'too low' },
        { rate: -1, error: 'too low' },
        { rate: 1001, error: 'too high' },
        { rate: 'abc', error: 'Invalid fee rate format' },
        { rate: '=1+1', error: 'Invalid fee rate format' },
        { rate: Infinity, error: 'valid number' },
      ];

      invalidRates.forEach(({ rate, error }) => {
        const result = validateTransactionFee(rate);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain(error);
      });
    });

    it('should respect custom min/max limits', () => {
      const result1 = validateTransactionFee(5, { minFeeRate: 10 });
      expect(result1.isValid).toBe(false);

      const result2 = validateTransactionFee(100, { maxFeeRate: 50 });
      expect(result2.isValid).toBe(false);

      const result3 = validateTransactionFee(25, { minFeeRate: 10, maxFeeRate: 50 });
      expect(result3.isValid).toBe(true);
    });
  });

  describe('validateUTXO', () => {
    it('should validate correct UTXO objects', () => {
      const validUTXO = {
        txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        vout: 0,
        value: 100000
      };

      const result = validateUTXO(validUTXO);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid UTXOs', () => {
      const invalidUTXOs = [
        { txid: 'invalid', vout: 0, value: 100000 },
        { txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', vout: -1, value: 100000 },
        { txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', vout: 0, value: -1 },
        { txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', vout: 1.5, value: 100000 },
        null,
        undefined,
        'string',
        123,
      ];

      invalidUTXOs.forEach(utxo => {
        const result = validateUTXO(utxo);
        expect(result.isValid).toBe(false);
      });
    });

    it('should validate transaction IDs strictly', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (txid) => {
            const utxo = { txid, vout: 0, value: 100000 };
            const result = validateUTXO(utxo);
            
            if (!/^[a-f0-9]{64}$/i.test(txid)) {
              expect(result.isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('estimateTransactionSize', () => {
    it('should estimate transaction sizes', () => {
      // Standard P2PKH transaction
      const size1 = estimateTransactionSize(1, 2, false);
      expect(size1.size).toBeGreaterThan(180);
      expect(size1.size).toBeLessThan(250);

      // SegWit transaction
      const size2 = estimateTransactionSize(1, 2, true);
      expect(size2.vsize).toBeLessThan(size1.size);
    });

    it('should handle multiple inputs/outputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (inputs, outputs) => {
            const result = estimateTransactionSize(inputs, outputs, false);
            
            // Size should increase with more inputs/outputs
            expect(result.size).toBeGreaterThan(0);
            expect(result.size).toBeLessThan(100000); // Reasonable upper limit
            
            // SegWit should be smaller
            const segwitResult = estimateTransactionSize(inputs, outputs, true);
            expect(segwitResult.vsize).toBeLessThanOrEqual(result.size);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject invalid input counts', () => {
      expect(() => estimateTransactionSize(0, 1)).toThrow();
      expect(() => estimateTransactionSize(1, 0)).toThrow();
      expect(() => estimateTransactionSize(-1, 1)).toThrow();
    });
  });

  describe('Amount overflow and underflow', () => {
    it('should handle extremely large amounts', () => {
      const hugeAmounts = [
        '999999999999999999999999999',
        '1e308',
        Number.MAX_VALUE.toString(),
      ];

      hugeAmounts.forEach(amount => {
        const result = validateBitcoinAmount(amount);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should handle extremely small amounts', () => {
      const tinyAmounts = [
        '0.000000001', // Sub-satoshi in BTC
        '1e-10',
        '0.5', // Half satoshi
      ];

      tinyAmounts.forEach(amount => {
        const result = validateBitcoinAmount(amount, { unit: 'satoshis' });
        
        if (parseFloat(amount) < 1) {
          expect(result.isValid).toBe(false);
        }
      });
    });
  });

  describe('Security injection tests', () => {
    it('should prevent injection in amounts', () => {
      const injectionAttempts = [
        '=SUM(A1:A10)',
        '@import',
        '+1+1',
        '-1-1',
        '${7*7}',
        '<script>alert(1)</script>',
        '"; DROP TABLE transactions;',
      ];

      injectionAttempts.forEach(injection => {
        const result = validateBitcoinAmount(injection);
        expect(result.isValid).toBe(false);
        
        // Should detect as injection or invalid - any error is fine
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('Edge cases and consistency', () => {
    it('should be consistent across multiple calls', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            const result1 = validateBitcoinAddress(input);
            const result2 = validateBitcoinAddress(input);
            
            expect(result1.isValid).toBe(result2.isValid);
            expect(result1.error).toBe(result2.error);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle Unicode in addresses gracefully', () => {
      const unicodeAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf' + '测试',
        'bc1q' + '🔑',
        '密码地址',
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
});