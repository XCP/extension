/**
 * Unit tests for asset validation functions
 */
import { describe, it, expect } from 'vitest';
import {
  validateAssetName,
  validateParentAsset,
  validateSubasset,
  isNumericAsset,
  isNamedAsset,
  generateRandomNumericAsset
} from '../asset';

describe('Asset Validation', () => {
  describe('validateParentAsset', () => {
    it('should accept valid named assets', () => {
      expect(validateParentAsset('TEST').isValid).toBe(true);
      expect(validateParentAsset('BURN').isValid).toBe(true);
      expect(validateParentAsset('PEPECASH').isValid).toBe(true);
      expect(validateParentAsset('BAAA').isValid).toBe(true); // Minimum 4 chars
      expect(validateParentAsset('BAAAAAAAAAAA').isValid).toBe(true); // Maximum 12 chars
    });

    it('should reject reserved names', () => {
      expect(validateParentAsset('BTC').isValid).toBe(false);
      expect(validateParentAsset('XCP').isValid).toBe(false);
    });

    it('should reject assets starting with A that are not valid numeric', () => {
      expect(validateParentAsset('AAAA').isValid).toBe(false);
      expect(validateParentAsset('A1').isValid).toBe(false);
      expect(validateParentAsset('A123').isValid).toBe(false);
    });

    it('should accept valid numeric assets', () => {
      // Minimum valid: 26^12 = 95,428,956,661,682,176
      expect(validateParentAsset('A95428956661682177').isValid).toBe(true);
      // Maximum valid: 256^8 - 1 = 18,446,744,073,709,551,615
      expect(validateParentAsset('A18446744073709551615').isValid).toBe(true);
    });

    it('should reject numeric assets outside valid range', () => {
      // Below minimum
      expect(validateParentAsset('A1').isValid).toBe(false);
      expect(validateParentAsset('A95428956661682175').isValid).toBe(false);
      // Above maximum
      expect(validateParentAsset('A18446744073709551616').isValid).toBe(false);
    });

    it('should enforce length constraints', () => {
      expect(validateParentAsset('BAA').isValid).toBe(false); // Too short (3 chars)
      expect(validateParentAsset('BAAAAAAAAAAAAA').isValid).toBe(false); // Too long (14 chars)
    });

    it('should enforce character constraints', () => {
      expect(validateParentAsset('test').isValid).toBe(false); // Lowercase
      expect(validateParentAsset('TEST1').isValid).toBe(false); // Contains digit
      expect(validateParentAsset('TE ST').isValid).toBe(false); // Contains space
      expect(validateParentAsset('TE-ST').isValid).toBe(false); // Contains dash
    });

    it('should return appropriate error messages', () => {
      expect(validateParentAsset('').error).toBe('Asset name is required');
      expect(validateParentAsset('BTC').error).toContain('reserved');
      expect(validateParentAsset('BAA').error).toContain('too short');
      expect(validateParentAsset('BAAAAAAAAAAAAA').error).toContain('too long');
    });
  });

  describe('validateSubasset', () => {
    it('should accept valid subassets', () => {
      expect(validateSubasset('TEST.subasset').isValid).toBe(true);
      expect(validateSubasset('TEST.SUBASSET').isValid).toBe(true);
      expect(validateSubasset('TEST.sub-asset').isValid).toBe(true);
      expect(validateSubasset('TEST.sub_asset').isValid).toBe(true);
      expect(validateSubasset('TEST.sub.asset').isValid).toBe(true);
      expect(validateSubasset('TEST.sub@asset').isValid).toBe(true);
      expect(validateSubasset('TEST.sub!asset').isValid).toBe(true);
    });

    it('should reject invalid parent assets', () => {
      expect(validateSubasset('BTC.subasset').isValid).toBe(false);
      expect(validateSubasset('XCP.subasset').isValid).toBe(false);
      expect(validateSubasset('AA.subasset').isValid).toBe(false);
    });

    it('should enforce child name constraints', () => {
      expect(validateSubasset('TEST.').isValid).toBe(false); // Empty child
      expect(validateSubasset('TEST..child').isValid).toBe(false); // Consecutive dots
      expect(validateSubasset('TEST. space').isValid).toBe(false); // Space in child
    });

    it('should enforce max length', () => {
      const longChild = 'a'.repeat(250);
      expect(validateSubasset(`TEST.${longChild}`).isValid).toBe(false);
    });

    it('should validate parent when provided', () => {
      expect(validateSubasset('TEST.sub', 'TEST').isValid).toBe(true);
      expect(validateSubasset('OTHER.sub', 'TEST').isValid).toBe(false);
    });
  });

  describe('isNumericAsset', () => {
    it('should identify valid numeric assets', () => {
      expect(isNumericAsset('A95428956661682177')).toBe(true);
      expect(isNumericAsset('A18446744073709551615')).toBe(true);
    });

    it('should reject invalid numeric assets', () => {
      expect(isNumericAsset('TEST')).toBe(false);
      expect(isNumericAsset('A1')).toBe(false);
      expect(isNumericAsset('Anumber')).toBe(false);
      expect(isNumericAsset('')).toBe(false);
    });
  });

  describe('isNamedAsset', () => {
    it('should identify valid named assets', () => {
      expect(isNamedAsset('TEST')).toBe(true);
      expect(isNamedAsset('BURN')).toBe(true);
      expect(isNamedAsset('PEPECASH')).toBe(true);
    });

    it('should reject invalid named assets', () => {
      expect(isNamedAsset('BTC')).toBe(false); // Too short
      expect(isNamedAsset('AAAA')).toBe(false); // Starts with A
      expect(isNamedAsset('test')).toBe(false); // Lowercase
    });
  });
});

describe('generateRandomNumericAsset', () => {
  it('should generate a string starting with "A"', () => {
    const result = generateRandomNumericAsset();
    expect(result.startsWith('A')).toBe(true);
  });

  it('should generate a valid numeric asset', () => {
    const result = generateRandomNumericAsset();
    expect(isNumericAsset(result)).toBe(true);
    expect(validateParentAsset(result).isValid).toBe(true);
  });

  it('should generate asset within valid range', () => {
    const result = generateRandomNumericAsset();
    const numberPart = result.substring(1);
    const value = BigInt(numberPart);

    const min = BigInt(26) ** BigInt(12) + BigInt(1);
    const max = BigInt(256) ** BigInt(8);

    expect(value >= min).toBe(true);
    expect(value <= max).toBe(true);
  });

  it('should generate different values on subsequent calls', () => {
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(generateRandomNumericAsset());
    }
    // With cryptographic randomness, should get multiple unique values
    expect(results.size).toBeGreaterThan(1);
  });

  describe('range bounds verification', () => {
    it('should never generate values below minimum (100 iterations)', () => {
      const min = BigInt(26) ** BigInt(12) + BigInt(1);
      for (let i = 0; i < 100; i++) {
        const result = generateRandomNumericAsset();
        const value = BigInt(result.substring(1));
        expect(value >= min).toBe(true);
      }
    });

    it('should never generate values above maximum (100 iterations)', () => {
      const max = BigInt(256) ** BigInt(8);
      for (let i = 0; i < 100; i++) {
        const result = generateRandomNumericAsset();
        const value = BigInt(result.substring(1));
        expect(value <= max).toBe(true);
      }
    });
  });

  it('should only contain digits after the A prefix', () => {
    for (let i = 0; i < 20; i++) {
      const result = generateRandomNumericAsset();
      const numberPart = result.substring(1);
      expect(/^\d+$/.test(numberPart)).toBe(true);
    }
  });
});
