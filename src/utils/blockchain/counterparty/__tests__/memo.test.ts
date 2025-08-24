import { describe, it, expect } from 'vitest';
import { isHexMemo, stripHexPrefix, getMemoByteLength, isValidMemoLength } from '../memo';

describe('Memo Utilities', () => {
  describe('isHexMemo', () => {
    it('should detect valid hex strings', () => {
      expect(isHexMemo('48656c6c6f')).toBe(true); // "Hello" in hex
      expect(isHexMemo('0x48656c6c6f')).toBe(true); // With 0x prefix
      expect(isHexMemo('0X48656c6c6f')).toBe(true); // With 0X prefix
      expect(isHexMemo('deadbeef')).toBe(true);
      expect(isHexMemo('0xdeadbeef')).toBe(true);
    });

    it('should reject invalid hex strings', () => {
      expect(isHexMemo('Hello World')).toBe(false); // Regular text
      expect(isHexMemo('48656c6c6')).toBe(false); // Odd length
      expect(isHexMemo('0x48656c6c6')).toBe(false); // Odd length with prefix
      expect(isHexMemo('GHIJKL')).toBe(false); // Invalid hex chars
      expect(isHexMemo('0x')).toBe(false); // Just prefix
      expect(isHexMemo('')).toBe(false); // Empty string
      expect(isHexMemo('0xGHIJKL')).toBe(false); // Invalid hex with prefix
    });

    it('should handle edge cases', () => {
      expect(isHexMemo('00')).toBe(true); // Single byte
      expect(isHexMemo('0x00')).toBe(true); // Single byte with prefix
      expect(isHexMemo('0')).toBe(false); // Half byte
      expect(isHexMemo('0x0')).toBe(false); // Half byte with prefix
    });
  });

  describe('stripHexPrefix', () => {
    it('should strip 0x prefix', () => {
      expect(stripHexPrefix('0x48656c6c6f')).toBe('48656c6c6f');
      expect(stripHexPrefix('0X48656c6c6f')).toBe('48656c6c6f');
    });

    it('should return unchanged if no prefix', () => {
      expect(stripHexPrefix('48656c6c6f')).toBe('48656c6c6f');
      expect(stripHexPrefix('Hello')).toBe('Hello');
      expect(stripHexPrefix('')).toBe('');
    });

    it('should only strip prefix at start', () => {
      expect(stripHexPrefix('test0x123')).toBe('test0x123');
    });
  });

  describe('getMemoByteLength', () => {
    it('should calculate hex byte length', () => {
      expect(getMemoByteLength('48656c6c6f', true)).toBe(5); // "Hello" = 5 bytes
      expect(getMemoByteLength('00', true)).toBe(1); // Single byte
      expect(getMemoByteLength('deadbeef', true)).toBe(4); // 4 bytes
      expect(getMemoByteLength('0', true)).toBe(1); // Odd hex rounds up
    });

    it('should calculate text byte length', () => {
      expect(getMemoByteLength('Hello', false)).toBe(5);
      expect(getMemoByteLength('Hello World', false)).toBe(11);
      expect(getMemoByteLength('', false)).toBe(0);
    });

    it('should handle unicode characters', () => {
      expect(getMemoByteLength('😀', false)).toBe(4); // Emoji is 4 bytes in UTF-8
      expect(getMemoByteLength('你好', false)).toBe(6); // Chinese chars are 3 bytes each
      expect(getMemoByteLength('café', false)).toBe(5); // é is 2 bytes in UTF-8
    });
  });

  describe('isValidMemoLength', () => {
    it('should validate text memos', () => {
      expect(isValidMemoLength('a'.repeat(34), false)).toBe(true); // Exactly 34 bytes
      expect(isValidMemoLength('a'.repeat(35), false)).toBe(false); // Too long
      expect(isValidMemoLength('Hello World', false)).toBe(true); // 11 bytes
      expect(isValidMemoLength('', false)).toBe(true); // Empty is valid
    });

    it('should validate hex memos', () => {
      // 68 hex chars = 34 bytes
      expect(isValidMemoLength('00'.repeat(34), true)).toBe(true); // Exactly 34 bytes
      expect(isValidMemoLength('00'.repeat(35), true)).toBe(false); // Too long
      expect(isValidMemoLength('deadbeef', true)).toBe(true); // 4 bytes
    });

    it('should respect custom max length', () => {
      expect(isValidMemoLength('Hello', false, 5)).toBe(true); // Exactly 5 bytes
      expect(isValidMemoLength('Hello', false, 4)).toBe(false); // Too long for limit
      expect(isValidMemoLength('00000000', true, 4)).toBe(true); // 4 bytes in hex
      expect(isValidMemoLength('0000000000', true, 4)).toBe(false); // 5 bytes in hex
    });

    it('should handle unicode within limits', () => {
      // 8 emojis * 4 bytes each = 32 bytes (under 34 limit)
      expect(isValidMemoLength('😀'.repeat(8), false)).toBe(true);
      // 9 emojis * 4 bytes each = 36 bytes (over 34 limit)
      expect(isValidMemoLength('😀'.repeat(9), false)).toBe(false);
    });
  });
});