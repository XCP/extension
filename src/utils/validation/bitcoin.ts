/**
 * Bitcoin address and amount validation utilities
 * Security-focused validation for Bitcoin operations
 */

import { toBigNumber, BigNumber } from '@/utils/numeric';
import { AmountValidationResult, DUST_LIMIT, MAX_SATOSHIS, SATOSHIS_PER_BTC } from './amount';

// Re-export constants for backward compatibility
export { DUST_LIMIT, MAX_SATOSHIS, SATOSHIS_PER_BTC };

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

  // P2WPKH - Native SegWit (mainnet starts with bc1q)
  if (/^bc1q[a-z0-9]{38}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2WPKH', network: 'mainnet' };
  }

  // P2TR - Taproot (mainnet starts with bc1p)
  if (/^bc1p[a-z0-9]{58}$/.test(cleaned)) {
    return { isValid: true, addressType: 'P2TR', network: 'mainnet' };
  }

  // P2WSH - Native SegWit Script (mainnet starts with bc1q, longer)
  if (/^bc1q[a-z0-9]{59}$/.test(cleaned)) {
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

/**
 * Validate a Bitcoin amount
 */
export function validateBitcoinAmount(
  amount: string | number,
  options: {
    unit?: 'btc' | 'satoshis';
    allowZero?: boolean;
    allowDust?: boolean;
    maxAmount?: number;
  } = {}
): AmountValidationResult {
  const {
    unit = 'btc',
    allowZero = false,
    allowDust = true,  // Default to allowing dust
    maxAmount = MAX_SATOSHIS
  } = options;

  // Handle different input types
  let value: BigNumber;
  
  if (typeof amount === 'number') {
    if (!isFinite(amount)) {
      return { isValid: false, error: 'Amount must be finite' };
    }
    value = toBigNumber(amount);
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim();
    
    if (trimmed === '') {
      return { isValid: false, error: 'Amount is required' };
    }

    // Check for injection attempts
    if (/[^0-9.,\-+eE]/.test(trimmed)) {
      return { isValid: false, error: 'Invalid characters in amount' };
    }

    // Check for formula injection (but allow negative sign for proper error later)
    if (/^[=@+]/.test(trimmed)) {
      return { isValid: false, error: 'Invalid amount format' };
    }

    try {
      value = toBigNumber(trimmed);
    } catch (e) {
      return { isValid: false, error: 'Invalid number format' };
    }
  } else {
    return { isValid: false, error: 'Amount must be a string or number' };
  }

  // Check if it's a valid number
  if (!value.isFinite()) {
    return { isValid: false, error: 'Amount must be finite' };
  }

  if (value.isNaN()) {
    return { isValid: false, error: 'Amount is not a number' };
  }

  // Convert to satoshis for validation
  let satoshis: BigNumber;
  
  if (unit === 'btc') {
    satoshis = value.multipliedBy(SATOSHIS_PER_BTC);
  } else {
    satoshis = value;
  }

  // Check if it's an integer (satoshis must be whole numbers)
  if (!satoshis.isInteger()) {
    return { isValid: false, error: 'Amount must be a whole number of satoshis' };
  }

  // Check sign
  if (satoshis.isNegative()) {
    return { isValid: false, error: 'Amount cannot be negative' };
  }

  // Check zero
  if (satoshis.isZero() && !allowZero) {
    return { isValid: false, error: 'Amount must be greater than zero' };
  }

  // Check dust limit
  if (!satoshis.isZero() && satoshis.isLessThan(DUST_LIMIT) && !allowDust) {
    return { 
      isValid: false, 
      error: `Amount is below dust limit (${DUST_LIMIT} satoshis)` 
    };
  }

  // Check maximum
  if (satoshis.isGreaterThan(maxAmount)) {
    return { 
      isValid: false, 
      error: `Amount exceeds maximum (${maxAmount} satoshis)` 
    };
  }

  // Return validated amounts
  const btcAmount = satoshis.dividedBy(SATOSHIS_PER_BTC);
  
  return {
    isValid: true,
    satoshis: satoshis.toNumber(),
    normalized: btcAmount.toFixed(8)
  };
}

/**
 * Validate transaction fee
 */
export function validateTransactionFee(
  feeRate: string | number,
  options: {
    minFeeRate?: number;
    maxFeeRate?: number;
  } = {}
): { isValid: boolean; error?: string; satsPerByte?: number } {
  const {
    minFeeRate = 1,    // 1 sat/byte minimum
    maxFeeRate = 1000  // 1000 sat/byte maximum (very high)
  } = options;

  let rate: number;
  
  if (typeof feeRate === 'number') {
    rate = feeRate;
  } else if (typeof feeRate === 'string') {
    const trimmed = feeRate.trim();
    
    if (!/^\d*\.?\d+$/.test(trimmed)) {
      return { isValid: false, error: 'Invalid fee rate format' };
    }
    
    rate = parseFloat(trimmed);
  } else {
    return { isValid: false, error: 'Fee rate must be a string or number' };
  }

  if (!isFinite(rate) || isNaN(rate)) {
    return { isValid: false, error: 'Fee rate must be a valid number' };
  }

  if (rate < minFeeRate) {
    return { isValid: false, error: `Fee rate too low (min: ${minFeeRate} sat/byte)` };
  }

  if (rate > maxFeeRate) {
    return { isValid: false, error: `Fee rate too high (max: ${maxFeeRate} sat/byte)` };
  }

  return { isValid: true, satsPerByte: rate };
}

/**
 * Validate UTXO data
 */
export function validateUTXO(utxo: any): { isValid: boolean; error?: string } {
  if (!utxo || typeof utxo !== 'object') {
    return { isValid: false, error: 'Invalid UTXO object' };
  }

  // Check required fields
  if (typeof utxo.txid !== 'string' || !/^[a-f0-9]{64}$/i.test(utxo.txid)) {
    return { isValid: false, error: 'Invalid transaction ID' };
  }

  if (typeof utxo.vout !== 'number' || utxo.vout < 0 || !Number.isInteger(utxo.vout)) {
    return { isValid: false, error: 'Invalid output index' };
  }

  if (typeof utxo.value !== 'number' || utxo.value < 0) {
    return { isValid: false, error: 'Invalid UTXO value' };
  }

  if (utxo.value > MAX_SATOSHIS) {
    return { isValid: false, error: 'UTXO value exceeds maximum' };
  }

  return { isValid: true };
}

/**
 * Calculate and validate transaction size
 */
export function estimateTransactionSize(
  inputs: number,
  outputs: number,
  isSegwit: boolean = false
): { size: number; vsize?: number } {
  if (inputs <= 0 || outputs <= 0) {
    throw new Error('Invalid input/output count');
  }

  // Basic calculation (non-SegWit)
  // P2PKH input: ~148 bytes
  // P2PKH output: ~34 bytes
  // Overhead: ~10 bytes
  
  if (!isSegwit) {
    const size = (inputs * 148) + (outputs * 34) + 10;
    return { size };
  }

  // SegWit calculation
  // P2WPKH input: ~68 vbytes
  // P2WPKH output: ~31 bytes
  const weight = (inputs * 272) + (outputs * 124) + 40;
  const vsize = Math.ceil(weight / 4);
  
  return { size: vsize, vsize };
}