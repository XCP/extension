/**
 * BTCPay Message Unpacker
 *
 * Message ID: 11
 * Format: ">32s32s" (64 bytes total)
 *   - tx0_hash (32s): 32 bytes - First order transaction hash
 *   - tx1_hash (32s): 32 bytes - Second order transaction hash
 *
 * This message represents a BTC payment for a DEX order match.
 * The order_match_id is formed as: tx0_hash_tx1_hash
 */

import { BinaryReader } from '../binary';

/** Length of BTCPay message payload */
const BTCPAY_LENGTH = 64; // 32 + 32

/**
 * Unpacked BTCPay data
 */
export interface BTCPayData {
  /** First order transaction hash (hex) */
  tx0Hash: string;
  /** Second order transaction hash (hex) */
  tx1Hash: string;
  /** Combined order match ID (tx0_hash_tx1_hash) */
  orderMatchId: string;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Unpack a BTCPay message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked BTCPay data
 * @throws Error if payload is invalid
 */
export function unpackBTCPay(payload: Uint8Array): BTCPayData {
  if (payload.length !== BTCPAY_LENGTH) {
    throw new Error(`Invalid BTCPay payload length: ${payload.length} (expected ${BTCPAY_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const tx0HashBytes = reader.readBytes(32);
  const tx1HashBytes = reader.readBytes(32);

  const tx0Hash = bytesToHex(tx0HashBytes);
  const tx1Hash = bytesToHex(tx1HashBytes);
  const orderMatchId = `${tx0Hash}_${tx1Hash}`;

  return {
    tx0Hash,
    tx1Hash,
    orderMatchId,
  };
}
