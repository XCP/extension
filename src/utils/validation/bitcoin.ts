/**
 * Bitcoin address validation utilities
 * Security-focused validation for Bitcoin addresses
 */

export interface AddressValidationResult {
  isValid: boolean;
  error?: string;
  addressType?: string;
  network?: 'mainnet' | 'testnet' | 'regtest';
}

/**
 * Validate a Bitcoin address with detailed checks
 */
export function validateBitcoinAddress(address: string): AddressValidationResult {
  if (!address || typeof address !== 'string') {
    return { isValid: false, error: 'Address is required' };
  }

  // Remove whitespace
  const cleaned = address.trim();
  
  if (cleaned.length === 0) {
    return { isValid: false, error: 'Address is empty' };
  }

  // Check for injection attempts
  if (/[<>'"`;]/.test(cleaned)) {
    return { isValid: false, error: 'Invalid characters in address' };
  }

  // P2PKH - Legacy (mainnet starts with 1)
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2PKH', network: 'mainnet' };
  }

  // P2SH - Pay to Script Hash (mainnet starts with 3)
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2SH', network: 'mainnet' };
  }

  // P2WPKH - Native SegWit (mainnet starts with bc1q, shorter format)
  if (/^bc1q[a-z0-9]{38}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2WPKH', network: 'mainnet' };
  }

  // P2TR - Taproot (mainnet starts with bc1p, 42 or 62 chars total)
  if (/^bc1p[a-z0-9]{38}$/.test(cleaned) || /^bc1p[a-z0-9]{58}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2TR', network: 'mainnet' };
  }

  // P2WSH - Native SegWit Script (mainnet starts with bc1q, 62 chars total)
  if (/^bc1q[a-z0-9]{58}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2WSH', network: 'mainnet' };
  }

  // Testnet P2PKH/P2SH (starts with m, n, or 2)
  if (/^[mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2PKH', network: 'testnet' };
  }
  
  if (/^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2SH', network: 'testnet' };
  }

  // Testnet SegWit (starts with tb1)
  if (/^tb1q[a-z0-9]{38}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2WPKH', network: 'testnet' };
  }

  if (/^tb1p[a-z0-9]{58}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2TR', network: 'testnet' };
  }

  // Regtest addresses
  if (/^bcrt1[a-z0-9]{39,89}$/.test(cleaned)) {
    return { isValid: true, addressType: 'SegWit', network: 'regtest' };
  }

  return { isValid: false, error: 'Invalid Bitcoin address format' };
}

/**
 * Simple boolean check for Bitcoin address validity
 * Wrapper around validateBitcoinAddress for convenience
 */
export function isValidBitcoinAddress(address: string): boolean {
  return validateBitcoinAddress(address).isValid;
}