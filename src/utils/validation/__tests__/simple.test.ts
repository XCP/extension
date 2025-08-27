/**
 * Simple test to verify our validation functions work
 */
import { describe, it, expect } from 'vitest';
import { validateAssetName, validateParentAsset } from '../asset';
import { isHexMemo, validateMemo } from '../memo';

describe('Simple Validation Tests', () => {
  describe('Asset validation', () => {
    it('should validate basic asset names', () => {
      // Valid cases
      expect(validateParentAsset('TEST').isValid).toBe(true);
      expect(validateParentAsset('PEPECASH').isValid).toBe(true);
      
      // Invalid cases
      expect(validateParentAsset('BTC').isValid).toBe(false);
      expect(validateParentAsset('XCP').isValid).toBe(false);
      expect(validateParentAsset('').isValid).toBe(false);
      expect(validateParentAsset('ABC').isValid).toBe(false); // Too short
    });

    it('should validate subassets', () => {
      expect(validateAssetName('TEST.SUB', true).isValid).toBe(true);
      expect(validateAssetName('TEST', true).isValid).toBe(false); // No dot
      expect(validateAssetName('', true).isValid).toBe(false);
    });
  });

  describe('Memo validation', () => {
    it('should identify hex memos', () => {
      expect(isHexMemo('deadbeef')).toBe(true);
      expect(isHexMemo('0xdeadbeef')).toBe(true);
      expect(isHexMemo('hello world')).toBe(false);
      expect(isHexMemo('deadbeef0')).toBe(false); // Odd length
    });

    it('should validate memo lengths', () => {
      const shortMemo = 'Hello';
      const result = validateMemo(shortMemo, { maxBytes: 80 });
      expect(result.isValid).toBe(true);
      expect(result.byteLength).toBe(5);
      
      const longMemo = 'a'.repeat(81);
      const longResult = validateMemo(longMemo, { maxBytes: 80 });
      expect(longResult.isValid).toBe(false);
    });
  });
});