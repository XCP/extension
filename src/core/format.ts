/**
 * Formatting utilities for numbers, addresses, assets, and prices.
 */

import { type DecimalPlaces, parseAmountDraft } from '@/core/amount-contract/amounts';
import { CURRENCY_INFO, type FiatCurrency } from '@/core/bitcoin/price';
import { type BigNumber, fromSatoshis, toSatoshis } from '@/core/numeric';
import { currentNumberLocale, t } from '@/i18n';

/** Display follows interface language unless the user saved a number-format override. */
export function displayLocale(): string {
  return currentNumberLocale();
}

export interface AmountFormatterOptions {
  /**
   * The amount to render. Pass the string a quantity arrived as, rather than converting it.
   *
   * `Intl.NumberFormat` formats a decimal string exactly, and a `number` only as precisely as a
   * double allows — a 64-bit quantity is already rounded by the time it gets here. PEPECASH's
   * supply renders as 995,269,258.11111111 from the string and 995,269,258.1111112 from the number.
   */
  value: string | number | BigNumber | null | undefined;
  currency?: string;
  style?: "decimal" | "currency" | "percent" | "unit";
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  compact?: boolean;
  useGrouping?: boolean;
  locale?: string;
  signDisplay?: "auto" | "never" | "always" | "exceptZero";
}

/**
 * Formats a numeric value according to specified options.
 *
 * @param options - Configuration options for formatting
 * @returns A formatted string representation of the value
 * @example
 * formatAmount({ value: 1234.5678, maximumFractionDigits: 2 }) // "1,234.57"
 * formatAmount({ value: "995269258.11111111" }) // "995,269,258.11111111"
 */
export function formatAmount({
  value,
  currency,
  style = "decimal",
  maximumFractionDigits,
  minimumFractionDigits,
  compact = false,
  useGrouping = true,
  locale = displayLocale(),
  signDisplay,
}: AmountFormatterOptions): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "number" && Number.isNaN(value)) return "N/A";
  // A string that is not a number at all would reach Intl as NaN and render as "NaN".
  if (typeof value === "string" && (value.trim() === "" || Number.isNaN(Number(value)))) return "N/A";

  const notation: "compact" | "standard" = compact ? "compact" : "standard";
  const formatOptions: Intl.NumberFormatOptions = {
    style,
    currency,
    notation,
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping,
    signDisplay,
  };

  Object.keys(formatOptions).forEach((key) => {
    const k = key as keyof Intl.NumberFormatOptions;
    if (formatOptions[k] === undefined) delete formatOptions[k];
  });

  // `toFixed` rather than `toString`, which switches to exponent notation at the extremes.
  const exact = typeof value === "number" || typeof value === "string"
    ? value
    : value.toFixed();

  // Intl.NumberFormat V3 (Chrome 106+, Firefox 116+) formats a decimal string exactly. The bundled
  // lib types still describe the older signature, so the correction belongs on that signature
  // rather than on the value — the value is genuinely a string, and casting it would say otherwise.
  const format = new Intl.NumberFormat(locale, formatOptions).format as (
    input: string | number
  ) => string;

  return format(exact);
}

/** Exact formatting for a validated/generated amount; this never repairs a draft. */
export function formatForInput(value: AmountFormatterOptions['value'], decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) throw new RangeError('Invalid amount precision');
  if (value === null || value === undefined) throw new Error('Amount is missing');
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount must be exact and finite');
  }
  const text = typeof value === 'object' ? value.toFixed() : String(value);
  const parsed = parseAmountDraft(text, { decimals: decimals as DecimalPlaces });
  if (parsed.status !== 'valid') throw new Error('Amount is not an exact canonical decimal');
  return parsed.canonical;
}

/** Complete amounts only. Invalid/incomplete drafts stay in the field. */
export function isComposableAmount(value: string, decimals: number): boolean {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) return false;
  return parseAmountDraft(value, { decimals: decimals as DecimalPlaces }).status === 'valid';
}

/**
 * A Counterparty amount written in full, for a figure someone is agreeing to.
 *
 * Three roles, and the whole rule is knowing which one you are in:
 *
 *   1. A number bound for a transaction: formatForInput. No language, no
 *      grouping, exact. The composer reads it back.
 *   2. A number someone must CHECK: this one. Grouped and in their language
 *      so it can be read, but never abbreviated and never rounded, because
 *      the point is to compare it digit for digit against what will be
 *      signed. Approval screens, confirmations, the balance a send comes
 *      out of.
 *   3. A number someone merely GLANCES at: formatAmount({ compact: true }).
 *      123.2k XCP is better there, and losing precision is the feature.
 *
 * The line between 2 and 3 is not taste. Abbreviation is forbidden wherever
 * the figure is the thing being authorized: "123.2k XCP" cannot be checked
 * against a transaction, and a screen asking for a signature has to show the
 * number that is being signed.
 *
 * Divisibility decides the shape. An indivisible asset has no fractional
 * part and never shows one; a divisible asset shows all eight places,
 * padded, so the precision is visible and two amounts line up under each
 * other.
 */
export function formatAmountExact(
  value: AmountFormatterOptions['value'],
  options: { divisible?: boolean } = {},
): string {
  const decimals = options.divisible === false ? 0 : 8;
  return formatAmount({
    value,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    compact: false,
  });
}

/**
 * Formats a blockchain address by optionally shortening it.
 *
 * @param address - The full blockchain address to format
 * @param shorten - Whether to shorten the address (defaults to true)
 * @returns The formatted address
 * @example
 * formatAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa") // "1A1zP1...DivfNa"
 */
export function formatAddress(address: string | null | undefined, shorten: boolean = true): string {
  if (address == null) return "Unknown";
  if (!shorten) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

/**
 * Formats an asset name, handling special cases and optional shortening.
 *
 * @param assetName - The name of the asset to format
 * @param options - Optional configuration
 * @returns The formatted asset name
 * @example
 * formatAsset("XCP") // "XCP"
 * formatAsset("MYLONGASSETNAME", { shorten: true }) // "MYLONGASSET..."
 */
/**
 * An asset query as the API wants it: named assets uppercased, subassets left alone.
 *
 * Named assets are uppercase by charset, so uppercasing a partial or sloppy query is a
 * convenience. A subasset longname is case-sensitive — its child part draws on a 68-character
 * set with both cases — so the same convenience destroys it: PARENT.child uppercased names a
 * different (usually nonexistent) asset, and the market search failed even on a fully typed,
 * fully correct longname. The dot decides which rule applies; it is not a legal character in a
 * named asset.
 */
export function normalizeAssetQuery(query: string): string {
  const trimmed = query.trim();
  return trimmed.includes(".") ? trimmed : trimmed.toUpperCase();
}

export function formatAsset(
  assetName: string,
  options?: {
    assetInfo?: { asset_longname: string | null } | null;
    shorten?: boolean;
  }
): string {
  if (assetName === "XCP" || assetName === "BTC") return assetName;

  const displayName =
    options?.assetInfo?.asset_longname && options.assetInfo.asset_longname !== ""
      ? options.assetInfo.asset_longname
      : assetName;

  if (options?.shorten && displayName.length > 25) {
    return `${displayName.slice(0, 25)}...`;
  }

  return displayName;
}

/**
 * Formats a transaction ID (txid) by shortening it for display.
 *
 * @param txid - The full transaction ID to format
 * @param shorten - Whether to shorten the txid (defaults to true)
 * @returns The formatted transaction ID
 * @example
 * formatTxid("3b1f8c6a7d9e5f2a8c4e6b0d3f7a9c1e5b8d2f6a") // "3b1f8c...8d2f6a"
 */
export function formatTxid(txid: string, shorten: boolean = true): string {
  if (!shorten) return txid;
  // Show more characters for txids since they're typically longer and more unique
  return `${txid.slice(0, 8)}...${txid.slice(-6)}`;
}

/**
 * Formats a Unix timestamp into a human-readable date string.
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string
 * @example
 * formatDate(1698777600) // "10/31/2023, 8:00:00 PM" (depending on locale)
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(displayLocale());
}

/**
 * Formats a Unix timestamp as a relative "time ago" string.
 *
 * @param timestamp - Unix timestamp in seconds
 * @param compact - If true, returns short format (e.g., "2m ago" instead of "2 minutes ago")
 * @returns Relative time string (e.g., "2 hours ago", "3 days ago")
 * @example
 * formatTimeAgo(1698777600) // "2 hours ago"
 * formatTimeAgo(1698777600, true) // "2h ago"
 */
export function formatTimeAgo(timestamp: number, compact: boolean = false): string {
  const now = Date.now();
  const then = timestamp * 1000; // Convert to milliseconds
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const n = (value: number) => formatAmount({ value, maximumFractionDigits: 0 });

  if (compact) {
    if (seconds < 60) return t('time_just_now');
    if (minutes < 60) return t('time_compact_minutes', n(minutes));
    if (hours < 24) return t('time_compact_hours', n(hours));
    if (days < 7) return t('time_compact_days', n(days));
    if (weeks < 52) return t('time_compact_weeks', n(weeks));
    return t('time_compact_years', n(years));
  }

  if (seconds < 60) {
    return seconds === 1 ? t('time_second_ago') : t('time_seconds_ago', n(seconds));
  } else if (minutes < 60) {
    return minutes === 1 ? t('time_minute_ago') : t('time_minutes_ago', n(minutes));
  } else if (hours < 24) {
    return hours === 1 ? t('time_hour_ago') : t('time_hours_ago', n(hours));
  } else if (days < 7) {
    return days === 1 ? t('time_day_ago') : t('time_days_ago', n(days));
  } else if (weeks < 4) {
    return weeks === 1 ? t('time_week_ago') : t('time_weeks_ago', n(weeks));
  } else if (months < 12) {
    return months === 1 ? t('time_month_ago') : t('time_months_ago', n(months));
  } else {
    return years === 1 ? t('time_year_ago') : t('time_years_ago', n(years));
  }
}

/**
 * Formats a date object for local display with readable format
 * Used primarily for displaying deadlines and timestamps in a user-friendly way
 * @param date - The date object to format  
 * @returns A formatted date string (e.g., "Nov 15, 2023, 02:30 PM")
 * @example
 * formatDateToLocal(new Date(2023, 10, 15, 14, 30)) // "Nov 15, 2023, 02:30 PM"
 */
export function formatDateToLocal(date: Date): string {
  return date.toLocaleString(displayLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a Bitcoin fee amount for display
 * @param satoshis - The fee amount in satoshis
 * @returns A formatted string with appropriate units (sats, k sats, or BTC)
 */
export function formatFee(satoshis: number): string {
  if (satoshis < 1000) {
    return `${formatAmount({ value: satoshis, maximumFractionDigits: 0 })} sats`;
  } else if (satoshis < 100000) {
    return `${formatAmount({ value: satoshis / 1000, minimumFractionDigits: 1, maximumFractionDigits: 1 })}k sats`;
  } else {
    const btc = fromSatoshis(satoshis, true);
    return `${formatAmount({
      value: btc,
      minimumFractionDigits: 6,
      maximumFractionDigits: 6
    })} BTC`;
  }
}

/**
 * Formats a Counterparty more_outputs parameter as "<sats>:<address>".
 */
export function formatMoreOutputs(amount: string, destination: string): string | undefined {
  if (!amount || !destination) return undefined;

  const sats = toSatoshis(amount);
  return Number(sats) > 0 ? `${sats}:${destination}` : undefined;
}

/**
 * Parses a Counterparty more_outputs parameter for display.
 */
export function parseMoreOutputs(value?: string): { sats: string; btc: string; destination: string } | null {
  if (!value) return null;

  const [sats, destination] = value.split(":");
  if (!sats || !destination) return null;

  return {
    sats,
    btc: fromSatoshis(sats, { removeTrailingZeros: true }),
    destination,
  };
}

/**
 * Formats an asset quantity for display.
 * Handles both divisible and non-divisible assets consistently.
 * 
 * @param quantity - The quantity in satoshis (for divisible) or whole units (for non-divisible)
 * @param isDivisible - Whether the asset is divisible (8 decimal places)
 * @param showDecimals - Whether to show decimal places for divisible assets
 * @returns Formatted quantity string
 */
export function formatAssetQuantity(
  quantity: string | number,
  isDivisible: boolean,
  showDecimals: boolean = true
): string {
  if (!isDivisible) {
    // Whole units, but still grouped: 995269258 is not a number anyone reads.
    return formatAmount({ value: quantity, maximumFractionDigits: 0 });
  }

  // Divisible assets - convert from satoshis and format
  const value = fromSatoshis(quantity, { asNumber: true });
  
  return formatAmount({
    value,
    minimumFractionDigits: showDecimals ? 8 : 0,
    maximumFractionDigits: 8,
  });
}

/**
 * Formats a price ratio for order review screens.
 * Handles division by zero and flipped price display.
 * 
 * @param giveQuantity - Quantity being given
 * @param getQuantity - Quantity being received
 * @param giveAsset - Asset being given
 * @param getAsset - Asset being received
 * @param isFlipped - Whether to show flipped price (1 GET = X GIVE)
 * @returns Formatted price string
 */
export function formatPriceRatio(
  giveQuantity: string | number,
  getQuantity: string | number,
  giveAsset: string,
  getAsset: string,
  isFlipped: boolean = false
): string {
  const give = Number(giveQuantity);
  const get = Number(getQuantity);

  // Handle division by zero
  if (give === 0 || get === 0) {
    return "Invalid price";
  }

  if (isFlipped) {
    const ratio = give / get;
    return `1 ${getAsset} = ${formatAmount({
      value: ratio,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    })} ${giveAsset}`;
  } else {
    const ratio = get / give;
    return `1 ${giveAsset} = ${formatAmount({
      value: ratio,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    })} ${getAsset}`;
  }
}

/**
 * Formats a value in the user's preferred fiat currency.
 * Uses the currency's symbol and appropriate decimal places.
 *
 * @param value - The fiat value to format
 * @param currency - The fiat currency code
 * @returns Formatted price string (e.g., "$1,234.56" or "¥1,235")
 * @example
 * formatFiatPrice(1234.56, 'usd') // "$1,234.56"
 * formatFiatPrice(1234.56, 'jpy') // "¥1,235"
 */
export function formatFiatPrice(value: number, currency: FiatCurrency): string {
  const { symbol, decimals } = CURRENCY_INFO[currency];
  return `${symbol}${formatAmount({ value, maximumFractionDigits: decimals })}`;
}

/**
 * Converts satoshis to a fiat value.
 *
 * @param sats - Amount in satoshis
 * @param btcPrice - Current BTC price in fiat
 * @returns Fiat value
 */
export function satsToFiat(sats: number, btcPrice: number): number {
  const SATS_PER_BTC = 100_000_000;
  return (sats / SATS_PER_BTC) * btcPrice;
}
