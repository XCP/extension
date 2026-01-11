/**
 * Send (v1) Message Unpacker
 *
 * Message ID: 0
 * Format: ">QQ" (16 bytes)
 *   - asset_id (Q): 8 bytes - Numeric asset identifier
 *   - quantity (Q): 8 bytes - Amount in base units
 *
 * Note: Legacy send does not include destination in the message;
 * the destination is the first non-OP_RETURN output address.
 */

import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';

/** Expected length of send message payload */
const SEND_LENGTH = 16;

/**
 * Unpacked send data
 */
export interface SendData {
  /** Asset name (e.g., "XCP", "PEPECASH") */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity in base units */
  quantity: bigint;
}

/**
 * Unpack a send (v1) message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked send data
 * @throws Error if payload is invalid
 */
export function unpackSend(payload: Uint8Array): SendData {
  if (payload.length !== SEND_LENGTH) {
    throw new Error(`Invalid send payload length: ${payload.length} (expected ${SEND_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetId = reader.readUint64BE();
  const quantity = reader.readUint64BE();

  // Convert asset ID to name
  const asset = assetIdToName(assetId);

  return {
    asset,
    assetId,
    quantity,
  };
}
