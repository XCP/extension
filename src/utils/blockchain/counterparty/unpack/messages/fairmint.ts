/**
 * Fairmint Message Unpacker
 *
 * Message ID: 91
 *
 * Modern format (fairminter_v2): CBOR encoded array:
 *   [asset_id, quantity]
 *
 * Legacy format: Pipe-delimited string
 *   asset|quantity
 */

import { assetIdToName } from '../assetId';

/**
 * Unpacked Fairmint data
 */
export interface FairmintData {
  /** Asset name being minted */
  asset: string;
  /** Quantity to mint */
  quantity: bigint;
}

/**
 * Try to decode CBOR array (basic implementation for fairmint)
 */
function tryDecodeCBORFairmint(payload: Uint8Array): FairmintData | null {
  try {
    // Check for CBOR array marker (0x82 = 2-element array)
    if (payload[0] !== 0x82) {
      return null;
    }

    // Simple CBOR parsing for 2-element array with integers
    let pos = 1;

    // Parse asset_id (positive integer)
    const assetIdResult = parseCBORInt(payload, pos);
    if (!assetIdResult) return null;
    const [assetId, newPos1] = assetIdResult;
    pos = newPos1;

    // Parse quantity (positive integer)
    const quantityResult = parseCBORInt(payload, pos);
    if (!quantityResult) return null;
    const [quantity] = quantityResult;

    return {
      asset: assetIdToName(assetId),
      quantity,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a CBOR positive integer starting at position
 * Returns [value, newPosition] or null if failed
 */
function parseCBORInt(data: Uint8Array, pos: number): [bigint, number] | null {
  if (pos >= data.length) return null;

  const firstByte = data[pos];

  // Major type 0: positive integer
  if ((firstByte & 0xe0) !== 0x00) return null;

  const additionalInfo = firstByte & 0x1f;

  if (additionalInfo < 24) {
    // Direct value
    return [BigInt(additionalInfo), pos + 1];
  } else if (additionalInfo === 24) {
    // 1-byte value
    if (pos + 1 >= data.length) return null;
    return [BigInt(data[pos + 1]), pos + 2];
  } else if (additionalInfo === 25) {
    // 2-byte value
    if (pos + 2 >= data.length) return null;
    const value = (data[pos + 1] << 8) | data[pos + 2];
    return [BigInt(value), pos + 3];
  } else if (additionalInfo === 26) {
    // 4-byte value
    if (pos + 4 >= data.length) return null;
    const value =
      (data[pos + 1] << 24) | (data[pos + 2] << 16) | (data[pos + 3] << 8) | data[pos + 4];
    return [BigInt(value >>> 0), pos + 5];
  } else if (additionalInfo === 27) {
    // 8-byte value
    if (pos + 8 >= data.length) return null;
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(data[pos + 1 + i]);
    }
    return [value, pos + 9];
  }

  return null;
}

/**
 * Unpack a Fairmint message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Fairmint data
 * @throws Error if payload is invalid
 */
export function unpackFairmint(payload: Uint8Array): FairmintData {
  if (payload.length === 0) {
    throw new Error('Empty fairmint payload');
  }

  // Try CBOR first (modern format)
  const cborResult = tryDecodeCBORFairmint(payload);
  if (cborResult) {
    return cborResult;
  }

  // Legacy format: pipe-delimited string
  try {
    const text = new TextDecoder('utf-8').decode(payload);
    const parts = text.split('|');

    if (parts.length < 2) {
      throw new Error(`Invalid fairmint format: expected at least 2 fields, got ${parts.length}`);
    }

    const [asset, quantityStr] = parts;

    return {
      asset: asset || '',
      quantity: BigInt(quantityStr || '0'),
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Invalid fairmint')) {
      throw e;
    }
    throw new Error(`Failed to parse fairmint payload: ${e}`);
  }
}
