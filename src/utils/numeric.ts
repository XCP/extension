import BigNumber from "bignumber.js";

// Constants
const SATOSHI_DIVISOR = 100000000;

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
    // Check for formula injection attempts
    if (/^[=@+\-]/.test(value.trim())) {
      return false;
    }

    // First check if it's a valid number format before converting
    const testNum = new BigNumber(value);
    if (testNum.isNaN()) {
      return false;
    }
    
    // Check for infinity (positive or negative)
    if (!testNum.isFinite()) {
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
 * @param options - Conversion options
 * @param options.asNumber - If true, returns a number instead of string (default: false)
 * @param options.removeTrailingZeros - If true, removes trailing zeros from string result (default: false)
 * @returns The value in BTC as a string or number
 */
export function fromSatoshis(satoshis: BigNumber | string | number, options?: { asNumber?: false; removeTrailingZeros?: boolean }): string;
export function fromSatoshis(satoshis: BigNumber | string | number, options: { asNumber: true; removeTrailingZeros?: never }): number;
export function fromSatoshis(satoshis: BigNumber | string | number, asNumber: true): number; // Backward compatibility overload
export function fromSatoshis(satoshis: BigNumber | string | number, optionsOrAsNumber: boolean | { asNumber?: boolean; removeTrailingZeros?: boolean } = false): string | number {
  // Handle backward compatibility with boolean parameter
  const options = typeof optionsOrAsNumber === 'boolean' 
    ? { asNumber: optionsOrAsNumber, removeTrailingZeros: false }
    : { asNumber: false, removeTrailingZeros: false, ...optionsOrAsNumber };
  
  const result = toBigNumber(satoshis).dividedBy(1e8);
  
  if (options.asNumber) {
    return result.toNumber();
  }
  
  const str = result.toFixed(8);
  return options.removeTrailingZeros ? str.replace(/\.?0+$/, '') : str;
}

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

/**
 * Multiplies a value by another value
 *
 * @param multiplicand - The value to multiply
 * @param multiplier - The value to multiply by
 * @returns The product as a BigNumber
 */
export const multiply = (multiplicand: string | number | BigNumber, multiplier: string | number | BigNumber): BigNumber => {
  return toBigNumber(multiplicand).times(toBigNumber(multiplier));
};

/**
 * Subtracts one value from another
 *
 * @param minuend - The value to subtract from
 * @param subtrahend - The value to subtract
 * @returns The difference as a BigNumber
 */
export const subtract = (minuend: string | number | BigNumber, subtrahend: string | number | BigNumber): BigNumber => {
  return toBigNumber(minuend).minus(toBigNumber(subtrahend));
};

/**
 * Divides one value by another
 *
 * @param dividend - The value to divide
 * @param divisor - The value to divide by
 * @returns The quotient as a BigNumber
 */
export const divide = (dividend: string | number | BigNumber, divisor: string | number | BigNumber): BigNumber => {
  return toBigNumber(dividend).div(toBigNumber(divisor));
};

/**
 * Rounds a value to an integer using specified rounding mode
 *
 * @param value - The value to round
 * @param roundingMode - The rounding mode (default: ROUND_DOWN)
 * @returns The rounded integer as a BigNumber
 */
// Unused but kept for potential future use
// export const toInteger = (value: string | number | BigNumber, roundingMode = BigNumber.ROUND_DOWN): BigNumber => {
//   return toBigNumber(value).integerValue(roundingMode);
// };

/**
 * Rounds up a value to an integer (ceiling)
 *
 * @param value - The value to round up
 * @returns The rounded integer as a BigNumber
 */
export const roundUp = (value: string | number | BigNumber): BigNumber => {
  return toBigNumber(value).integerValue(BigNumber.ROUND_CEIL);
};

/**
 * Rounds down a value to an integer (floor)
 *
 * @param value - The value to round down
 * @returns The rounded integer as a BigNumber
 */
export const roundDown = (value: string | number | BigNumber): BigNumber => {
  return toBigNumber(value).integerValue(BigNumber.ROUND_FLOOR);
};

/**
 * Checks if a value is less than or equal to zero
 *
 * @param value - The value to check
 * @returns Boolean indicating if value is less than or equal to zero
 */
export const isLessThanOrEqualToZero = (value: string | number | BigNumber): boolean => {
  return toBigNumber(value).isLessThanOrEqualTo(0);
};

/**
 * Converts a BigNumber to a number
 *
 * @param value - The BigNumber to convert
 * @returns The value as a number
 */
export const toNumber = (value: string | number | BigNumber): number => {
  return toBigNumber(value).toNumber();
};

/**
 * Converts asset supply from raw units to normalized units based on divisibility
 * For divisible assets, divides by 100,000,000 (1e8)
 * For non-divisible assets, returns the value as-is
 * @param supply - The raw supply value as string or number
 * @param isDivisible - Whether the asset is divisible
 * @returns The normalized supply as a number
 * @example
 * normalizeAssetSupply("100000000", true) // 1.0 (divisible)
 * normalizeAssetSupply("100", false) // 100 (non-divisible)
 */
export function normalizeAssetSupply(supply: string | number, isDivisible: boolean): number {
  const supplyBN = toBigNumber(supply);
  if (isDivisible) {
    // Use safe division with BigNumber for divisible assets
    return supplyBN.dividedBy(SATOSHI_DIVISOR).toNumber();
  }
  return supplyBN.toNumber();
}

/**
 * Calculates the maximum amount per unit for dividend distribution
 * Divides the available dividend balance by the total asset supply
 * @param dividendBalance - The available balance of the dividend asset
 * @param assetSupply - The total supply of the asset to pay dividends on
 * @param assetIsDivisible - Whether the asset being paid dividends on is divisible
 * @returns The maximum amount per unit as a BigNumber
 * @example
 * calculateMaxDividendPerUnit("1000", "100000000", true) // Returns BigNumber(10)
 * calculateMaxDividendPerUnit("500", "100", false) // Returns BigNumber(5)
 */
export function calculateMaxDividendPerUnit(
  dividendBalance: string | number,
  assetSupply: string | number, 
  assetIsDivisible: boolean
): BigNumber {
  const normalizedSupply = normalizeAssetSupply(assetSupply, assetIsDivisible);
  
  if (normalizedSupply === 0) {
    return new BigNumber(0);
  }
  
  const balance = toBigNumber(dividendBalance);
  return balance.dividedBy(normalizedSupply);
}

// Export BigNumber for cases where direct access to constants is needed
export { BigNumber };
