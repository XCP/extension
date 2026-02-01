/**
 * Unit tests for amount validation functions
 */
import { describe, it, expect } from 'vitest';
import {
  validateAmount,
  validateQuantity,
  isValidNumber,
  validateBalance,
  btcToSatoshis,
  isDustAmount,
  DUST_LIMIT,
  MAX_SATOSHIS,
  SATOSHIS_PER_BTC
} from '../amount';

describe('validateAmount', () => {
  describe('valid amounts', () => {
    it('should accept valid BTC amounts', () => {
      // Verify valid amounts have no error property
      const result1 = validateAmount('1');
      expect(result1.isValid).toBe(true);
      expect(result1.error).toBeUndefined();

      const result2 = validateAmount('0.5');
      expect(result2.isValid).toBe(true);
      expect(result2.error).toBeUndefined();

      const result3 = validateAmount('0.00001');
      expect(result3.isValid).toBe(true);
      expect(result3.error).toBeUndefined();

      const result4 = validateAmount(1);
      expect(result4.isValid).toBe(true);
      expect(result4.error).toBeUndefined();

      const result5 = validateAmount(0.5);
      expect(result5.isValid).toBe(true);
      expect(result5.error).toBeUndefined();
    });

    it('should return satoshis and normalized value', () => {
      const result = validateAmount('1.5');
      expect(result.isValid).toBe(true);
      expect(result.satoshis).toBe(150000000);
      expect(result.normalized).toBe('1.5');
    });

    it('should handle zero when allowed', () => {
      const result = validateAmount('0', { allowZero: true });
      expect(result.isValid).toBe(true);
      expect(result.satoshis).toBe(0);
    });
  });

  describe('invalid amounts', () => {
    it('should reject empty/null/undefined', () => {
      const emptyResult = validateAmount('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Amount is required');

      const nullResult = validateAmount(null as any);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.error).toBe('Amount is required');

      const undefinedResult = validateAmount(undefined as any);
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.error).toBe('Amount is required');
    });

    it('should reject negative amounts', () => {
      const result = validateAmount('-1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('negative');
    });

    it('should reject zero by default', () => {
      const result = validateAmount('0');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('should reject special values', () => {
      const nanResult = validateAmount('NaN');
      expect(nanResult.isValid).toBe(false);
      expect(nanResult.error).toBe('Invalid amount');

      const infResult = validateAmount('Infinity');
      expect(infResult.isValid).toBe(false);
      expect(infResult.error).toBe('Invalid amount');

      const negInfResult = validateAmount('-Infinity');
      expect(negInfResult.isValid).toBe(false);
      expect(negInfResult.error).toBe('Invalid amount');
    });

    it('should reject invalid format', () => {
      const abcResult = validateAmount('abc');
      expect(abcResult.isValid).toBe(false);
      expect(abcResult.error).toBe('Invalid amount format');

      const multiDotResult = validateAmount('1.2.3');
      expect(multiDotResult.isValid).toBe(false);
      expect(multiDotResult.error).toBe('Invalid amount format');

      const dotResult = validateAmount('.');
      expect(dotResult.isValid).toBe(false);
      expect(dotResult.error).toBe('Invalid amount format');

      const dashResult = validateAmount('-');
      expect(dashResult.isValid).toBe(false);
      expect(dashResult.error).toBe('Invalid amount format');

      const sciNotationResult = validateAmount('1e10');
      expect(sciNotationResult.isValid).toBe(false);
      expect(sciNotationResult.error).toBe('Invalid amount format');
    });

    it('should reject amounts exceeding max', () => {
      const result = validateAmount(String(MAX_SATOSHIS + 1));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });

  describe('options', () => {
    it('should enforce dust limit when allowDust is false', () => {
      const belowDust = (DUST_LIMIT - 1) / SATOSHIS_PER_BTC;
      const result = validateAmount(belowDust.toFixed(8), { allowDust: false });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('dust');
    });

    it('should allow dust by default', () => {
      const belowDust = (DUST_LIMIT - 1) / SATOSHIS_PER_BTC;
      const result = validateAmount(belowDust.toFixed(8));
      expect(result.isValid).toBe(true);
    });

    it('should enforce custom decimal places', () => {
      const result = validateAmount('1.123456789', { decimals: 8 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('decimal');
    });

    it('should enforce minimum amount', () => {
      const result = validateAmount('0.00000001', { minAmount: 1000 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below minimum');
    });

    it('should enforce custom maximum amount', () => {
      const result = validateAmount('1', { maxAmount: 1000 }); // 1 BTC = 100M sats
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });
  });
});

describe('validateQuantity', () => {
  describe('valid quantities', () => {
    it('should accept valid quantities', () => {
      const result1 = validateQuantity('100');
      expect(result1.isValid).toBe(true);
      expect(result1.error).toBeUndefined();

      const result2 = validateQuantity('0.5');
      expect(result2.isValid).toBe(true);
      expect(result2.error).toBeUndefined();

      const result3 = validateQuantity(100);
      expect(result3.isValid).toBe(true);
      expect(result3.error).toBeUndefined();
    });

    it('should return quantity and normalized value', () => {
      const result = validateQuantity('100.5');
      expect(result.isValid).toBe(true);
      expect(result.quantity).toBe('100.5');
      expect(result.normalized).toBe('100.5');
    });
  });

  describe('invalid quantities', () => {
    it('should reject empty/null/undefined', () => {
      const emptyResult = validateQuantity('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Quantity is required');

      const nullResult = validateQuantity(null as any);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.error).toBe('Quantity is required');

      const undefinedResult = validateQuantity(undefined as any);
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.error).toBe('Quantity is required');
    });

    it('should reject negative quantities', () => {
      const result = validateQuantity('-100');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('negative');
    });

    it('should reject zero by default', () => {
      const result = validateQuantity('0');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('should reject special values', () => {
      const nanResult = validateQuantity('NaN');
      expect(nanResult.isValid).toBe(false);
      expect(nanResult.error).toBe('Invalid quantity');

      const infResult = validateQuantity('Infinity');
      expect(infResult.isValid).toBe(false);
      expect(infResult.error).toBe('Invalid quantity');

      const negInfResult = validateQuantity('-Infinity');
      expect(negInfResult.isValid).toBe(false);
      expect(negInfResult.error).toBe('Invalid quantity');
    });

    it('should reject invalid format', () => {
      const abcResult = validateQuantity('abc');
      expect(abcResult.isValid).toBe(false);
      expect(abcResult.error).toBe('Invalid quantity format');

      const dotResult = validateQuantity('.');
      expect(dotResult.isValid).toBe(false);
      expect(dotResult.error).toBe('Invalid quantity format');

      const dashResult = validateQuantity('-');
      expect(dashResult.isValid).toBe(false);
      expect(dashResult.error).toBe('Invalid quantity format');

      const sciNotationResult = validateQuantity('1e10');
      expect(sciNotationResult.isValid).toBe(false);
      expect(sciNotationResult.error).toBe('Invalid quantity format');
    });
  });

  describe('divisibility', () => {
    it('should reject decimals for non-divisible assets', () => {
      const result = validateQuantity('10.5', { divisible: false });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not divisible');
    });

    it('should accept integers for non-divisible assets', () => {
      const result = validateQuantity('10', { divisible: false });
      expect(result.isValid).toBe(true);
    });

    it('should accept decimals for divisible assets', () => {
      const result = validateQuantity('10.5', { divisible: true });
      expect(result.isValid).toBe(true);
    });

    it('should limit decimals to 8 for divisible assets', () => {
      const result = validateQuantity('10.123456789', { divisible: true });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('8 decimal');
    });
  });

  describe('supply limits', () => {
    it('should reject quantities exceeding max supply', () => {
      const result = validateQuantity('9999999999999999999', { maxSupply: '1000000' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject quantities below minimum', () => {
      const result = validateQuantity('5', { minQuantity: '10' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below minimum');
    });
  });
});

describe('isValidNumber', () => {
  it('should return true for valid numbers', () => {
    expect(isValidNumber('123')).toBe(true);
    expect(isValidNumber('123.456')).toBe(true);
    expect(isValidNumber('-123')).toBe(true);
    expect(isValidNumber('0')).toBe(true);
    expect(isValidNumber('0.1')).toBe(true);
  });

  it('should return false for invalid inputs', () => {
    expect(isValidNumber('')).toBe(false);
    expect(isValidNumber('   ')).toBe(false);
    expect(isValidNumber('abc')).toBe(false);
    expect(isValidNumber('1.2.3')).toBe(false);
    expect(isValidNumber('1e10')).toBe(false);
    expect(isValidNumber(null as any)).toBe(false);
    expect(isValidNumber(undefined as any)).toBe(false);
  });
});

describe('validateBalance', () => {
  it('should pass when balance is sufficient', () => {
    expect(validateBalance(100, 200).isValid).toBe(true);
    expect(validateBalance('50', '100').isValid).toBe(true);
  });

  it('should fail when balance is insufficient', () => {
    const result = validateBalance(200, 100);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Insufficient');
  });

  it('should account for fees when specified', () => {
    const result = validateBalance(90, 100, { includesFee: true, feeAmount: 20 });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Insufficient');
  });

  it('should handle special values', () => {
    expect(validateBalance('NaN', 100).isValid).toBe(false);
    expect(validateBalance(100, 'NaN').isValid).toBe(false);
    expect(validateBalance('Infinity', 100).isValid).toBe(false);
    expect(validateBalance(100, 'Infinity').isValid).toBe(true);
  });
});

describe('btcToSatoshis', () => {
  it('should convert BTC to satoshis', () => {
    expect(btcToSatoshis(1)).toBe(100000000);
    expect(btcToSatoshis('0.5')).toBe(50000000);
    expect(btcToSatoshis(0.00000001)).toBe(1);
  });

  it('should round down fractional satoshis', () => {
    expect(btcToSatoshis('0.000000001')).toBe(0);
    expect(btcToSatoshis('0.000000019')).toBe(1);
  });
});

describe('isDustAmount', () => {
  it('should identify dust amounts', () => {
    expect(isDustAmount(1)).toBe(true);
    expect(isDustAmount(545)).toBe(true);
    expect(isDustAmount(DUST_LIMIT - 1)).toBe(true);
  });

  it('should identify non-dust amounts', () => {
    expect(isDustAmount(0)).toBe(false);
    expect(isDustAmount(DUST_LIMIT)).toBe(false);
    expect(isDustAmount(1000)).toBe(false);
    expect(isDustAmount(-100)).toBe(false);
  });
});
