import { AddressType } from '@/utils/blockchain/bitcoin';

/**
 * Private key format validation interface
 */
export interface PrivateKeyValidationResult {
  isValid: boolean;
  format?: 'hex' | 'wif-compressed' | 'wif-uncompressed';
  suggestedAddressType?: AddressType;
  error?: string;
}

/**
 * Validates private key format (hex or WIF)
 */
export function validatePrivateKeyFormat(privateKey: string): PrivateKeyValidationResult {
  if (!privateKey) {
    return { isValid: false, error: 'Private key is required' };
  }

  const trimmed = privateKey.trim();
  
  // Handle empty string after trim
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Private key is required' };
  }
  
  // Check for formula injection attempts
  if (/^[=@+\-]/.test(trimmed)) {
    return { isValid: false, error: 'Invalid private key format' };
  }

  // Check for common mistakes first (more specific errors)
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { isValid: false, error: 'Remove 0x prefix from hexadecimal private key' };
  }

  if (/^[0-9a-fA-F]{62,63}$/.test(trimmed) || /^[0-9a-fA-F]{65,66}$/.test(trimmed)) {
    return { isValid: false, error: 'Hexadecimal private key must be exactly 64 characters' };
  }

  // Check for obvious non-private key patterns
  if (trimmed.length < 51) {
    return { isValid: false, error: 'Private key is too short' };
  }

  if (trimmed.length > 64 && !isValidWIFLength(trimmed.length)) {
    return { isValid: false, error: 'Private key is too long' };
  }

  // Test hex format (64 characters)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return {
      isValid: true,
      format: 'hex',
      suggestedAddressType: AddressType.P2TR, // Default for hex
    };
  }

  // Test WIF format
  const wifResult = validateWIFFormat(trimmed);
  if (wifResult.isValid) {
    return wifResult;
  }

  return { isValid: false, error: 'Invalid private key format. Must be 64-character hex or valid WIF' };
}

/**
 * Validates WIF (Wallet Import Format) private key
 */
function validateWIFFormat(wif: string): PrivateKeyValidationResult {
  // Basic WIF pattern check
  if (!/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(wif)) {
    return { isValid: false };
  }

  // Determine WIF type and suggested address type
  if (wif.startsWith('5')) {
    return {
      isValid: true,
      format: 'wif-uncompressed',
      suggestedAddressType: AddressType.P2PKH, // Uncompressed keys typically use legacy
    };
  } else if (wif.startsWith('K') || wif.startsWith('L')) {
    return {
      isValid: true,
      format: 'wif-compressed',
      suggestedAddressType: AddressType.P2SH_P2WPKH, // Compressed keys can use SegWit
    };
  }

  return { isValid: false };
}

/**
 * Checks if WIF length is valid (51 or 52 characters)
 */
function isValidWIFLength(length: number): boolean {
  return length === 51 || length === 52;
}

/**
 * Sanitizes private key input by trimming whitespace
 */
export function sanitizePrivateKey(privateKey: string): string {
  return privateKey.trim();
}

/**
 * Checks if private key contains potentially dangerous characters
 */
export function containsDangerousChars(privateKey: string): boolean {
  // Check for control characters, null bytes, etc.
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(privateKey);
}

/**
 * Validates private key length constraints
 */
export function validatePrivateKeyLength(privateKey: string): { isValid: boolean; error?: string } {
  const trimmed = privateKey.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Private key cannot be empty' };
  }

  if (trimmed.length > 1000) {
    return { isValid: false, error: 'Private key is suspiciously long' };
  }

  // Valid lengths: 64 (hex), 51-52 (WIF)
  if (trimmed.length !== 64 && !isValidWIFLength(trimmed.length)) {
    return { isValid: false, error: 'Invalid private key length' };
  }

  return { isValid: true };
}

/**
 * Detects private key format without validation
 */
export function detectPrivateKeyFormat(privateKey: string): 'hex' | 'wif' | 'unknown' {
  const trimmed = privateKey.trim();
  
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return 'hex';
  }
  
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(trimmed)) {
    return 'wif';
  }
  
  return 'unknown';
}