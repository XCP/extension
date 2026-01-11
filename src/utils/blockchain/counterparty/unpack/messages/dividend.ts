/**
 * Dividend Message Unpacker
 *
 * Message ID: 50
 * Format 1: ">QQ" (16 bytes) - Legacy format
 *   - quantity_per_unit (Q): 8 bytes
 *   - asset_id (Q): 8 bytes
 *   (dividend_asset defaults to XCP)
 *
 * Format 2: ">QQQ" (24 bytes) - Modern format
 *   - quantity_per_unit (Q): 8 bytes
 *   - asset_id (Q): 8 bytes
 *   - dividend_asset_id (Q): 8 bytes
 */

import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';

/** Length of legacy dividend message */
const DIVIDEND_LENGTH_1 = 16; // 8 + 8

/** Length of modern dividend message */
const DIVIDEND_LENGTH_2 = 24; // 8 + 8 + 8

/**
 * Unpacked Dividend data
 */
export interface DividendData {
  /** Asset receiving the dividend */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity per unit of asset */
  quantityPerUnit: bigint;
  /** Asset being paid as dividend (e.g., XCP) */
  dividendAsset: string;
  /** Dividend asset ID (numeric) */
  dividendAssetId: bigint;
}

/**
 * Unpack a Dividend message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Dividend data
 * @throws Error if payload is invalid
 */
export function unpackDividend(payload: Uint8Array): DividendData {
  if (payload.length !== DIVIDEND_LENGTH_1 && payload.length !== DIVIDEND_LENGTH_2) {
    throw new Error(
      `Invalid dividend payload length: ${payload.length} (expected ${DIVIDEND_LENGTH_1} or ${DIVIDEND_LENGTH_2})`
    );
  }

  const reader = new BinaryReader(payload);

  const quantityPerUnit = reader.readUint64BE();
  const assetId = reader.readUint64BE();
  const asset = assetIdToName(assetId);

  // Check for modern format with explicit dividend asset
  let dividendAssetId: bigint;
  let dividendAsset: string;

  if (payload.length === DIVIDEND_LENGTH_2) {
    dividendAssetId = reader.readUint64BE();
    dividendAsset = assetIdToName(dividendAssetId);
  } else {
    // Legacy format - dividend asset defaults to XCP (ID = 1)
    dividendAssetId = 1n;
    dividendAsset = 'XCP';
  }

  return {
    asset,
    assetId,
    quantityPerUnit,
    dividendAsset,
    dividendAssetId,
  };
}
