/**
 * Cancel Message Unpacker
 *
 * Message ID: 70
 * Format: ">32s" (32 bytes)
 *   - offer_hash (32s): 32 bytes - Hash of order or bet to cancel
 */

import { BinaryReader, bytesToHex } from '../binary';

/** Expected length of cancel message payload */
const CANCEL_LENGTH = 32;

/**
 * Unpacked cancel data
 */
export interface CancelData {
  /** Transaction hash of the order/bet to cancel (hex string) */
  offerHash: string;
}

/**
 * Unpack a cancel message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked cancel data
 * @throws Error if payload is invalid
 */
export function unpackCancel(payload: Uint8Array): CancelData {
  if (payload.length !== CANCEL_LENGTH) {
    throw new Error(`Invalid cancel payload length: ${payload.length} (expected ${CANCEL_LENGTH})`);
  }

  const reader = new BinaryReader(payload);
  const offerHashBytes = reader.readBytes(CANCEL_LENGTH);

  return {
    offerHash: bytesToHex(offerHashBytes),
  };
}
