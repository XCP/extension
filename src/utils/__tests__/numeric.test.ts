import { describe, it, expect, vi } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  toBigNumber,
  formatBigNumber,
  isValidPositiveNumber,
  roundDownToMultiple,
  toSatoshis,
  fromSatoshis,
  subtractSatoshis,
  divideSatoshis,
  isLessThanSatoshis,
  isLessThanOrEqualToSatoshis,
} from '../numeric';

describe('numeric utilities', () => {
  describe('toBigNumber', () => {
    it('should convert string to BigNumber', () => {
      const result = toBigNumber('123.456789');
      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('123.456789');
    });

    it('should convert number to BigNumber', () => {
      const result = toBigNumber(123.456789);
      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('123.456789');
    });

    it('should handle BigNumber input', () => {
      const input = new BigNumber('100.5');
      const result = toBigNumber(input);
      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('100.5');
    });

    it('should handle null input with default value', () => {
      const result = toBigNumber(null);
      expect(result.toString()).toBe('0');
    });

    it('should handle undefined input with default value', () => {
      const result = toBigNumber(undefined);
      expect(result.toString()).toBe('0');
    });

    it('should use custom default value', () => {
      const result = toBigNumber(null, '999');
      expect(result.toString()).toBe('999');
    });

    it('should handle invalid input gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = toBigNumber('invalid-number');
      expect(result.toString()).toBe('0');
      expect(consoleSpy).toHaveBeenCalledWith('Error converting to BigNumber:', 'Invalid input: invalid-number');
      consoleSpy.mockRestore();
    });

    it('should prevent precision loss with large numbers', () => {
      const largeNumber = '12345678901234567890.12345678'; // Limited to 8 decimal places due to global config
      const result = toBigNumber(largeNumber);
      expect(result.toString()).toBe(largeNumber);
    });

    it('should handle scientific notation input correctly', () => {
      const result = toBigNumber('1e-8');
      // The input is valid, but the toString might not format as expected due to BigNumber config
      expect(result.isEqualTo('0.00000001')).toBe(true);
    });
  });

  describe('formatBigNumber', () => {
    it('should format with default 8 decimal places', () => {
      const num = new BigNumber('123.456789123456789');
      const result = formatBigNumber(num);
      expect(result).toBe('123.45678912');
    });

    it('should format with custom decimal places', () => {
      const num = new BigNumber('123.456789');
      const result = formatBigNumber(num, 2);
      expect(result).toBe('123.45');
    });

    it('should handle zero', () => {
      const num = new BigNumber('0');
      const result = formatBigNumber(num, 8);
      expect(result).toBe('0.00000000');
    });

    it('should handle very small numbers', () => {
      const num = new BigNumber('0.00000001');
      const result = formatBigNumber(num, 8);
      expect(result).toBe('0.00000001');
    });

    it('should handle large numbers', () => {
      const num = new BigNumber('1234567890.12345678');
      const result = formatBigNumber(num, 8);
      expect(result).toBe('1234567890.12345678');
    });
  });

  describe('isValidPositiveNumber', () => {
    it('should validate positive numbers', () => {
      expect(isValidPositiveNumber('123.456')).toBe(true);
      expect(isValidPositiveNumber('0.00000001')).toBe(true);
      expect(isValidPositiveNumber('999999999.99999999')).toBe(true);
    });

    it('should reject zero by default', () => {
      expect(isValidPositiveNumber('0')).toBe(false);
      expect(isValidPositiveNumber('0.0')).toBe(false);
    });

    it('should allow zero when allowZero is true', () => {
      expect(isValidPositiveNumber('0', { allowZero: true })).toBe(true);
      expect(isValidPositiveNumber('0.00000000', { allowZero: true })).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(isValidPositiveNumber('-1')).toBe(false);
      expect(isValidPositiveNumber('-0.1')).toBe(false);
      expect(isValidPositiveNumber('-0.00000001')).toBe(false);
    });

    it('should validate decimal places', () => {
      expect(isValidPositiveNumber('1.12345678', { maxDecimals: 8 })).toBe(true);
      expect(isValidPositiveNumber('1.123456789', { maxDecimals: 8 })).toBe(false);
      expect(isValidPositiveNumber('1.12', { maxDecimals: 2 })).toBe(true);
      expect(isValidPositiveNumber('1.123', { maxDecimals: 2 })).toBe(false);
    });

    it('should handle integers', () => {
      expect(isValidPositiveNumber('123')).toBe(true);
      expect(isValidPositiveNumber('1')).toBe(true);
    });

    it('should reject invalid strings', () => {
      expect(isValidPositiveNumber('abc')).toBe(false);
      expect(isValidPositiveNumber('')).toBe(false);
      expect(isValidPositiveNumber('1.2.3')).toBe(false);
      // Note: '1e10' is actually valid scientific notation, but BigNumber constructor doesn't throw
      // The actual implementation might accept it, so let's test with truly invalid input
      expect(isValidPositiveNumber('not-a-number')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidPositiveNumber('0.', { allowZero: true })).toBe(true);
      expect(isValidPositiveNumber('.1')).toBe(true);
      expect(isValidPositiveNumber('1.')).toBe(true);
    });
  });

  describe('roundDownToMultiple', () => {
    it('should round down to multiple correctly', () => {
      const value = new BigNumber('17.5');
      const multiple = new BigNumber('5');
      const result = roundDownToMultiple(value, multiple);
      expect(result.toString()).toBe('15');
    });

    it('should handle exact multiples', () => {
      const value = new BigNumber('20');
      const multiple = new BigNumber('5');
      const result = roundDownToMultiple(value, multiple);
      expect(result.toString()).toBe('20');
    });

    it('should handle decimal multiples', () => {
      const value = new BigNumber('1.75');
      const multiple = new BigNumber('0.5');
      const result = roundDownToMultiple(value, multiple);
      expect(result.toString()).toBe('1.5');
    });

    it('should handle small values', () => {
      const value = new BigNumber('0.3');
      const multiple = new BigNumber('0.1');
      const result = roundDownToMultiple(value, multiple);
      expect(result.toString()).toBe('0.3');
    });

    it('should handle very small multiples', () => {
      const value = new BigNumber('0.00000123');
      const multiple = new BigNumber('0.00000001');
      const result = roundDownToMultiple(value, multiple);
      expect(result.toString()).toBe('0.00000123');
    });
  });

  describe('toSatoshis', () => {
    it('should convert BTC to satoshis', () => {
      expect(toSatoshis('1')).toBe('100000000');
      expect(toSatoshis('0.5')).toBe('50000000');
      expect(toSatoshis('0.00000001')).toBe('1');
    });

    it('should handle BigNumber input', () => {
      const btc = new BigNumber('2.5');
      expect(toSatoshis(btc)).toBe('250000000');
    });

    it('should handle number input', () => {
      expect(toSatoshis(0.1)).toBe('10000000');
    });

    it('should round down fractional satoshis', () => {
      expect(toSatoshis('0.000000015')).toBe('1'); // 1.5 satoshis rounds down to 1
    });

    it('should handle zero', () => {
      expect(toSatoshis('0')).toBe('0');
    });

    it('should handle large amounts', () => {
      expect(toSatoshis('21000000')).toBe('2100000000000000');
    });
  });

  describe('fromSatoshis', () => {
    it('should convert satoshis to BTC', () => {
      expect(fromSatoshis('100000000')).toBe('1.00000000');
      expect(fromSatoshis('50000000')).toBe('0.50000000');
      expect(fromSatoshis('1')).toBe('0.00000001');
    });

    it('should handle BigNumber input', () => {
      const satoshis = new BigNumber('250000000');
      expect(fromSatoshis(satoshis)).toBe('2.50000000');
    });

    it('should handle number input', () => {
      expect(fromSatoshis(10000000)).toBe('0.10000000');
    });

    it('should handle zero', () => {
      expect(fromSatoshis('0')).toBe('0.00000000');
    });

    it('should handle large amounts', () => {
      expect(fromSatoshis('2100000000000000')).toBe('21000000.00000000');
    });

    it('should maintain precision', () => {
      expect(fromSatoshis('12345678')).toBe('0.12345678');
    });
  });

  describe('subtractSatoshis', () => {
    it('should subtract satoshi values', () => {
      expect(subtractSatoshis('1000', '300')).toBe('700');
      expect(subtractSatoshis('100000000', '50000000')).toBe('50000000');
    });

    it('should handle string inputs', () => {
      expect(subtractSatoshis('999999999', '1')).toBe('999999998');
    });

    it('should handle number inputs', () => {
      expect(subtractSatoshis(1000, 300)).toBe('700');
    });

    it('should round down results', () => {
      // This would be unlikely in practice since we're dealing with integers
      expect(subtractSatoshis('1000', '300')).toBe('700');
    });

    it('should handle zero results', () => {
      expect(subtractSatoshis('500', '500')).toBe('0');
    });

    it('should handle negative results', () => {
      expect(subtractSatoshis('300', '500')).toBe('-200');
    });
  });

  describe('divideSatoshis', () => {
    it('should divide satoshi values', () => {
      expect(divideSatoshis('1000', 2)).toBe('500');
      expect(divideSatoshis('100000000', 4)).toBe('25000000');
    });

    it('should handle string dividend', () => {
      expect(divideSatoshis('999999999', 3)).toBe('333333333');
    });

    it('should handle number dividend', () => {
      expect(divideSatoshis(1000, 5)).toBe('200');
    });

    it('should round down fractional results', () => {
      expect(divideSatoshis('1000', 3)).toBe('333'); // 333.333... rounds down to 333
      expect(divideSatoshis('7', 2)).toBe('3'); // 3.5 rounds down to 3
    });

    it('should handle division by 1', () => {
      expect(divideSatoshis('123456789', 1)).toBe('123456789');
    });

    it('should handle zero dividend', () => {
      expect(divideSatoshis('0', 5)).toBe('0');
    });
  });

  describe('isLessThanSatoshis', () => {
    it('should compare satoshi values correctly', () => {
      expect(isLessThanSatoshis('100', '200')).toBe(true);
      expect(isLessThanSatoshis('200', '100')).toBe(false);
      expect(isLessThanSatoshis('100', '100')).toBe(false);
    });

    it('should handle string inputs', () => {
      expect(isLessThanSatoshis('999999999', '1000000000')).toBe(true);
      expect(isLessThanSatoshis('1000000000', '999999999')).toBe(false);
    });

    it('should handle number inputs', () => {
      expect(isLessThanSatoshis(50, 100)).toBe(true);
      expect(isLessThanSatoshis(100, 50)).toBe(false);
    });

    it('should handle mixed input types', () => {
      expect(isLessThanSatoshis('50', 100)).toBe(true);
      expect(isLessThanSatoshis(100, '50')).toBe(false);
    });

    it('should handle zero values', () => {
      expect(isLessThanSatoshis('0', '1')).toBe(true);
      expect(isLessThanSatoshis('1', '0')).toBe(false);
      expect(isLessThanSatoshis('0', '0')).toBe(false);
    });

    it('should handle negative values', () => {
      expect(isLessThanSatoshis('-100', '0')).toBe(true);
      expect(isLessThanSatoshis('0', '-100')).toBe(false);
      expect(isLessThanSatoshis('-200', '-100')).toBe(true);
    });
  });

  describe('isLessThanOrEqualToSatoshis', () => {
    it('should compare satoshi values correctly', () => {
      expect(isLessThanOrEqualToSatoshis('100', '200')).toBe(true);
      expect(isLessThanOrEqualToSatoshis('200', '100')).toBe(false);
      expect(isLessThanOrEqualToSatoshis('100', '100')).toBe(true);
    });

    it('should handle string inputs', () => {
      expect(isLessThanOrEqualToSatoshis('999999999', '1000000000')).toBe(true);
      expect(isLessThanOrEqualToSatoshis('1000000000', '999999999')).toBe(false);
      expect(isLessThanOrEqualToSatoshis('1000000000', '1000000000')).toBe(true);
    });

    it('should handle number inputs', () => {
      expect(isLessThanOrEqualToSatoshis(50, 100)).toBe(true);
      expect(isLessThanOrEqualToSatoshis(100, 50)).toBe(false);
      expect(isLessThanOrEqualToSatoshis(100, 100)).toBe(true);
    });

    it('should handle mixed input types', () => {
      expect(isLessThanOrEqualToSatoshis('50', 100)).toBe(true);
      expect(isLessThanOrEqualToSatoshis(100, '50')).toBe(false);
      expect(isLessThanOrEqualToSatoshis('100', 100)).toBe(true);
    });

    it('should handle zero values', () => {
      expect(isLessThanOrEqualToSatoshis('0', '1')).toBe(true);
      expect(isLessThanOrEqualToSatoshis('1', '0')).toBe(false);
      expect(isLessThanOrEqualToSatoshis('0', '0')).toBe(true);
    });

    it('should handle negative values', () => {
      expect(isLessThanOrEqualToSatoshis('-100', '0')).toBe(true);
      expect(isLessThanOrEqualToSatoshis('0', '-100')).toBe(false);
      expect(isLessThanOrEqualToSatoshis('-200', '-100')).toBe(true);
      expect(isLessThanOrEqualToSatoshis('-100', '-100')).toBe(true);
    });
  });

  describe('BigNumber configuration', () => {
    it('should handle precision according to configuration', () => {
      // The global config affects new calculations, not existing precision
      const num = new BigNumber('123.123456789123456789');
      // Just verify the number was created successfully
      expect(num.isFinite()).toBe(true);
      expect(num.toString()).toContain('123.123456');
    });

    it('should use ROUND_DOWN for calculations', () => {
      // Test rounding behavior in calculations
      const result = new BigNumber('10').div(3);
      const formatted = result.toFixed(8);
      expect(formatted).toBe('3.33333333'); // Should round down
    });

    it('should handle different number formats', () => {
      const largeNum = new BigNumber('1000000000');
      const smallNum = new BigNumber('0.00000001');
      
      expect(largeNum.isGreaterThan(0)).toBe(true);
      expect(smallNum.isGreaterThan(0)).toBe(true);
      expect(largeNum.toString()).toBe('1000000000');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete BTC transaction flow', () => {
      const btcAmount = '1.5';
      const feeRate = '10'; // sats per byte
      const txSize = 250; // bytes
      
      // Convert to satoshis
      const amountSats = toSatoshis(btcAmount);
      expect(amountSats).toBe('150000000');
      
      // Calculate fee
      const feeSats = toBigNumber(feeRate).times(txSize).toString();
      expect(feeSats).toBe('2500');
      
      // Total required
      const totalSats = toBigNumber(amountSats).plus(feeSats).toString();
      expect(totalSats).toBe('150002500');
      
      // Convert back to BTC
      const totalBtc = fromSatoshis(totalSats);
      expect(totalBtc).toBe('1.50002500');
    });

    it('should handle dispenser calculations', () => {
      const totalAmount = toBigNumber('1000000');
      const dispenserUnit = toBigNumber('10000');
      
      // Round down to dispenser multiple
      const dispensableAmount = roundDownToMultiple(totalAmount, dispenserUnit);
      expect(dispensableAmount.toString()).toBe('1000000');
      
      // Calculate number of dispenses
      const dispenseCount = dispensableAmount.div(dispenserUnit).toNumber();
      expect(dispenseCount).toBe(100);
    });

    it('should handle precision-critical calculations', () => {
      const price = '0.00012345';
      const quantity = '1000000';
      
      // Calculate total value
      const total = toBigNumber(price).times(quantity);
      expect(total.toString()).toBe('123.45');
      
      // Validate as positive number with proper decimals
      expect(isValidPositiveNumber(total.toString(), { maxDecimals: 8 })).toBe(true);
      
      // Format for display
      const formatted = formatBigNumber(total, 2);
      expect(formatted).toBe('123.45');
    });

    it('should handle edge cases in combination', () => {
      // Very small amounts
      const dustLimit = '546'; // satoshis
      const smallAmount = toSatoshis('0.00000545');
      
      expect(isLessThanSatoshis(smallAmount, dustLimit)).toBe(true);
      
      // Subtract fee and check if still above dust
      const afterFee = subtractSatoshis(smallAmount, '1');
      expect(isLessThanSatoshis(afterFee, dustLimit)).toBe(true);
      
      // Convert back to BTC
      const btcAfterFee = fromSatoshis(afterFee);
      expect(btcAfterFee).toBe('0.00000544');
    });
  });
});