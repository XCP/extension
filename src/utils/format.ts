interface AmountFormatterOptions {
  value: number | null | undefined;
  currency?: string;
  style?: 'decimal' | 'currency' | 'percent' | 'unit';
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  compact?: boolean;
  useGrouping?: boolean;
  locale?: string;
  signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
}

/**
 * Formats a numeric value according to specified options.
 * 
 * @param options - Configuration options for formatting
 * @param options.value - The numeric value to format
 * @param options.currency - The currency code (e.g., 'USD', 'EUR')
 * @param options.style - The formatting style ('decimal', 'currency', 'percent', 'unit')
 * @param options.maximumFractionDigits - Maximum number of decimal places
 * @param options.minimumFractionDigits - Minimum number of decimal places
 * @param options.compact - Whether to use compact notation (e.g., 1K, 1M)
 * @param options.useGrouping - Whether to use grouping separators (e.g., thousands)
 * @param options.locale - The locale to use for formatting
 * @param options.signDisplay - How to display the sign ('auto', 'never', 'always', 'exceptZero')
 * @returns A formatted string representation of the value
 * @example
 * formatAmount({ value: 1234.5678, maximumFractionDigits: 2 }) // returns "1,234.57"
 * formatAmount({ value: 1234.5678, currency: 'USD', style: 'currency' }) // returns "$1,234.57"
 * formatAmount({ value: 1234.5678, compact: true }) // returns "1.2K"
 */
export function formatAmount({
  value,
  currency,
  style = 'decimal',
  maximumFractionDigits,
  minimumFractionDigits,
  compact = false,
  useGrouping = true,
  locale,
  signDisplay,
}: AmountFormatterOptions): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  // Determine notation
  const notation: 'compact' | 'standard' = compact ? 'compact' : 'standard';

  // Build formatting options
  const formatOptions: Intl.NumberFormatOptions = {
    style,
    currency,
    notation,
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping,
    signDisplay,
  };

  // Remove undefined properties
  Object.keys(formatOptions).forEach(
    (key) => formatOptions[key as keyof Intl.NumberFormatOptions] === undefined && 
    delete formatOptions[key as keyof Intl.NumberFormatOptions]
  );

  // Create an Intl.NumberFormat instance
  const formatter = new Intl.NumberFormat(locale, formatOptions);

  // Format the number
  return formatter.format(value);
}

/**
 * Formats a blockchain address by optionally shortening it.
 * 
 * @param address - The full blockchain address to format
 * @param shorten - Whether to shorten the address (defaults to true)
 * @returns The formatted address. If shortened, returns first 6 and last 6 characters with '...' in between
 * @example
 * formatAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa") // returns "1A1zP1...DivfNa"
 * formatAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", false) // returns the full address
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
 * @param options.assetInfo - Optional asset info containing asset_longname
 * @param options.shorten - Whether to shorten names longer than 20 chars (defaults to false)
 * @returns The formatted asset name
 * @example
 * formatAsset("XCP") // returns "XCP"
 * formatAsset("MYLONGASSETNAME", { shorten: true }) // returns "MYLONGASSET..."
 * formatAsset("A1234", { assetInfo: { asset_longname: "My Long Asset Name" } }) // returns "My Long Asset Name"
 */
export function formatAsset(
  assetName: string,
  options?: {
    assetInfo?: { asset_longname: string | null } | null;
    shorten?: boolean;
  }
): string {
  // Handle special cases first
  if (assetName === 'XCP' || assetName === 'BTC') {
    return assetName;
  }

  // Get the display name (either longname or original name)
  const displayName = (options?.assetInfo?.asset_longname && 
    options.assetInfo.asset_longname !== "") 
    ? options.assetInfo.asset_longname 
    : assetName;

  // Shorten if requested and name is long enough
  if (options?.shorten && displayName.length > 25) {
    return `${displayName.slice(0, 25)}...`;
  }

  return displayName;
}