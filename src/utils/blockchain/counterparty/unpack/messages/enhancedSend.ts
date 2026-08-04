/**
 * Enhanced Send Message Unpacker
 *
 * Message ID: 2
 * Legacy Format: ">QQ21s" + memo (37+ bytes)
 *   - asset_id (Q): 8 bytes - Numeric asset identifier
 *   - quantity (Q): 8 bytes - Amount in base units
 *   - destination (21s): 21 bytes - Packed destination address
 *   - memo: 0-34 bytes - Optional memo
 *
 * Modern (Taproot) Format: CBOR2 encoded array
 *   [asset_id, quantity, short_address_bytes, memo_bytes]
 *
 * The unpacker attempts CBOR2 first, then falls back to legacy format.
 */

import { PACKED_ADDRESS_LENGTH, unpackAddress } from '@/utils/blockchain/counterparty/unpack/address';
import { assetIdToName } from '@/utils/blockchain/counterparty/unpack/assetId';
import { BinaryReader, bytesToTextOrHex } from '@/utils/blockchain/counterparty/unpack/binary';
import { tryDecodeCborArray } from '@/utils/blockchain/counterparty/unpack/cbor';

/** Minimum length of legacy enhanced send (without memo) */
const MIN_LEGACY_LENGTH = 8 + 8 + 21; // 37 bytes
/** Maximum memo length */
const MAX_MEMO_LENGTH = 34;

/**
 * Unpacked enhanced send data
 */
export interface EnhancedSendData {
  /** Asset name (e.g., "XCP", "PEPECASH") */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity in base units */
  quantity: bigint;
  /** Destination Bitcoin address */
  destination: string;
  /** Optional memo (as string if text, hex if binary) */
  memo?: string;
  /** Raw memo bytes */
  memoBytes?: Uint8Array;
}

/**
 * Try to decode a CBOR-encoded enhanced send (taproot_support era).
 *
 * Format: [asset_id, quantity, short_address_bytes, memo_bytes]
 *
 * Returns null if the payload is not CBOR, so the caller falls back to legacy.
 */
function tryCbor2Decode(payload: Uint8Array): EnhancedSendData | null {
  const decoded = tryDecodeCborArray(payload, 4);
  if (!decoded) return null;

  const [assetIdValue, quantityValue, addressValue, memoValue] = decoded;
  if (typeof assetIdValue !== 'bigint' || typeof quantityValue !== 'bigint') return null;
  if (!(addressValue instanceof Uint8Array)) return null;

  if (assetIdValue === 0n) {
    throw new Error('Invalid enhanced send: BTC (asset_id 0) is not allowed');
  }

  const memoBytes = memoValue instanceof Uint8Array && memoValue.length > 0 ? memoValue : undefined;

  return {
    asset: assetIdToName(assetIdValue),
    assetId: assetIdValue,
    quantity: quantityValue,
    destination: unpackAddress(addressValue),
    memo: memoBytes ? bytesToTextOrHex(memoBytes) : undefined,
    memoBytes,
  };
}

/**
 * Unpack an enhanced send message using legacy format.
 */
function unpackLegacy(payload: Uint8Array): EnhancedSendData {
  if (payload.length < MIN_LEGACY_LENGTH) {
    throw new Error(`Invalid enhanced send payload length: ${payload.length} (minimum ${MIN_LEGACY_LENGTH})`);
  }

  const memoLength = payload.length - MIN_LEGACY_LENGTH;
  if (memoLength > MAX_MEMO_LENGTH) {
    throw new Error(`Memo too long: ${memoLength} bytes (maximum ${MAX_MEMO_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetId = reader.readUint64BE();
  const quantity = reader.readUint64BE();
  const packedAddress = reader.readBytes(PACKED_ADDRESS_LENGTH);

  let memoBytes: Uint8Array | undefined;
  let memo: string | undefined;

  if (memoLength > 0) {
    memoBytes = reader.readBytes(memoLength);
    memo = bytesToTextOrHex(memoBytes);
  }

  // Core rejects asset_id 0 (BTC) for enhanced sends; reject it here too.
  if (assetId === 0n) {
    throw new Error('Invalid enhanced send: BTC (asset_id 0) is not allowed');
  }

  // Convert asset ID to name
  const asset = assetIdToName(assetId);

  // Unpack destination address
  const destination = unpackAddress(packedAddress);

  return {
    asset,
    assetId,
    quantity,
    destination,
    memo,
    memoBytes,
  };
}

/**
 * Unpack an enhanced send message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked enhanced send data
 * @throws Error if payload is invalid
 */
export function unpackEnhancedSend(payload: Uint8Array): EnhancedSendData {
  // Try CBOR2 format first (modern Taproot-era)
  const cbor2Result = tryCbor2Decode(payload);
  if (cbor2Result) {
    return cbor2Result;
  }

  // Fall back to legacy format
  return unpackLegacy(payload);
}
