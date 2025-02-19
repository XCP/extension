import BigNumber from 'bignumber.js';

// Configure BigNumber globally
BigNumber.config({
  DECIMAL_PLACES: 8,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  // Prevents scientific notation
  FORMAT: {
    decimalSeparator: '.',
    groupSeparator: '',
    groupSize: 0,
    secondaryGroupSize: 0,
    fractionGroupSeparator: '',
    fractionGroupSize: 0
  }
});

/**
 * Creates a BigNumber instance from a value, safely handling string conversion
 * to prevent precision loss.
 * 
 * @param value - The value to convert to BigNumber
 * @param defaultValue - Optional default value if conversion fails
 * @returns BigNumber instance
 */
export const toBigNumber = (value: string | number | BigNumber | null | undefined, defaultValue = '0'): BigNumber => {
  try {
    if (value === null || value === undefined) {
      return new BigNumber(defaultValue);
    }
    // Always convert to string first to prevent precision loss
    return new BigNumber(value.toString());
  } catch (error) {
    console.error('Error converting to BigNumber:', error);
    return new BigNumber(defaultValue);
  }
};

/**
 * Formats a BigNumber to a string with specified decimal places
 * 
 * @param value - BigNumber to format
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted string
 */
export const formatBigNumber = (value: BigNumber, decimals = 8): string => {
  return value.toFormat(decimals);
};

/**
 * Validates if a string represents a valid positive number
 * 
 * @param value - String to validate
 * @param options - Validation options
 * @returns boolean
 */
export const isValidPositiveNumber = (
  value: string,
  options: {
    allowZero?: boolean;
    maxDecimals?: number;
  } = {}
): boolean => {
  const { allowZero = false, maxDecimals = 8 } = options;
  
  try {
    const num = toBigNumber(value);
    if (allowZero) {
      if (num.lessThan(0)) return false;
    } else {
      if (num.lessThanOrEqualTo(0)) return false;
    }

    // Check decimal places
    const decimalPlaces = value.includes('.') ? value.split('.')[1].length : 0;
    if (decimalPlaces > maxDecimals) return false;

    return true;
  } catch {
    return false;
  }
};

/**
 * Rounds down a BigNumber to the nearest multiple of another BigNumber
 * Useful for calculating dispenser quantities
 * 
 * @param value - The value to round
 * @param multiple - The multiple to round to
 * @returns Rounded BigNumber
 */
export const roundDownToMultiple = (value: BigNumber, multiple: BigNumber): BigNumber => {
  const quotient = value.div(multiple).floor();
  return quotient.times(multiple);
};

/**
 * Converts a value to satoshis (multiplies by 1e8)
 * 
 * @param value - The value in BTC
 * @returns The value in satoshis
 */
export const toSatoshis = (value: BigNumber | string | number): BigNumber => {
  return toBigNumber(value).times(1e8);
};

/**
 * Converts satoshis to BTC (divides by 1e8)
 * 
 * @param satoshis - The value in satoshis
 * @returns The value in BTC
 */
export const fromSatoshis = (satoshis: BigNumber | string | number): BigNumber => {
  return toBigNumber(satoshis).dividedBy(1e8);
}; 