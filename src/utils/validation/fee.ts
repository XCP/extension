/**
 * Fee validation utilities for Bitcoin transactions
 * Handles fee rate validation, fee calculation, and fee-related checks
 */

import { toBigNumber, BigNumber } from '@/utils/numeric';

// Fee rate constants (in sat/vB)
export const MIN_FEE_RATE = 1;
export const MAX_FEE_RATE = 5000; // 5000 sat/vB is extremely high
export const DEFAULT_FEE_RATE = 10;
export const PRIORITY_FEE_MULTIPLIER = 1.5;

// Transaction size constants
export const TYPICAL_INPUT_SIZE = 148; // P2PKH input size in vBytes
export const TYPICAL_OUTPUT_SIZE = 34; // P2PKH output size in vBytes
export const TRANSACTION_OVERHEAD = 10; // Fixed transaction overhead in vBytes

export interface FeeValidationResult {
  isValid: boolean;
  error?: string;
  satsPerVByte?: number;
  totalFee?: number;
  warning?: string;
}

export interface FeeCalculationResult {
  fee: number;
  feeRate: number;
  estimatedSize: number;
  warning?: string;
}

/**
 * Validates a fee rate
 */
export function validateFeeRate(
  feeRate: string | number,
  options: {
    minRate?: number;
    maxRate?: number;
    warnHighFee?: boolean;
  } = {}
): FeeValidationResult {
  const { 
    minRate = MIN_FEE_RATE, 
    maxRate = MAX_FEE_RATE,
    warnHighFee = true 
  } = options;

  // Handle empty input
  if (feeRate === '' || feeRate === null || feeRate === undefined) {
    return { isValid: false, error: 'Fee rate is required' };
  }

  // Parse the fee rate
  let rate: BigNumber;
  try {
    rate = toBigNumber(feeRate);
  } catch (e) {
    return { isValid: false, error: 'Invalid fee rate format' };
  }

  // Check for valid number
  if (rate.isNaN() || !rate.isFinite()) {
    return { isValid: false, error: 'Fee rate must be a valid number' };
  }

  // Check for negative
  if (rate.isNegative()) {
    return { isValid: false, error: 'Fee rate cannot be negative' };
  }

  // Check for zero
  if (rate.isZero()) {
    return { isValid: false, error: 'Fee rate cannot be zero' };
  }

  // Check minimum
  if (rate.isLessThan(minRate)) {
    return { 
      isValid: false, 
      error: `Fee rate too low (minimum: ${minRate} sat/vB)` 
    };
  }

  // Check maximum
  if (rate.isGreaterThan(maxRate)) {
    return { 
      isValid: false, 
      error: `Fee rate too high (maximum: ${maxRate} sat/vB)` 
    };
  }

  const result: FeeValidationResult = {
    isValid: true,
    satsPerVByte: rate.toNumber()
  };

  // Add warning for high fees
  if (warnHighFee && rate.isGreaterThan(100)) {
    result.warning = 'This is a very high fee rate. Consider using a lower rate unless urgent.';
  }

  return result;
}

/**
 * Calculates transaction fee based on inputs and outputs
 */
export function calculateTransactionFee(
  inputs: number,
  outputs: number,
  feeRate: number,
  options: {
    inputSize?: number;
    outputSize?: number;
    overhead?: number;
  } = {}
): FeeCalculationResult {
  const {
    inputSize = TYPICAL_INPUT_SIZE,
    outputSize = TYPICAL_OUTPUT_SIZE,
    overhead = TRANSACTION_OVERHEAD
  } = options;

  // Calculate transaction size in vBytes
  const estimatedSize = (inputs * inputSize) + (outputs * outputSize) + overhead;
  
  // Calculate total fee
  const fee = Math.ceil(estimatedSize * feeRate);

  const result: FeeCalculationResult = {
    fee,
    feeRate,
    estimatedSize
  };

  // Add warning for very high fees
  if (fee > 100000) { // More than 0.001 BTC
    result.warning = 'Transaction fee exceeds 0.001 BTC';
  }

  return result;
}

/**
 * Validates if balance is sufficient for amount + fee
 */
export function validateFeeWithBalance(
  amount: string | number,
  fee: string | number,
  balance: string | number
): { isValid: boolean; error?: string; totalRequired?: string } {
  // Check for special values first
  const amountStr = String(amount);
  const feeStr = String(fee);
  const balanceStr = String(balance);
  
  if (amountStr === 'NaN' || feeStr === 'NaN' || balanceStr === 'NaN' ||
      amountStr === 'Infinity' || amountStr === '-Infinity' ||
      feeStr === 'Infinity' || feeStr === '-Infinity' ||
      balanceStr === 'Infinity' || balanceStr === '-Infinity') {
    return { isValid: false, error: 'Invalid amount, fee, or balance' };
  }
  
  const amountBN = toBigNumber(amount);
  const feeBN = toBigNumber(fee);
  const balanceBN = toBigNumber(balance);

  // Check for valid numbers
  if (amountBN.isNaN() || feeBN.isNaN() || balanceBN.isNaN()) {
    return { isValid: false, error: 'Invalid amount, fee, or balance' };
  }

  // Calculate total required
  const totalRequired = amountBN.plus(feeBN);

  // Check if balance is sufficient
  if (totalRequired.isGreaterThan(balanceBN)) {
    const shortfall = totalRequired.minus(balanceBN);
    return { 
      isValid: false, 
      error: `Insufficient balance. Need ${shortfall.toString()} more satoshis`,
      totalRequired: totalRequired.toString()
    };
  }

  return { 
    isValid: true,
    totalRequired: totalRequired.toString()
  };
}

/**
 * Estimates fee rate based on priority
 */
export function estimateFeeRate(
  priority: 'low' | 'medium' | 'high',
  currentRates?: {
    low?: number;
    medium?: number;
    high?: number;
  }
): number {
  // If current rates are provided, use them
  if (currentRates) {
    switch (priority) {
      case 'low':
        return currentRates.low || MIN_FEE_RATE;
      case 'medium':
        return currentRates.medium || DEFAULT_FEE_RATE;
      case 'high':
        return currentRates.high || DEFAULT_FEE_RATE * 2;
    }
  }

  // Otherwise use defaults
  switch (priority) {
    case 'low':
      return MIN_FEE_RATE;
    case 'medium':
      return DEFAULT_FEE_RATE;
    case 'high':
      return DEFAULT_FEE_RATE * PRIORITY_FEE_MULTIPLIER;
  }
}

/**
 * Validates CPFP (Child Pays For Parent) fee
 */
export function validateCPFPFee(
  childFeeRate: number,
  parentFeeRate: number,
  childSize: number,
  parentSize: number
): { isValid: boolean; error?: string; effectiveRate?: number } {
  // Calculate combined size
  const combinedSize = childSize + parentSize;
  
  // Calculate parent fee
  const parentFee = parentFeeRate * parentSize;
  
  // Calculate required child fee for target rate
  const targetRate = childFeeRate;
  const requiredTotalFee = targetRate * combinedSize;
  const requiredChildFee = requiredTotalFee - parentFee;
  
  // Check if parent already has sufficient fee rate
  if (parentFeeRate >= childFeeRate) {
    return { 
      isValid: false, 
      error: 'Parent transaction already has sufficient fee rate' 
    };
  }
  
  // Check if child fee would be negative or zero
  if (requiredChildFee <= 0) {
    return { 
      isValid: false, 
      error: 'Parent transaction already has sufficient fee rate' 
    };
  }
  
  // Calculate effective rate
  const effectiveChildRate = requiredChildFee / childSize;
  
  if (effectiveChildRate > MAX_FEE_RATE) {
    return { 
      isValid: false, 
      error: `Required fee rate too high: ${effectiveChildRate.toFixed(2)} sat/vB` 
    };
  }
  
  return { 
    isValid: true,
    effectiveRate: effectiveChildRate
  };
}

/**
 * Checks if fee rate is reasonable for current network conditions
 */
export function isReasonableFeeRate(
  feeRate: number,
  networkRate?: number
): boolean {
  // If no network rate provided, check against defaults
  if (!networkRate) {
    return feeRate >= MIN_FEE_RATE && feeRate <= 100;
  }
  
  // Allow up to 10x the network rate as "reasonable"
  return feeRate >= MIN_FEE_RATE && feeRate <= networkRate * 10;
}