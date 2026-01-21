/**
 * Simple test to verify our validation functions work
 */
import { describe, it, expect } from 'vitest';
import { validateAssetName, validateParentAsset } from '../asset';
import { isHexMemo, validateMemo } from '../memo';

describe('Simple Validation Tests', () => {
  describe('Asset validation', () => {
    it('should validate basic asset names', () => {
      // Valid cases - verify no error property exists
      const validTest = validateParentAsset('TEST');
      expect(validTest.isValid).toBe(true);
      expect(validTest.error).toBeUndefined();

      const validPepe = validateParentAsset('PEPECASH');
      expect(validPepe.isValid).toBe(true);
      expect(validPepe.error).toBeUndefined();

      // Invalid cases - verify specific error messages
      const btcResult = validateParentAsset('BTC');
      expect(btcResult.isValid).toBe(false);
      expect(btcResult.error).toBe('Cannot use reserved asset names');

      const xcpResult = validateParentAsset('XCP');
      expect(xcpResult.isValid).toBe(false);
      expect(xcpResult.error).toBe('Cannot use reserved asset names');

      const emptyResult = validateParentAsset('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Asset name is required');

      const shortResult = validateParentAsset('ABC');
      expect(shortResult.isValid).toBe(false);
      expect(shortResult.error).toBe('Asset name too short (min 4 characters)');
    });

    it('should validate subassets', () => {
      // Valid subasset
      const validSubasset = validateAssetName('TEST.SUB', true);
      expect(validSubasset.isValid).toBe(true);
      expect(validSubasset.error).toBeUndefined();

      // Invalid subassets - verify error messages
      const noDotsResult = validateAssetName('TEST', true);
      expect(noDotsResult.isValid).toBe(false);
      expect(noDotsResult.error).toBe('Invalid subasset format - must contain a dot');

      const emptyResult = validateAssetName('', true);
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Asset name is required');
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