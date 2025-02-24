/**
 * Options for formatting numeric amounts.
 */
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
