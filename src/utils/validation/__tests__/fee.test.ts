/**
 * Unit tests for fee validation functions
 */
import { describe, it, expect } from 'vitest';
import {
  validateFeeRate,
  calculateTransactionFee,
  validateFeeWithBalance,
  estimateFeeRate,
  validateCPFPFee,
  isReasonableFeeRate,
  MIN_FEE_RATE,
  MAX_FEE_RATE,
  DEFAULT_FEE_RATE,
  TYPICAL_INPUT_SIZE,
  TYPICAL_OUTPUT_SIZE,
  TRANSACTION_OVERHEAD
} from '../fee';

describe('validateFeeRate', () => {
  describe('valid fee rates', () => {
    it('should accept valid fee rates', () => {
      const result1 = validateFeeRate(1);
      expect(result1.isValid).toBe(true);
      expect(result1.error).toBeUndefined();

      const result2 = validateFeeRate(10);
      expect(result2.isValid).toBe(true);
      expect(result2.error).toBeUndefined();

      const result3 = validateFeeRate('50');
      expect(result3.isValid).toBe(true);
      expect(result3.error).toBeUndefined();

      const result4 = validateFeeRate(100);
      expect(result4.isValid).toBe(true);
      expect(result4.error).toBeUndefined();
    });

    it('should return satsPerVByte', () => {
      const result = validateFeeRate(25);
      expect(result.isValid).toBe(true);
      expect(result.satsPerVByte).toBe(25);
    });

    it('should add warning for high fees', () => {
      const result = validateFeeRate(150);
      expect(result.isValid).toBe(true);
      expect(result.warning).toContain('high fee');
    });

    it('should not warn when warnHighFee is false', () => {
      const result = validateFeeRate(150, { warnHighFee: false });
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  describe('invalid fee rates', () => {
    it('should reject empty/null/undefined', () => {
      const emptyResult = validateFeeRate('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Fee rate is required');

      const nullResult = validateFeeRate(null as any);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.error).toBe('Fee rate is required');

      const undefinedResult = validateFeeRate(undefined as any);
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.error).toBe('Fee rate is required');
    });

    it('should reject zero', () => {
      const result = validateFeeRate(0);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('zero');
    });

    it('should reject negative', () => {
      const result = validateFeeRate(-10);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('negative');
    });

    it('should reject NaN and Infinity', () => {
      // NaN is converted to string "NaN" which toBigNumber converts to 0
      const nanResult = validateFeeRate(NaN);
      expect(nanResult.isValid).toBe(false);
      expect(nanResult.error).toBe('Fee rate cannot be zero');

      // Infinity keeps its numeric value which BigNumber detects as non-finite
      const infResult = validateFeeRate(Infinity);
      expect(infResult.isValid).toBe(false);
      expect(infResult.error).toBe('Fee rate must be a valid number');
    });

    it('should reject rates below minimum', () => {
      const result = validateFeeRate(0.5, { minRate: 1 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too low');
    });

    it('should reject rates above maximum', () => {
      const result = validateFeeRate(6000, { maxRate: 5000 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too high');
    });
  });

  describe('custom options', () => {
    it('should respect custom minRate', () => {
      expect(validateFeeRate(5, { minRate: 10 }).isValid).toBe(false);
      expect(validateFeeRate(15, { minRate: 10 }).isValid).toBe(true);
    });

    it('should respect custom maxRate', () => {
      expect(validateFeeRate(150, { maxRate: 100 }).isValid).toBe(false);
      expect(validateFeeRate(50, { maxRate: 100 }).isValid).toBe(true);
    });
  });
});

describe('calculateTransactionFee', () => {
  it('should calculate fee correctly', () => {
    const result = calculateTransactionFee(2, 2, 10);
    // (2 * 148 + 2 * 34 + 10) * 10 = 3740
    const expectedSize = 2 * TYPICAL_INPUT_SIZE + 2 * TYPICAL_OUTPUT_SIZE + TRANSACTION_OVERHEAD;
    expect(result.estimatedSize).toBe(expectedSize);
    expect(result.fee).toBe(Math.ceil(expectedSize * 10));
    expect(result.feeRate).toBe(10);
  });

  it('should use custom sizes when provided', () => {
    const result = calculateTransactionFee(1, 1, 10, {
      inputSize: 100,
      outputSize: 50,
      overhead: 20
    });
    // (1 * 100 + 1 * 50 + 20) * 10 = 1700
    expect(result.estimatedSize).toBe(170);
    expect(result.fee).toBe(1700);
  });

  it('should add warning for very high fees', () => {
    const result = calculateTransactionFee(10, 10, 1000);
    expect(result.warning).toContain('0.001 BTC');
  });

  it('should not warn for normal fees', () => {
    const result = calculateTransactionFee(1, 2, 10);
    expect(result.warning).toBeUndefined();
  });
});

describe('validateFeeWithBalance', () => {
  it('should pass when balance is sufficient', () => {
    const result = validateFeeWithBalance(1000, 500, 2000);
    expect(result.isValid).toBe(true);
    expect(result.totalRequired).toBe('1500');
  });

  it('should fail when balance is insufficient', () => {
    const result = validateFeeWithBalance(1000, 500, 1000);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Insufficient');
    expect(result.error).toContain('500'); // shortfall
  });

  it('should handle string inputs', () => {
    const result = validateFeeWithBalance('1000', '500', '2000');
    expect(result.isValid).toBe(true);
  });

  it('should handle special values', () => {
    expect(validateFeeWithBalance('NaN', 100, 1000).isValid).toBe(false);
    expect(validateFeeWithBalance(100, 'NaN', 1000).isValid).toBe(false);
    expect(validateFeeWithBalance(100, 100, 'NaN').isValid).toBe(false);
    expect(validateFeeWithBalance('Infinity', 100, 1000).isValid).toBe(false);
  });
});

describe('estimateFeeRate', () => {
  describe('with default rates', () => {
    it('should return MIN_FEE_RATE for low priority', () => {
      expect(estimateFeeRate('low')).toBe(MIN_FEE_RATE);
    });

    it('should return DEFAULT_FEE_RATE for medium priority', () => {
      expect(estimateFeeRate('medium')).toBe(DEFAULT_FEE_RATE);
    });

    it('should return multiplied rate for high priority', () => {
      expect(estimateFeeRate('high')).toBe(DEFAULT_FEE_RATE * 1.5);
    });
  });

  describe('with custom rates', () => {
    const customRates = { low: 5, medium: 20, high: 50 };

    it('should use custom low rate', () => {
      expect(estimateFeeRate('low', customRates)).toBe(5);
    });

    it('should use custom medium rate', () => {
      expect(estimateFeeRate('medium', customRates)).toBe(20);
    });

    it('should use custom high rate', () => {
      expect(estimateFeeRate('high', customRates)).toBe(50);
    });

    it('should fall back to defaults for missing rates', () => {
      expect(estimateFeeRate('low', {})).toBe(MIN_FEE_RATE);
      expect(estimateFeeRate('medium', {})).toBe(DEFAULT_FEE_RATE);
      expect(estimateFeeRate('high', {})).toBe(DEFAULT_FEE_RATE * 2);
    });
  });
});

describe('validateCPFPFee', () => {
  it('should validate valid CPFP scenario', () => {
    // Parent: 200 vB @ 5 sat/vB = 1000 sats
    // Want combined rate of 20 sat/vB
    // Combined size: 400 vB, need 8000 sats total
    // Child needs: 8000 - 1000 = 7000 sats for 200 vB = 35 sat/vB
    const result = validateCPFPFee(20, 5, 200, 200);
    expect(result.isValid).toBe(true);
    expect(result.effectiveRate).toBe(35);
  });

  it('should reject when parent already has sufficient rate', () => {
    const result = validateCPFPFee(10, 20, 200, 200);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('sufficient fee rate');
  });

  it('should reject when required child rate is too high', () => {
    // Parent very large with very low fee
    const result = validateCPFPFee(5000, 1, 100, 10000);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('too high');
  });

  it('should reject when child fee would be zero or negative', () => {
    const result = validateCPFPFee(5, 10, 200, 200);
    expect(result.isValid).toBe(false);
  });
});

describe('isReasonableFeeRate', () => {
  describe('without network rate', () => {
    it('should accept rates within default range', () => {
      expect(isReasonableFeeRate(1)).toBe(true);
      expect(isReasonableFeeRate(50)).toBe(true);
      expect(isReasonableFeeRate(100)).toBe(true);
    });

    it('should reject rates outside default range', () => {
      expect(isReasonableFeeRate(0.5)).toBe(false);
      expect(isReasonableFeeRate(101)).toBe(false);
    });
  });

  describe('with network rate', () => {
    it('should accept rates up to 10x network rate', () => {
      expect(isReasonableFeeRate(50, 10)).toBe(true);
      expect(isReasonableFeeRate(100, 10)).toBe(true);
    });

    it('should reject rates over 10x network rate', () => {
      expect(isReasonableFeeRate(101, 10)).toBe(false);
    });

    it('should reject rates below minimum', () => {
      expect(isReasonableFeeRate(0.5, 10)).toBe(false);
    });
  });
});

describe('Constants', () => {
  it('should have expected constant values', () => {
    expect(MIN_FEE_RATE).toBe(1);
    expect(MAX_FEE_RATE).toBe(5000);
    expect(DEFAULT_FEE_RATE).toBe(10);
    expect(TYPICAL_INPUT_SIZE).toBe(148);
    expect(TYPICAL_OUTPUT_SIZE).toBe(34);
    expect(TRANSACTION_OVERHEAD).toBe(10);
  });
});
