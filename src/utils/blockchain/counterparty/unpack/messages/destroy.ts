/**
 * Destroy Message Unpacker
 *
 * Message ID: 110
 * Format: ">QQ" (16 bytes) + optional tag
 *   - asset_id (Q): 8 bytes - Asset to destroy
 *   - quantity (Q): 8 bytes - Quantity to destroy
 *   - tag: 0-34 bytes - Optional tag/reason
 */

import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';

/** Minimum length of destroy message (without tag) */
const DESTROY_MIN_LENGTH = 16;
/** Maximum tag length */
const MAX_TAG_LENGTH = 34;

/**
 * Unpacked destroy data
 */
export interface DestroyData {
  /** Asset name (e.g., "XCP", "PEPECASH") */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity to destroy in base units */
  quantity: bigint;
  /** Optional tag/reason */
  tag?: string;
  /** Raw tag bytes */
  tagBytes?: Uint8Array;
}

/**
 * Unpack a destroy message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked destroy data
 * @throws Error if payload is invalid
 */
export function unpackDestroy(payload: Uint8Array): DestroyData {
  if (payload.length < DESTROY_MIN_LENGTH) {
    throw new Error(`Invalid destroy payload length: ${payload.length} (minimum ${DESTROY_MIN_LENGTH})`);
  }

  const tagLength = payload.length - DESTROY_MIN_LENGTH;
  if (tagLength > MAX_TAG_LENGTH) {
    throw new Error(`Tag too long: ${tagLength} bytes (maximum ${MAX_TAG_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetId = reader.readUint64BE();
  const quantity = reader.readUint64BE();

  // Convert asset ID to name
  const asset = assetIdToName(assetId);

  const result: DestroyData = {
    asset,
    assetId,
    quantity,
  };

  // Read optional tag
  if (tagLength > 0) {
    result.tagBytes = reader.readBytes(tagLength);
    // Try to decode as UTF-8 text
    try {
      result.tag = new TextDecoder('utf-8', { fatal: true }).decode(result.tagBytes);
    } catch {
      // Not valid UTF-8, store as hex
      result.tag = Array.from(result.tagBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }

  return result;
}
