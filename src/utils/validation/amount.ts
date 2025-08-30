/**
 * Amount and quantity validation utilities
 * Handles validation for Bitcoin amounts, token quantities, and numeric inputs
 */

import { toBigNumber, BigNumber } from '@/utils/numeric';

// Constants
export const DUST_LIMIT = 546; // satoshis
export const MAX_SATOSHIS = 2100000000000000; // 21 million BTC in satoshis
export const SATOSHIS_PER_BTC = 100000000;

export interface AmountValidationResult {
  isValid: boolean;
  error?: string;
  satoshis?: number;
  normalized?: string;
}

export interface QuantityValidationResult {
  isValid: boolean;
  error?: string;
  quantity?: string;
  normalized?: string;
}

/**
 * Validates a Bitcoin amount
 */
export function validateAmount(
  amount: string | number,
  options: {
    allowZero?: boolean;
    allowDust?: boolean;
    maxAmount?: number;
    minAmount?: number;
    decimals?: number;
  } = {}
): AmountValidationResult {
  const {
    allowZero = false,
    allowDust = true,
    maxAmount = MAX_SATOSHIS,
    minAmount = 0,
    decimals = 8
  } = options;

  // Handle empty input
  if (amount === '' || amount === null || amount === undefined) {
    return { isValid: false, error: 'Amount is required' };
  }

  // Convert to string for processing
  const amountStr = String(amount).trim();

  // Check for special values first
  if (amountStr === 'NaN' || amountStr === 'Infinity' || amountStr === '-Infinity') {
    return { isValid: false, error: 'Invalid amount' };
  }

  // Check for invalid characters (no scientific notation allowed)
  if (!/^-?\d*\.?\d*$/.test(amountStr) || amountStr === '' || amountStr === '-' || amountStr === '.') {
    return { isValid: false, error: 'Invalid amount format' };
  }

  // Parse the amount
  const value = toBigNumber(amountStr);

  // Check for NaN or Infinity
  if (value.isNaN() || !value.isFinite()) {
    return { isValid: false, error: 'Invalid amount' };
  }

  // Check for negative
  if (value.isNegative()) {
    return { isValid: false, error: 'Amount cannot be negative' };
  }

  // Check for zero
  if (value.isZero() && !allowZero) {
    return { isValid: false, error: 'Amount must be greater than zero' };
  }

  // Check decimal places
  const decimalPlaces = value.decimalPlaces();
  if (decimalPlaces !== null && decimalPlaces > decimals) {
    return { isValid: false, error: `Maximum ${decimals} decimal places allowed` };
  }

  // Convert to satoshis for Bitcoin amounts
  const satoshis = value.multipliedBy(SATOSHIS_PER_BTC).integerValue(BigNumber.ROUND_DOWN);

  // Check minimum amount
  if (satoshis.isLessThan(minAmount)) {
    return { isValid: false, error: `Amount is below minimum (${minAmount} satoshis)` };
  }

  // Check dust limit
  if (!allowDust && satoshis.isLessThan(DUST_LIMIT)) {
    return { isValid: false, error: `Amount is below dust limit (${DUST_LIMIT} satoshis)` };
  }

  // Check maximum amount
  if (satoshis.isGreaterThan(maxAmount)) {
    return { isValid: false, error: `Amount exceeds maximum (${maxAmount} satoshis)` };
  }

  return {
    isValid: true,
    satoshis: satoshis.toNumber(),
    normalized: value.toFixed()
  };
}

/**
 * Validates a token quantity
 */
export function validateQuantity(
  quantity: string | number,
  options: {
    divisible?: boolean;
    allowZero?: boolean;
    maxSupply?: string;
    minQuantity?: string;
  } = {}
): QuantityValidationResult {
  const {
    divisible = true,
    allowZero = false,
    maxSupply = '9223372036854775807', // Max int64
    minQuantity = '0'
  } = options;

  // Handle empty input
  if (quantity === '' || quantity === null || quantity === undefined) {
    return { isValid: false, error: 'Quantity is required' };
  }

  // Convert to string for processing
  const quantityStr = String(quantity).trim();

  // Check for special values first
  if (quantityStr === 'NaN' || quantityStr === 'Infinity' || quantityStr === '-Infinity') {
    return { isValid: false, error: 'Invalid quantity' };
  }

  // Check for invalid characters (no scientific notation allowed)
  if (!/^-?\d*\.?\d*$/.test(quantityStr) || quantityStr === '' || quantityStr === '-' || quantityStr === '.') {
    return { isValid: false, error: 'Invalid quantity format' };
  }

  // Parse the quantity
  const value = toBigNumber(quantityStr);

  // Check for NaN or Infinity
  if (value.isNaN() || !value.isFinite()) {
    return { isValid: false, error: 'Invalid quantity' };
  }

  // Check for negative
  if (value.isNegative()) {
    return { isValid: false, error: 'Quantity cannot be negative' };
  }

  // Check for zero
  if (value.isZero() && !allowZero) {
    return { isValid: false, error: 'Quantity must be greater than zero' };
  }

  // Check divisibility
  if (!divisible && !value.isInteger()) {
    return { isValid: false, error: 'Asset is not divisible - whole numbers only' };
  }

  // Check decimal places for divisible assets
  if (divisible) {
    const decimalPlaces = value.decimalPlaces();
    if (decimalPlaces !== null && decimalPlaces > 8) {
      return { isValid: false, error: 'Maximum 8 decimal places allowed' };
    }
  }

  // Check minimum quantity
  const minQty = toBigNumber(minQuantity);
  if (value.isLessThan(minQty)) {
    return { isValid: false, error: `Quantity is below minimum (${minQuantity})` };
  }

  // Check maximum supply
  const maxQty = toBigNumber(maxSupply);
  if (value.isGreaterThan(maxQty)) {
    return { isValid: false, error: `Quantity exceeds maximum supply (${maxSupply})` };
  }

  return {
    isValid: true,
    quantity: value.toString(),
    normalized: value.toFixed()
  };
}

/**
 * Validates if a string can be parsed as a number
 */
export function isValidNumber(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  const trimmed = value.trim();
  if (trimmed === '') return false;
  
  // Check format (no scientific notation allowed)
  if (!/^-?\d*\.?\d+$/.test(trimmed)) return false;
  
  // Try to parse
  const num = Number(trimmed);
  return !isNaN(num) && isFinite(num);
}

/**
 * Validates if amount is within balance
 */
export function validateBalance(
  amount: string | number,
  balance: string | number,
  options: {
    includesFee?: boolean;
    feeAmount?: number;
  } = {}
): { isValid: boolean; error?: string } {
  const { includesFee = false, feeAmount = 0 } = options;

  // Check for special values first
  if (String(amount) === 'NaN' || String(balance) === 'NaN' ||
      String(amount) === 'Infinity' || String(amount) === '-Infinity' ||
      String(balance) === 'Infinity' || String(balance) === '-Infinity') {
    // Handle Infinity specially for balance
    if (String(balance) === 'Infinity' && String(amount) !== 'Infinity' && String(amount) !== '-Infinity' && String(amount) !== 'NaN') {
      return { isValid: true }; // Infinite balance can cover any finite amount
    }
    return { isValid: false, error: 'Invalid amount or balance' };
  }
  
  const amountBN = toBigNumber(amount);
  const balanceBN = toBigNumber(balance);
  
  if (amountBN.isNaN() || balanceBN.isNaN()) {
    return { isValid: false, error: 'Invalid amount or balance' };
  }

  let totalRequired = amountBN;
  if (includesFee && feeAmount > 0) {
    totalRequired = amountBN.plus(feeAmount);
  }

  if (totalRequired.isGreaterThan(balanceBN)) {
    return { isValid: false, error: 'Insufficient balance' };
  }

  return { isValid: true };
}


/**
 * Converts BTC to satoshis
 */
export function btcToSatoshis(btc: number | string): number {
  const satoshis = toBigNumber(btc).multipliedBy(SATOSHIS_PER_BTC);
  return satoshis.integerValue(BigNumber.ROUND_DOWN).toNumber();
}

/**
 * Checks if an amount is dust
 */
export function isDustAmount(satoshis: number): boolean {
  return satoshis < DUST_LIMIT && satoshis > 0;
}