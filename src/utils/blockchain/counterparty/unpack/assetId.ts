/**
 * Counterparty Asset ID Utilities
 *
 * Converts between asset IDs (numeric) and asset names (string).
 *
 * Asset naming rules:
 * - BTC: ID 0
 * - XCP: ID 1
 * - Named assets (4-12 uppercase letters): Base26 encoded (A=0, B=1, ..., Z=25)
 * - Numeric assets (A-prefixed): Direct numeric ID (e.g., "A123456789" → 123456789)
 *
 * Named assets must be 4-12 characters, uppercase A-Z only.
 * Numeric assets must be in range [26^12 + 1, 2^64 - 1].
 */

import { PROTOCOL } from './messageTypes';

/** Base26 digits for asset name encoding */
const B26_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Error thrown when asset ID/name conversion fails
 */
export class AssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetError';
  }
}

/**
 * Convert an asset name to its numeric ID.
 *
 * @param assetName - Asset name (e.g., "XCP", "PEPECASH", "A26500000000")
 * @returns Numeric asset ID as bigint
 * @throws AssetError if the name is invalid
 */
export function assetNameToId(assetName: string): bigint {
  if (!assetName || typeof assetName !== 'string') {
    throw new AssetError('Asset name is required');
  }

  // Special cases
  if (assetName === 'BTC') {
    return PROTOCOL.BTC_ID;
  }
  if (assetName === 'XCP') {
    return PROTOCOL.XCP_ID;
  }

  // Validate length
  if (assetName.length < 4) {
    throw new AssetError('Asset name too short (minimum 4 characters)');
  }

  // Check for numeric asset (A-prefixed)
  if (assetName[0] === 'A') {
    const numericPart = assetName.slice(1);

    // Must be all digits
    if (!/^\d+$/.test(numericPart)) {
      throw new AssetError('Numeric asset name must contain only digits after A');
    }

    const assetId = BigInt(numericPart);

    // Validate range
    if (assetId < PROTOCOL.MIN_NUMERIC_ASSET_ID || assetId > PROTOCOL.MAX_ASSET_ID) {
      throw new AssetError(
        `Numeric asset ID out of range: must be between ${PROTOCOL.MIN_NUMERIC_ASSET_ID} and ${PROTOCOL.MAX_ASSET_ID}`
      );
    }

    return assetId;
  }

  // Named asset - validate length (max 12 for non-numeric)
  if (assetName.length > 12) {
    throw new AssetError('Named asset too long (maximum 12 characters)');
  }

  // Convert Base26 string to integer
  let assetId = 0n;
  for (const char of assetName) {
    const digit = B26_DIGITS.indexOf(char);
    if (digit === -1) {
      throw new AssetError(`Invalid character in asset name: ${char} (must be A-Z)`);
    }
    assetId = assetId * 26n + BigInt(digit);
  }

  // Sanity check - named assets should be >= 26^3
  if (assetId < PROTOCOL.MIN_NAMED_ASSET_ID) {
    throw new AssetError('Asset ID too low for named asset');
  }

  return assetId;
}

/**
 * Convert a numeric asset ID to its name.
 *
 * @param assetId - Numeric asset ID (bigint or number)
 * @returns Asset name string
 * @throws AssetError if the ID is invalid
 */
export function assetIdToName(assetId: bigint | number): string {
  const id = typeof assetId === 'number' ? BigInt(assetId) : assetId;

  // Special cases
  if (id === PROTOCOL.BTC_ID) {
    return 'BTC';
  }
  if (id === PROTOCOL.XCP_ID) {
    return 'XCP';
  }

  // Validate minimum
  if (id < PROTOCOL.MIN_NAMED_ASSET_ID) {
    throw new AssetError(`Asset ID too low: ${id}`);
  }

  // Check if numeric asset (in numeric range)
  if (id >= PROTOCOL.MIN_NUMERIC_ASSET_ID) {
    if (id > PROTOCOL.MAX_ASSET_ID) {
      throw new AssetError(`Asset ID too high: ${id}`);
    }
    return 'A' + id.toString();
  }

  // Convert integer to Base26 string
  const chars: string[] = [];
  let remaining = id;

  while (remaining > 0n) {
    const digit = Number(remaining % 26n);
    chars.push(B26_DIGITS[digit]);
    remaining = remaining / 26n;
  }

  return chars.reverse().join('');
}

/**
 * Check if an asset name is valid.
 *
 * @param assetName - Asset name to validate
 * @returns true if valid, false otherwise
 */
export function isValidAssetName(assetName: string): boolean {
  try {
    assetNameToId(assetName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an asset is a subasset (contains a dot).
 * Subassets are in the format "PARENT.child".
 *
 * @param assetName - Asset name to check
 * @returns true if subasset, false otherwise
 */
export function isSubasset(assetName: string): boolean {
  return assetName.includes('.');
}

/**
 * Parse subasset into parent and child parts.
 *
 * @param assetName - Full subasset name (e.g., "PARENT.child")
 * @returns Object with parent and child, or null if not a subasset
 */
export function parseSubasset(assetName: string): { parent: string; child: string } | null {
  const dotIndex = assetName.indexOf('.');
  if (dotIndex === -1) {
    return null;
  }

  return {
    parent: assetName.slice(0, dotIndex),
    child: assetName.slice(dotIndex + 1),
  };
}
