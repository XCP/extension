/**
 * Bitcoin address validation utilities with checksum verification
 * Uses @scure/base for proper base58 and bech32 validation
 */

import { base58, bech32, bech32m } from '@scure/base';

export interface AddressValidationResult {
  isValid: boolean;
  error?: string;
  addressFormat?: string;
  network?: 'mainnet' | 'testnet' | 'regtest';
}

/**
 * Validate a legacy Bitcoin address (P2PKH or P2SH) with checksum
 */
function validateBase58Address(address: string): AddressValidationResult {
  try {
    // Decode base58 with checksum validation
    const decoded = base58.decode(address);
    
    // Must be at least 25 bytes (1 version + 20 hash + 4 checksum)
    if (decoded.length !== 25) {
      return { isValid: false, error: 'Invalid address length' };
    }
    
    const version = decoded[0];
    
    // Mainnet P2PKH (version 0x00)
    if (version === 0x00) {
      return { isValid: true, addressFormat: 'P2PKH', network: 'mainnet' };
    }
    
    // Mainnet P2SH (version 0x05)
    if (version === 0x05) {
      return { isValid: true, addressFormat: 'P2SH', network: 'mainnet' };
    }
    
    // Testnet P2PKH (version 0x6F)
    if (version === 0x6F) {
      return { isValid: true, addressFormat: 'P2PKH', network: 'testnet' };
    }
    
    // Testnet P2SH (version 0xC4)
    if (version === 0xC4) {
      return { isValid: true, addressFormat: 'P2SH', network: 'testnet' };
    }
    
    return { isValid: false, error: 'Unknown address version' };
  } catch (error) {
    return { isValid: false, error: 'Invalid base58 encoding or checksum' };
  }
}

/**
 * Validate a bech32/bech32m Bitcoin address (SegWit) with checksum
 */
function validateBech32Address(address: string): AddressValidationResult {
  const lowerAddress = address.toLowerCase();
  
  // Check if it's all lowercase or all uppercase (mixed case is invalid)
  if (address !== lowerAddress && address !== address.toUpperCase()) {
    return { isValid: false, error: 'Bech32 addresses cannot have mixed case' };
  }
  
  try {
    // Try bech32 first (for witness v0)
    let decoded;
    let encoding: 'bech32' | 'bech32m' = 'bech32';
    
    try {
      decoded = bech32.decode(lowerAddress as `${string}1${string}`);
    } catch {
      // If bech32 fails, try bech32m (for witness v1+)
      try {
        decoded = bech32m.decode(lowerAddress as `${string}1${string}`);
        encoding = 'bech32m';
      } catch {
        return { isValid: false, error: 'Invalid bech32 encoding or checksum' };
      }
    }
    
    const { prefix, words } = decoded;
    
    // Determine network from prefix
    let network: 'mainnet' | 'testnet' | 'regtest';
    if (prefix === 'bc') {
      network = 'mainnet';
    } else if (prefix === 'tb') {
      network = 'testnet';
    } else if (prefix === 'bcrt') {
      network = 'regtest';
    } else {
      return { isValid: false, error: 'Unknown bech32 prefix' };
    }
    
    // Check witness version (first byte)
    if (words.length < 1) {
      return { isValid: false, error: 'Invalid bech32 data' };
    }
    
    const witnessVersion = words[0];
    
    // Convert 5-bit words to 8-bit bytes for program length check
    const witnessProgram = bech32.fromWords(words.slice(1));
    const programLength = witnessProgram.length;
    
    // Witness v0 (must use bech32, not bech32m)
    if (witnessVersion === 0) {
      if (encoding !== 'bech32') {
        return { isValid: false, error: 'Witness v0 must use bech32 encoding' };
      }
      
      // P2WPKH (20 bytes)
      if (programLength === 20) {
        return { isValid: true, addressFormat: 'P2WPKH', network };
      }
      
      // P2WSH (32 bytes)
      if (programLength === 32) {
        return { isValid: true, addressFormat: 'P2WSH', network };
      }
      
      return { isValid: false, error: 'Invalid witness v0 program length' };
    }
    
    // Witness v1 (Taproot - must use bech32m)
    if (witnessVersion === 1) {
      if (encoding !== 'bech32m') {
        return { isValid: false, error: 'Witness v1 must use bech32m encoding' };
      }
      
      // P2TR (32 bytes)
      if (programLength === 32) {
        return { isValid: true, addressFormat: 'P2TR', network };
      }
      
      return { isValid: false, error: 'Invalid witness v1 program length' };
    }
    
    // Future witness versions (2-16)
    if (witnessVersion >= 2 && witnessVersion <= 16) {
      if (encoding !== 'bech32m') {
        return { isValid: false, error: 'Witness v2+ must use bech32m encoding' };
      }
      
      // Program must be 2-40 bytes
      if (programLength >= 2 && programLength <= 40) {
        return { isValid: true, addressFormat: `Witness_v${witnessVersion}`, network };
      }
      
      return { isValid: false, error: 'Invalid witness program length' };
    }
    
    return { isValid: false, error: 'Invalid witness version' };
  } catch (error) {
    return { isValid: false, error: 'Invalid bech32 address' };
  }
}

/**
 * Validate a Counterparty bare multisig address (M_addr1_addr2[_addr3]_N)
 * See: counterparty-core/counterpartycore/lib/utils/multisig.py
 */
function validateMultisigAddress(address: string): AddressValidationResult {
  const parts = address.split('_');

  // Minimum: M_addr1_addr2_N = 4 parts, Maximum: M_addr1_addr2_addr3_N = 5 parts
  if (parts.length < 4 || parts.length > 5) {
    return { isValid: false, error: 'Invalid multisig address format' };
  }

  const signaturesRequired = parseInt(parts[0], 10);
  const signaturesPossible = parseInt(parts[parts.length - 1], 10);
  const addresses = parts.slice(1, -1);

  if (isNaN(signaturesRequired) || signaturesRequired < 1 || signaturesRequired > 3) {
    return { isValid: false, error: 'Invalid signatures required (must be 1-3)' };
  }

  if (isNaN(signaturesPossible) || signaturesPossible < 2 || signaturesPossible > 3) {
    return { isValid: false, error: 'Invalid signatures possible (must be 2-3)' };
  }

  if (signaturesRequired > signaturesPossible) {
    return { isValid: false, error: 'Signatures required cannot exceed signatures possible' };
  }

  if (addresses.length !== signaturesPossible) {
    return { isValid: false, error: `Expected ${signaturesPossible} addresses, got ${addresses.length}` };
  }

  // Validate each individual address and determine network from first
  let network: 'mainnet' | 'testnet' | 'regtest' | undefined;
  for (const addr of addresses) {
    const result = validateBitcoinAddress(addr);
    if (!result.isValid) {
      return { isValid: false, error: `Invalid address in multisig: ${result.error}` };
    }
    if (!network && result.network) {
      network = result.network;
    }
  }

  return { isValid: true, addressFormat: 'Multisig', network: network ?? 'mainnet' };
}

/**
 * Validate a Bitcoin address with full checksum verification
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

  // Check if it's a Counterparty multisig address (M_addr1_addr2_N format)
  if (cleaned.includes('_')) {
    return validateMultisigAddress(cleaned);
  }

  // Check if it's a bech32 address (starts with bc, tb, or bcrt)
  if (/^(bc|tb|bcrt)1[a-z0-9]+$/i.test(cleaned)) {
    return validateBech32Address(cleaned);
  }

  // Otherwise try base58 (legacy/p2sh)
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(cleaned)) {
    return validateBase58Address(cleaned);
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

/**
 * Check if an address is a Counterparty multisig address (M_addr1_addr2[_addr3]_N)
 */
export function isMultisigAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  const result = validateBitcoinAddress(address.trim());
  return result.isValid && result.addressFormat === 'Multisig';
}