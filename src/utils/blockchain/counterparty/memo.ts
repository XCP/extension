/**
 * Re-export memo validation functions from the centralized validation utilities
 * This maintains backward compatibility while consolidating validation logic
 */

export { 
  isHexMemo,
  stripHexPrefix,
  getMemoByteLength,
  validateMemoLength as isValidMemoLength, // Rename for backward compatibility
  validateMemo,
  hexToText,
  textToHex
} from '@/utils/validation';

// Note: The validation utility uses 80 bytes as default max length
// while Counterparty typically uses 34 bytes. Callers should specify
// maxBytes parameter explicitly when needed.