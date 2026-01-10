/**
 * Formatting utilities for numbers, addresses, assets, and prices.
 */
import { fromSatoshis } from './numeric';
import { CURRENCY_INFO, type FiatCurrency } from '@/utils/blockchain/bitcoin/price';

export interface AmountFormatterOptions {
  value: number | null | undefined;
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
 * formatAmount({ value: 1234.5678, currency: "USD", style: "currency" }) // "$1,234.57"
 */
export function formatAmount({
  value,
  currency,
  style = "decimal",
  maximumFractionDigits,
  minimumFractionDigits,
  compact = false,
  useGrouping = true,
  locale,
  signDisplay,
}: AmountFormatterOptions): string {
  if (value === null || value === undefined) return "N/A";

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

  Object.keys(formatOptions).forEach(
    (key) =>
      formatOptions[key as keyof Intl.NumberFormatOptions] === undefined &&
      delete formatOptions[key as keyof Intl.NumberFormatOptions]
  );

  return new Intl.NumberFormat(locale, formatOptions).format(value);
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
export function formatAddress(address: string, shorten: boolean = true): string {
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
  return new Date(timestamp * 1000).toLocaleString();
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

  if (compact) {
    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 52) return `${weeks}w ago`;
    return `${years}y ago`;
  }

  if (seconds < 60) {
    return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`;
  } else if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  } else if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  } else if (days < 7) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  } else if (weeks < 4) {
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    return years === 1 ? '1 year ago' : `${years} years ago`;
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
  return date.toLocaleString('en-US', {
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
    return `${satoshis} sats`;
  } else if (satoshis < 100000) {
    return `${(satoshis / 1000).toFixed(1)}k sats`;
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
    // Non-divisible assets - just show the integer
    return quantity.toString();
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
