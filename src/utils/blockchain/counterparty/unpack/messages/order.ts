/**
 * Order Message Unpacker
 *
 * Message ID: 10
 * Format: ">QQQQHQ" (34 bytes)
 *   - give_id (Q): 8 bytes - Asset ID to give
 *   - give_quantity (Q): 8 bytes - Quantity to give
 *   - get_id (Q): 8 bytes - Asset ID to get
 *   - get_quantity (Q): 8 bytes - Quantity to get
 *   - expiration (H): 2 bytes - Blocks until expiration
 *   - fee_required (Q): 8 bytes - BTC fee required (for BTC orders)
 */

import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';

/** Expected length of order message payload */
// FORMAT = ">QQQQHQ" = 8+8+8+8+2+8 = 42 bytes
const ORDER_LENGTH = 42;

/**
 * Unpacked order data
 */
export interface OrderData {
  /** Asset to give (e.g., "XCP", "PEPECASH") */
  giveAsset: string;
  /** Asset ID to give (numeric) */
  giveAssetId: bigint;
  /** Quantity to give in base units */
  giveQuantity: bigint;
  /** Asset to get (e.g., "BTC", "XCP") */
  getAsset: string;
  /** Asset ID to get (numeric) */
  getAssetId: bigint;
  /** Quantity to get in base units */
  getQuantity: bigint;
  /** Expiration in blocks */
  expiration: number;
  /** BTC fee required (for orders involving BTC) */
  feeRequired: bigint;
}

/**
 * Unpack an order message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked order data
 * @throws Error if payload is invalid
 */
export function unpackOrder(payload: Uint8Array): OrderData {
  if (payload.length !== ORDER_LENGTH) {
    throw new Error(`Invalid order payload length: ${payload.length} (expected ${ORDER_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const giveAssetId = reader.readUint64BE();
  const giveQuantity = reader.readUint64BE();
  const getAssetId = reader.readUint64BE();
  const getQuantity = reader.readUint64BE();
  const expiration = reader.readUint16BE();
  const feeRequired = reader.readUint64BE();

  // Convert asset IDs to names
  const giveAsset = assetIdToName(giveAssetId);
  const getAsset = assetIdToName(getAssetId);

  return {
    giveAsset,
    giveAssetId,
    giveQuantity,
    getAsset,
    getAssetId,
    getQuantity,
    expiration,
    feeRequired,
  };
}
