/**
 * Utility functions for handling memos in transactions
 */

/**
 * Detects if a memo string is in hexadecimal format
 * @param memo The memo string to check
 * @returns true if the memo appears to be hex, false otherwise
 */
export function isHexMemo(memo: string): boolean {
  if (!memo) return false;
  
  // Remove 0x prefix if present
  const cleanMemo = memo.startsWith('0x') || memo.startsWith('0X') 
    ? memo.slice(2) 
    : memo;
  
  // Empty string after removing prefix is not hex
  if (cleanMemo.length === 0) return false;
  
  // Check if it's a valid hex string:
  // - Must have even length (hex bytes are pairs)
  // - Must only contain hex characters (0-9, a-f, A-F)
  return cleanMemo.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(cleanMemo);
}

/**
 * Strips the 0x prefix from a hex string if present
 * @param hex The hex string
 * @returns The hex string without 0x prefix
 */
export function stripHexPrefix(hex: string): string {
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    return hex.slice(2);
  }
  return hex;
}

/**
 * Gets the byte length of a memo string
 * @param memo The memo string
 * @param isHex Whether the memo is in hex format
 * @returns The byte length of the memo
 */
export function getMemoByteLength(memo: string, isHex: boolean): number {
  if (isHex) {
    const cleanHex = stripHexPrefix(memo);
    // Each pair of hex characters represents one byte
    return Math.ceil(cleanHex.length / 2);
  } else {
    // For text, use UTF-8 encoding to get byte length
    return new TextEncoder().encode(memo).length;
  }
}

/**
 * Validates if a memo is within the allowed byte limit
 * @param memo The memo string
 * @param isHex Whether the memo is in hex format
 * @param maxBytes Maximum allowed bytes (default 34 for Counterparty)
 * @returns true if valid, false otherwise
 */
export function isValidMemoLength(memo: string, isHex: boolean, maxBytes: number = 34): boolean {
  return getMemoByteLength(memo, isHex) <= maxBytes;
}