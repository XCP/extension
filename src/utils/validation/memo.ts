/**
 * Pure validation functions for memo handling
 * No dependencies on React, browser APIs, or other contexts
 */

/**
 * Check if a string is a valid hex memo
 */
export function isHexMemo(value: string): boolean {
  if (!value) return false;
  
  const trimmed = value.trim();
  
  // Check if it starts with 0x - must have even number of hex digits after 0x
  if (trimmed.startsWith('0x')) {
    const hexPart = trimmed.slice(2);
    // 0x alone is not valid, needs actual hex data
    return hexPart.length > 0 && /^[0-9a-fA-F]+$/.test(hexPart) && hexPart.length % 2 === 0;
  }
  
  // Pure hex must have even length for valid byte encoding
  return /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
}

/**
 * Strip hex prefix from a string
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Validate memo length in bytes
 */
export function validateMemoLength(memo: string, isHex: boolean, maxBytes: number = 80): boolean {
  if (!memo) return true; // Empty memo is valid
  
  if (isHex) {
    const hexContent = stripHexPrefix(memo);
    // Each byte is 2 hex characters
    return hexContent.length <= maxBytes * 2;
  } else {
    // Text memo - check UTF-8 byte length
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(memo);
      return bytes.length <= maxBytes;
    } catch {
      // If encoding fails, consider it invalid
      return false;
    }
  }
}

/**
 * Get byte length of a memo
 */
export function getMemoByteLength(memo: string, isHex: boolean): number {
  if (!memo) return 0;
  
  if (isHex) {
    const hexContent = stripHexPrefix(memo);
    return Math.floor(hexContent.length / 2);
  } else {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(memo);
    return bytes.length;
  }
}

/**
 * Validate a memo completely
 */
export function validateMemo(memo: string, options?: {
  maxBytes?: number;
  allowHex?: boolean;
  allowText?: boolean;
}): { isValid: boolean; error?: string; isHex?: boolean; byteLength?: number } {
  const maxBytes = options?.maxBytes ?? 80;
  const allowHex = options?.allowHex ?? true;
  const allowText = options?.allowText ?? true;
  
  if (!memo) {
    return { isValid: true, isHex: false, byteLength: 0 };
  }
  
  const isHex = isHexMemo(memo);
  
  // Check if type is allowed
  if (isHex && !allowHex) {
    return { isValid: false, error: "Hex memos are not allowed" };
  }
  
  if (!isHex && !allowText) {
    return { isValid: false, error: "Text memos are not allowed" };
  }
  
  // Check length
  const byteLength = getMemoByteLength(memo, isHex);
  
  if (byteLength > maxBytes) {
    return {
      isValid: false,
      error: `Memo exceeds maximum size of ${maxBytes} bytes (current: ${byteLength} bytes)`,
      isHex,
      byteLength
    };
  }
  
  return { isValid: true, isHex, byteLength };
}

/**
 * Convert hex string to text (for display)
 */
export function hexToText(hex: string): string | null {
  try {
    const cleanHex = stripHexPrefix(hex);
    
    // Empty hex string represents empty text
    if (cleanHex === '') return '';
    
    // Check for odd length
    if (cleanHex.length % 2 !== 0) return null;
    
    // Validate hex characters before parsing
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) return null;
    
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      const byte = parseInt(cleanHex.substr(i, 2), 16);
      if (isNaN(byte)) return null;
      bytes[i / 2] = byte;
    }
    
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Convert text to hex string
 */
export function textToHex(text: string): string {
  // Empty string returns empty hex
  if (!text) return '';
  
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}