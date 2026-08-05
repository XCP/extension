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

import { assetIdToName } from '@/core/counterparty/unpack/assetId';
import { tryDecodeCborArray } from '@/core/counterparty/unpack/cbor';

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
 * Try to decode a CBOR-encoded fairmint (fairminter_v2).
 * Returns null if the payload is not CBOR, so the caller falls back to legacy.
 */
function tryCborDecode(payload: Uint8Array): FairmintData | null {
  const decoded = tryDecodeCborArray(payload, 2);
  if (!decoded) return null;

  const [assetIdValue, quantityValue] = decoded;
  if (typeof assetIdValue !== 'bigint' || typeof quantityValue !== 'bigint') return null;

  return {
    asset: assetIdToName(assetIdValue),
    quantity: quantityValue,
  };
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
  const cborResult = tryCborDecode(payload);
  if (cborResult) {
    return cborResult;
  }

  // Legacy format: pipe-delimited string
  try {
    const text = new TextDecoder('utf-8').decode(payload);
    const parts = text.split('|');

    // Exactly two. Core tuple-unpacks `(asset, quantity) = unpack_legacy(message)`, so a third
    // field raises there and voids the message; accepting extras showed a clean fairmint for a
    // payload the chain will not honour.
    if (parts.length !== 2) {
      throw new Error(`Invalid fairmint format: expected 2 fields, got ${parts.length}`);
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
