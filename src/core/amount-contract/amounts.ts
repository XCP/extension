/**
 * Canonical transaction amounts. This module has no runtime dependencies.
 * Keep the editable draft in the UI; only a `valid` result carries a raw value.
 * Locale formatting, keyboard adapters and intentional rounding live elsewhere.
 */
export const AMOUNT_CONTRACT_VERSION = 1;
export const COUNTERPARTY_MAX_INT = 9_223_372_036_854_775_807n;
export type DecimalPlaces = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ExactInteger = string | number | bigint;
export type AmountDraftErrorCode = "amount_syntax" | "amount_precision" | "amount_range" | "amount_too_long";
export type AmountErrorCode = AmountDraftErrorCode | "amount_unsafe_number" | "amount_nonfinite";

export class AmountValidationError extends Error {
  readonly code: AmountErrorCode;
  constructor(code: AmountErrorCode) {
    super(code);
    this.name = "AmountValidationError";
    this.code = code;
  }
}

export type AmountDraftResult =
  | { status: "empty" | "incomplete"; draft: string }
  | { status: "invalid"; draft: string; code: AmountDraftErrorCode }
  | { status: "valid"; draft: string; canonical: string; raw: bigint };

export interface AmountDraftOptions {
  /** Explicit: unknown asset divisibility must never default to eight places. */
  decimals: DecimalPlaces;
  minRaw?: bigint;
  maxRaw?: bigint;
  /** Validate length, never truncate it. Defaults to 128 characters. */
  maxLength?: number;
}

export interface IntegerBounds {
  min?: bigint;
  max?: bigint;
}

function checkDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
    throw new RangeError("decimals must be an explicit integer from 0 to 8");
  }
}

function bounds(options: IntegerBounds): { min: bigint; max: bigint } {
  const min = options.min ?? 0n;
  const max = options.max ?? COUNTERPARTY_MAX_INT;
  if (typeof min !== "bigint" || typeof max !== "bigint" || min > max) {
    throw new RangeError("invalid integer bounds");
  }
  return { min, max };
}

/** Strict raw integer, with no whitespace, signs, grouping or float coercion. */
export function parseRawInteger(value: ExactInteger, options: IntegerBounds = {}): bigint {
  const { min, max } = bounds(options);
  let raw: bigint;
  if (typeof value === "bigint") raw = value;
  else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AmountValidationError("amount_nonfinite");
    if (!Number.isSafeInteger(value)) throw new AmountValidationError("amount_unsafe_number");
    raw = BigInt(value);
  } else {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new AmountValidationError("amount_syntax");
    }
    // Bound work before converting an untrusted string to BigInt. Leading
    // zeros do not increase its magnitude, but are still subject to this cap.
    if (value.length > 128) throw new AmountValidationError("amount_too_long");
    raw = BigInt(value);
  }
  if (raw < min || raw > max) throw new AmountValidationError("amount_range");
  return raw;
}

export function serializeRawInteger(value: ExactInteger, options: IntegerBounds = {}): string {
  return parseRawInteger(value, options).toString();
}

/** Exact raw-to-input conversion. Significant integer zeros are never removed. */
export function rawToInput(value: ExactInteger, decimals: DecimalPlaces): string {
  checkDecimals(decimals);
  const raw = parseRawInteger(value);
  return formatRaw(raw, decimals);
}

function formatRaw(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const digits = raw.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function parseAmountDraft(draft: string, options: AmountDraftOptions): AmountDraftResult {
  checkDecimals(options.decimals);
  const { min, max } = bounds({ min: options.minRaw, max: options.maxRaw });
  const maxLength = options.maxLength ?? 128;
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) throw new RangeError("invalid maxLength");
  if (draft.length > maxLength) return { status: "invalid", draft, code: "amount_too_long" };
  if (draft === "") return { status: "empty", draft };
  if (!/^\d*(?:\.\d*)?$/.test(draft)) return { status: "invalid", draft, code: "amount_syntax" };
  const [whole = "", fraction] = draft.split(".");
  if (fraction !== undefined && (options.decimals === 0 || fraction.length > options.decimals)) {
    return { status: "invalid", draft, code: "amount_precision" };
  }
  if (fraction === "") return { status: "incomplete", draft };
  const raw = BigInt(`${whole || "0"}${(fraction ?? "").padEnd(options.decimals, "0")}`);
  if (raw < min || raw > max) return { status: "invalid", draft, code: "amount_range" };
  return { status: "valid", draft, canonical: formatRaw(raw, options.decimals), raw };
}

export interface DecimalBounds {
  min?: number;
  max?: number;
  maxExclusive?: boolean;
  maxDecimals?: number;
}

/** Expand a finite number's shortest representation without exponent notation. */
function plainNumber(value: number): string {
  const text = value.toString();
  if (!/[eE]/.test(text)) return text;
  const [coefficient, exponentText] = text.toLowerCase().split("e");
  const negative = coefficient!.startsWith("-");
  const unsigned = negative ? coefficient!.slice(1) : coefficient!;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`;
  const point = whole!.length + Number(exponentText);
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${"0".repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${expanded}` : expanded;
}

/**
 * Finite Core decimal field (sat/vB, commission, broadcast value). No raw-unit
 * scaling. Strings must already be canonical; a number may use its own shortest
 * decimal representation. Quantity fields must use serializeRawInteger instead.
 */
export function serializeDecimal(value: ExactInteger, options: DecimalBounds = {}): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new AmountValidationError("amount_nonfinite");
  }
  const text = typeof value === "number" ? plainNumber(value) : String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new AmountValidationError("amount_syntax");
  if (text.length > 512) throw new AmountValidationError("amount_too_long");
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || (numeric === 0 && /[1-9]/.test(text))) {
    throw new AmountValidationError("amount_nonfinite");
  }
  const decimals = text.split(".")[1]?.length ?? 0;
  if (options.maxDecimals !== undefined && decimals > options.maxDecimals) {
    throw new AmountValidationError("amount_precision");
  }
  if (
    (options.min !== undefined && numeric < options.min) ||
    (options.max !== undefined && (options.maxExclusive ? numeric >= options.max : numeric > options.max))
  )
    throw new AmountValidationError("amount_range");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const normalizedWhole = whole!.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  const sign = negative && numeric !== 0 ? "-" : "";
  return `${sign}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}
