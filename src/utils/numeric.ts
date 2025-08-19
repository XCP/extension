import BigNumber from "bignumber.js";

// Configure BigNumber globally
BigNumber.config({
  DECIMAL_PLACES: 8,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  // Prevents scientific notation
  FORMAT: {
    decimalSeparator: ".",
    groupSeparator: "",
    groupSize: 0,
    secondaryGroupSize: 0,
    fractionGroupSeparator: "",
    fractionGroupSize: 0,
  },
});

/**
 * Creates a BigNumber instance from a value, safely handling string conversion
 * to prevent precision loss.
 *
 * @param value - The value to convert to BigNumber
 * @param defaultValue - Optional default value if conversion fails
 * @returns BigNumber instance
 */
export const toBigNumber = (value: string | number | BigNumber | null | undefined, defaultValue = "0"): BigNumber => {
  try {
    if (value === null || value === undefined) {
      return new BigNumber(defaultValue);
    }
    
    // If already a BigNumber, return it
    if (BigNumber.isBigNumber(value)) {
      return value;
    }
    
    // Convert to string and remove formatting characters (commas, spaces)
    let cleanValue = value.toString();
    // Remove commas and spaces that might be used for number formatting
    cleanValue = cleanValue.replace(/[,\s]/g, '');
    
    const result = new BigNumber(cleanValue);
    
    // Check if the result is NaN and fallback to default
    if (result.isNaN()) {
      console.error("Error converting to BigNumber:", `Invalid input: ${value}`);
      return new BigNumber(defaultValue);
    }
    
    return result;
  } catch (error) {
    console.error("Error converting to BigNumber:", error);
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
    // First check if it's a valid number format before converting
    const testNum = new BigNumber(value);
    if (testNum.isNaN()) {
      return false;
    }
    
    const num = toBigNumber(value);
    if (allowZero) {
      if (num.isLessThan(0)) return false;
    } else {
      if (num.isLessThanOrEqualTo(0)) return false;
    }

    // Check decimal places
    const decimalPlaces = value.includes(".") ? value.split(".")[1].length : 0;
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
  const quotient = value.div(multiple).integerValue(BigNumber.ROUND_DOWN);
  return quotient.times(multiple);
};

/**
 * Converts a value to satoshis (multiplies by 1e8), ensuring an integer result
 *
 * @param value - The value in BTC (or other divisible unit)
 * @returns The value in satoshis as an integer string
 */
export const toSatoshis = (value: BigNumber | string | number): string => {
  return toBigNumber(value).times(1e8).integerValue(BigNumber.ROUND_DOWN).toString();
};

/**
 * Converts satoshis to BTC (divides by 1e8)
 *
 * @param satoshis - The value in satoshis
 * @returns The value in BTC as a string
 */
export const fromSatoshis = (satoshis: BigNumber | string | number): string => {
  return toBigNumber(satoshis).dividedBy(1e8).toFixed(8);
};

/**
 * Subtracts one satoshi value from another, returning an integer result
 *
 * @param minuend - The value to subtract from (in satoshis)
 * @param subtrahend - The value to subtract (in satoshis)
 * @returns The difference as an integer string
 */
export const subtractSatoshis = (minuend: string | number, subtrahend: string | number): string => {
  return toBigNumber(minuend).minus(toBigNumber(subtrahend)).integerValue(BigNumber.ROUND_DOWN).toString();
};

/**
 * Divides a satoshi value by a number, returning an integer result rounded down
 *
 * @param dividend - The value to divide (in satoshis)
 * @param divisor - The number to divide by
 * @returns The quotient as an integer string
 */
export const divideSatoshis = (dividend: string | number, divisor: number): string => {
  return toBigNumber(dividend).div(divisor).integerValue(BigNumber.ROUND_DOWN).toString();
};

/**
 * Checks if a satoshi value is less than another
 *
 * @param value - The value to check (in satoshis)
 * @param threshold - The threshold to compare against (in satoshis)
 * @returns Boolean indicating if value is less than threshold
 */
export const isLessThanSatoshis = (value: string | number, threshold: string | number): boolean => {
  return toBigNumber(value).isLessThan(toBigNumber(threshold));
};

/**
 * Checks if a satoshi value is less than or equal to another
 *
 * @param value - The value to check (in satoshis)
 * @param threshold - The threshold to compare against (in satoshis)
 * @returns Boolean indicating if value is less than or equal to threshold
 */
export const isLessThanOrEqualToSatoshis = (value: string | number, threshold: string | number): boolean => {
  return toBigNumber(value).isLessThanOrEqualTo(toBigNumber(threshold));
};
