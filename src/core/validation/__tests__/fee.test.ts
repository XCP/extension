/**
 * Unit tests for fee validation functions
 */
import { describe, expect, it } from 'vitest';
import { validateFeeRate } from '../fee';

describe('validateFeeRate', () => {
  it('defaults to the wallet form floor of 0.1 sat/vB', () => {
    expect(validateFeeRate('0.1').isValid).toBe(true);
    expect(validateFeeRate('0.09').isValid).toBe(false);
  });
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
      // Non-finite values fail before any conversion or zero fallback.
      const nanResult = validateFeeRate(NaN);
      expect(nanResult.isValid).toBe(false);
      expect(nanResult.error).toBe('Fee rate must be a valid number');

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
