/**
 * Pure validation functions for Counterparty assets
 * These functions have no dependencies on React, browser APIs, or other contexts
 */

/**
 * Validates a parent asset (or regular asset) name according to Counterparty rules
 */
export function validateParentAsset(assetName: string): { isValid: boolean; error?: string } {
  if (!assetName) {
    return { isValid: false, error: "Asset name is required" };
  }

  // Cannot be reserved names
  if (assetName === 'BTC' || assetName === 'XCP') {
    return { isValid: false, error: "Cannot use reserved asset names" };
  }
  
  // Check for numeric asset (A + number with at least 26^12)
  if (assetName.startsWith('A')) {
    const numberPart = assetName.substring(1);
    
    // If it's all digits, validate as numeric asset
    if (/^\d+$/.test(numberPart)) {
      // Check if it's in valid range (26^12 to 256^8 - 1)
      try {
        const value = BigInt(numberPart);
        const min = BigInt(26) ** BigInt(12);
        const max = BigInt(256) ** BigInt(8) - BigInt(1);
        
        if (value < min || value > max) {
          return { isValid: false, error: "Numeric asset out of valid range" };
        }
        
        return { isValid: true };
      } catch {
        return { isValid: false, error: "Invalid numeric asset" };
      }
    }
    // Otherwise, fall through to named asset validation which will reject it
  }
  
  // Named assets: 4-12 characters, B-Z start, only A-Z
  if (!/^[B-Z][A-Z]{3,11}$/.test(assetName)) {
    if (assetName.length < 4) {
      return { isValid: false, error: "Asset name too short (min 4 characters)" };
    }
    if (assetName.length > 12) {
      return { isValid: false, error: "Asset name too long (max 12 characters)" };
    }
    if (!/^[A-Z]+$/.test(assetName)) {
      return { isValid: false, error: "Asset names must contain only A-Z" };
    }
    if (assetName.startsWith('A')) {
      return { isValid: false, error: "Non-numeric assets cannot start with 'A'" };
    }
    return { isValid: false, error: "Invalid asset name format" };
  }
  
  return { isValid: true };
}

/**
 * Validates a subasset name (PARENT.CHILD format)
 */
export function validateSubasset(fullName: string, parentAsset?: string): { isValid: boolean; error?: string } {
  if (!fullName) {
    return { isValid: false, error: "Subasset name is required" };
  }

  // Must contain exactly one dot
  const parts = fullName.split('.');
  if (parts.length !== 2) {
    return { isValid: false, error: "Invalid subasset format" };
  }

  const [parent, child] = parts;

  // If parentAsset is provided, must match
  if (parentAsset && parent !== parentAsset) {
    return { isValid: false, error: `Subasset must be under parent ${parentAsset}` };
  }

  // Validate parent
  const parentValidation = validateParentAsset(parent);
  if (!parentValidation.isValid) {
    return { isValid: false, error: `Invalid parent asset: ${parentValidation.error}` };
  }

  // Validate child name
  if (!child) {
    return { isValid: false, error: "Subasset name cannot be empty" };
  }

  // Maximum length for child (250 chars max)
  if (child.length > 250) {
    return { isValid: false, error: "Subasset name is too long (max 250 characters)" };
  }

  // Child can contain: a-zA-Z0-9.-_@!
  if (!/^[a-zA-Z0-9.\-_@!]+$/.test(child)) {
    return { isValid: false, error: "Subasset name contains invalid characters" };
  }

  return { isValid: true };
}

/**
 * Main validation function that handles both assets and subassets
 */
export function validateAssetName(assetName: string, isSubasset: boolean): { isValid: boolean; error?: string } {
  if (!assetName) {
    return { isValid: false, error: "Asset name is required" };
  }

  if (isSubasset) {
    return validateSubasset(assetName);
  } else {
    return validateParentAsset(assetName);
  }
}

/**
 * Check if a string is a valid numeric asset
 */
export function isNumericAsset(assetName: string): boolean {
  if (!assetName.startsWith('A')) return false;
  
  const numberPart = assetName.substring(1);
  if (!/^\d+$/.test(numberPart)) return false;
  
  try {
    const value = BigInt(numberPart);
    const min = BigInt(26) ** BigInt(12);
    const max = BigInt(256) ** BigInt(8) - BigInt(1);
    return value >= min && value <= max;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid named asset
 */
export function isNamedAsset(assetName: string): boolean {
  return /^[B-Z][A-Z]{3,11}$/.test(assetName);
}