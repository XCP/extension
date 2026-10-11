/**
 * Fee validation utilities for Bitcoin transactions
 * Handles fee rate validation, fee calculation, and fee-related checks
 */

import { parseAmountDraft } from "@/core/amount-contract/amounts";
import { toBigNumber } from "@/core/numeric";

// Wallet form limits, not node relay policy.
export const MIN_FEE_RATE = 0.1;
export const MAX_FEE_RATE = 5000;

export interface FeeValidationResult {
  isValid: boolean;
  error?: string;
  errorCode?: 'fee_invalid' | 'fee_minimum' | 'fee_maximum';
  limit?: number;
  satsPerVByte?: number;
  totalFee?: number;
  warning?: string;
}

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

  if (typeof feeRate === 'number' && !Number.isFinite(feeRate)) {
    return { isValid: false, error: 'Fee rate must be a valid number' };
  }
  if (String(feeRate).startsWith('-')) return { isValid: false, error: 'Fee rate cannot be negative' };
  const parsed = parseAmountDraft(String(feeRate), { decimals: 8 });
  if (parsed.status !== 'valid') {
    return { isValid: false, error: 'Use digits and a dot, up to 8 decimals.' };
  }
  const rate = toBigNumber(parsed.canonical);

  // Check for negative
  if (rate.isNegative()) {
    return { isValid: false, error: 'Fee rate cannot be negative' };
  }

  // Check for zero
  if (rate.isZero()) {
    return { isValid: false, error: 'Fee rate cannot be zero' };
  }

  // Check minimum - convert minRate to BigNumber for proper comparison
  const minRateBN = toBigNumber(minRate.toString());
  if (rate.isLessThan(minRateBN)) {
    return { 
      isValid: false, 
      errorCode: 'fee_minimum', limit: minRate,
      error: `Fee rate too low (minimum: ${minRate} sat/vB)` 
    };
  }

  // Check maximum - convert maxRate to BigNumber for proper comparison
  const maxRateBN = toBigNumber(maxRate.toString());
  if (rate.isGreaterThan(maxRateBN)) {
    return { 
      isValid: false, 
      errorCode: 'fee_maximum', limit: maxRate,
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
