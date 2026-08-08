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

// =============================================================================
// UNIT BRANDS
// =============================================================================

declare const BaseUnitsBrand: unique symbol;
declare const DisplayUnitsBrand: unique symbol;

/**
 * An integer count of an asset's smallest unit — what the protocol stores and what a signature
 * commits to. For a divisible asset this is 1e8 times the number a person would say.
 *
 * Branded so it cannot be silently swapped with {@link DisplayUnits}. The two are the same
 * JavaScript values and differ by a factor of 1e8, which made every confusion between them a
 * plausible-looking wrong number rather than a type error — a fairminter price sold for a
 * hundred-millionth of its intended value, a pool deposit shown as 150,000,000 XCP instead of 1.5.
 *
 * Values above 2^53-1 arrive as strings so no digits are lost (see core/api/losslessJson.ts),
 * which is why the underlying type is a union rather than number.
 */
export type BaseUnits = (string | number) & { readonly [BaseUnitsBrand]: true };

/** A human-facing decimal, already divided by the asset's divisibility. Never arithmetic input. */
export type DisplayUnits = string & { readonly [DisplayUnitsBrand]: true };

/**
 * Assert that a value is already in base units.
 *
 * The only way to produce a {@link BaseUnits}, so every entry point is greppable. Use it at a
 * boundary where the protocol defines the unit — an API response field, a decoded payload — never
 * to quiet a type error on a value whose unit you are unsure of.
 */
export const asBaseUnits = (value: string | number | bigint): BaseUnits =>
  (typeof value === 'bigint' ? value.toString() : value) as BaseUnits;

/** Assert that a value is already in display units. Same discipline as {@link asBaseUnits}. */
export const asDisplayUnits = (value: string): DisplayUnits => value as DisplayUnits;

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
    if (/^[-=@+]/.test(value.trim())) {
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
    const decimalPlaces = value.includes(".") ? value.split(".")[1]!.length : 0;
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
 * Converts a display quantity to the integer quantity expected by Counterparty APIs.
 * Divisible assets use satoshi-style 1e8 precision; indivisible assets are whole units.
 *
 * @param value - The display quantity
 * @param isDivisible - Whether the asset is divisible
 * @returns Integer quantity as a string
 */
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
 * Checks if a value is a finite number.
 *
 * Deliberately does NOT route through toBigNumber. That helper substitutes its default of 0 for
 * anything it cannot read — NaN, "", "abc", null, undefined — and 0 is finite, so asking it made
 * this predicate answer true for every one of them. It rejected only Infinity, which made it a
 * test for "not infinite" wearing the name of a test for "is a number".
 *
 * @param value - The value to check
 * @returns Whether the value is a number, and finite
 */
export const isFiniteNumber = (value: string | number | BigNumber | null | undefined): boolean => {
  if (value === null || value === undefined) return false;
  if (BigNumber.isBigNumber(value)) return value.isFinite();
  if (typeof value === "number") return Number.isFinite(value);

  // Strings get the same comma/space tolerance as toBigNumber, then are parsed directly: this
  // BigNumber build throws on unparseable input rather than returning NaN.
  const cleaned = value.replace(/[,\s]/g, "");
  if (cleaned === "") return false;
  try {
    return new BigNumber(cleaned).isFinite();
  } catch {
    return false;
  }
};

/**
 * Checks if a numeric value is equal to another.
 *
 * @param value - The value to compare
 * @param threshold - The threshold to compare against
 * @returns Boolean indicating if value is equal to threshold
 */
export const isEqualTo = (
  value: string | number | BigNumber | null | undefined,
  threshold: string | number | BigNumber | null | undefined
): boolean => {
  return toBigNumber(value).isEqualTo(toBigNumber(threshold));
};

/**
 * Checks if a numeric value is less than another.
 *
 * @param value - The value to compare
 * @param threshold - The threshold to compare against
 * @returns Boolean indicating if value is less than threshold
 */
export const isLessThan = (
  value: string | number | BigNumber | null | undefined,
  threshold: string | number | BigNumber | null | undefined
): boolean => {
  return toBigNumber(value).isLessThan(toBigNumber(threshold));
};

/**
 * Checks if a numeric value is greater than another.
 *
 * @param value - The value to compare
 * @param threshold - The threshold to compare against
 * @returns Boolean indicating if value is greater than threshold
 */
export const isGreaterThan = (
  value: string | number | BigNumber | null | undefined,
  threshold: string | number | BigNumber | null | undefined
): boolean => {
  return toBigNumber(value).isGreaterThan(toBigNumber(threshold));
};

/**
 * Checks if a numeric value is greater than or equal to another.
 *
 * @param value - The value to compare
 * @param threshold - The threshold to compare against
 * @returns Boolean indicating if value is greater than or equal to threshold
 */
export const isGreaterThanOrEqualTo = (
  value: string | number | BigNumber | null | undefined,
  threshold: string | number | BigNumber | null | undefined
): boolean => {
  return toBigNumber(value).isGreaterThanOrEqualTo(toBigNumber(threshold));
};

/**
 * Checks if a numeric value is less than or equal to another.
 *
 * @param value - The value to compare
 * @param threshold - The threshold to compare against
 * @returns Boolean indicating if value is less than or equal to threshold
 */
export const isLessThanOrEqualTo = (
  value: string | number | BigNumber | null | undefined,
  threshold: string | number | BigNumber | null | undefined
): boolean => {
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
 * Adds two values.
 *
 * The counterpart to subtract. Its absence was why summing reached for `+`, which is the operator
 * that turns a 64-bit quantity into a double before the addition happens.
 *
 * @param augend - The value to add to
 * @param addend - The value to add
 * @returns The sum as a BigNumber
 */
export const add = (augend: string | number | BigNumber, addend: string | number | BigNumber): BigNumber => {
  return toBigNumber(augend).plus(toBigNumber(addend));
};

/**
 * Sums a list of values, exactly.
 *
 * @param values - The values to total
 * @returns The total as a BigNumber, zero for an empty list
 */
export const sum = (values: Array<string | number | BigNumber>): BigNumber => {
  return values.reduce<BigNumber>((total, value) => total.plus(toBigNumber(value)), new BigNumber(0));
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
 * The smaller of two values.
 *
 * Exists so callers never need `BigNumber.min`, which would mean importing the constructor and
 * losing the single point through which this codebase does arithmetic.
 *
 * @param a - First value
 * @param b - Second value
 * @returns The smaller value as a BigNumber
 */
export const minimum = (
  a: string | number | BigNumber,
  b: string | number | BigNumber
): BigNumber => {
  const left = toBigNumber(a);
  return left.isLessThanOrEqualTo(toBigNumber(b)) ? left : toBigNumber(b);
};

/**
 * The larger of two values. The counterpart to minimum, and the in-layer answer to Math.max.
 *
 * @param a - First value
 * @param b - Second value
 * @returns The larger, as a BigNumber
 */
export const maximum = (
  a: string | number | BigNumber,
  b: string | number | BigNumber
): BigNumber => {
  const left = toBigNumber(a);
  return left.isGreaterThanOrEqualTo(toBigNumber(b)) ? left : toBigNumber(b);
};

/**
 * Formats a value with thousands separators, trimming to at most `decimals` places.
 *
 * Trims rather than pads: 4 renders as "4", not "4.00000000".
 *
 * @param value - The value to format
 * @param decimals - Maximum decimal places to keep (default: 8)
 * @returns Grouped string, e.g. "1,234.5"
 */
export const toGroupedString = (
  value: string | number | BigNumber,
  decimals = 8
): string => {
  return toBigNumber(value).decimalPlaces(decimals).toFormat();
};

/**
 * A finite number, or undefined when the value is not one.
 *
 * The parse that reports failure. toBigNumber substitutes zero for an unreadable value, which is
 * right when a missing figure means none and wrong when it means the source is broken — a price
 * feed returning garbage must not read as a price of zero. Use this wherever the answer to "not a
 * number" is to stop rather than to carry on with a default.
 *
 * Stricter than parseFloat, which reads "12abc" as 12; a value that is not wholly numeric is not a
 * number here.
 *
 * @param value - The value to read
 * @returns The number, or undefined when it is not finite
 */
export const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * A whole number a double can hold exactly, or undefined when the value is not one.
 *
 * The case this exists for is satoshis. Bitcoin's entire supply is 2.1e15 of them, comfortably
 * inside the 2^53 a double represents exactly, so a sat figure is one of the few money values a
 * number can carry without loss — but only while it really is an integer in that range, which this
 * checks rather than assumes. An asset quantity is not such a value and will be refused here.
 *
 * @param value - The value to read
 * @returns The number, or undefined if it is not an exactly-representable integer
 */
export const toSafeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : undefined;
  }
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
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
 * A supply in display units, exactly. Not exported: a supply is the value most likely to exceed
 * what a double holds, and the only caller divides by it.
 */
function normalizedAssetSupply(supply: string | number, isDivisible: boolean): BigNumber {
  const supplyBN = toBigNumber(supply);
  return isDivisible ? supplyBN.dividedBy(SATOSHI_DIVISOR) : supplyBN;
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
  // Dividing by the supply as a double put the error into every per-unit figure, and a dividend is
  // paid per unit across the whole supply — so it lands in the total the user is quoted.
  const normalizedSupply = normalizedAssetSupply(assetSupply, assetIsDivisible);

  if (normalizedSupply.isZero()) {
    return new BigNumber(0);
  }

  return toBigNumber(dividendBalance).dividedBy(normalizedSupply);
}

/**
 * Formats a fee rate (sats/vB) for display.
 * Shows integer for rates >= 1, two decimal places for sub-sat rates.
 *
 * @param satoshis - Total fee in satoshis
 * @param vbytes - Transaction size in virtual bytes
 * @returns Formatted fee rate string
 * @example
 * formatFeeRate(1500, 150) // "10"
 * formatFeeRate(75, 150) // "0.50"
 */
export function formatFeeRate(satoshis: number, vbytes: number): string {
  if (vbytes === 0) return '0';
  const rate = satoshis / vbytes;
  return rate >= 1 ? Math.round(rate).toString() : rate.toFixed(2);
}

/**
 * Formats a BigNumber to a string, removing trailing zeros.
 * Useful for displaying user-friendly decimal values.
 *
 * @param value - BigNumber to format
 * @param decimals - Maximum decimal places (default: 8)
 * @returns Formatted string with trailing zeros removed
 * @example
 * formatDecimal(new BigNumber("1.50000000")) // "1.5"
 * formatDecimal(new BigNumber("0.00000000")) // "0"
 */
export function formatDecimal(value: BigNumber, decimals = 8): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.?0+$/, '') || '0';
}

// Export BigNumber for cases where direct access to constants is needed
export { BigNumber };
