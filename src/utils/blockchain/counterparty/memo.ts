/**
 * Memo utilities for Counterparty transactions
 * Wraps the centralized validation utilities with Counterparty-specific defaults
 */

import {
  isHexMemo as _isHexMemo,
  stripHexPrefix as _stripHexPrefix,
  getMemoByteLength as _getMemoByteLength,
  validateMemoLength as _validateMemoLength,
  validateMemo as _validateMemo,
  hexToText as _hexToText,
  textToHex as _textToHex
} from '@/utils/validation';

// Re-export most utilities unchanged
export const isHexMemo = _isHexMemo;
export const validateMemo = _validateMemo;
export const hexToText = _hexToText;
export const textToHex = _textToHex;

// Counterparty-specific hex prefix stripping (handles both cases)
export function stripHexPrefix(hex: string): string {
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    return hex.slice(2);
  }
  return hex;
}

// Counterparty default is 34 bytes, not 80
export function isValidMemoLength(memo: string, isHex: boolean, maxBytes: number = 34): boolean {
  return _validateMemoLength(memo, isHex, maxBytes);
}

// Handle odd-length hex for backward compatibility
export function getMemoByteLength(memo: string, isHex: boolean): number {
  if (!memo) return 0;
  
  if (isHex) {
    const hexContent = stripHexPrefix(memo);
    // For backward compatibility with tests, round up odd-length hex
    return Math.ceil(hexContent.length / 2);
  } else {
    return _getMemoByteLength(memo, false);
  }
}