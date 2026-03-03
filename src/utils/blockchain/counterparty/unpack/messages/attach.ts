/**
 * Attach/Detach Message Unpacker
 *
 * Message ID: 100 (legacy UTXO move), 101 (Attach - move to UTXO), 102 (Detach - move to address)
 *
 * Format: Pipe-delimited string
 *   asset|quantity|destination_vout
 *
 * These operations attach or detach assets to/from specific UTXOs.
 */

/**
 * Unpacked Attach data
 */
export interface AttachData {
  /** Asset name */
  asset: string;
  /** Quantity to attach/detach */
  quantity: bigint;
  /** Destination vout (for attach) */
  destinationVout?: number;
}

/**
 * Unpacked Detach data
 */
export interface DetachData {
  /** Destination address (or "0" for default = sender's address) */
  destination: string;
}

/**
 * Unpack an Attach message (type 101).
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Attach data
 * @throws Error if payload is invalid
 */
export function unpackAttach(payload: Uint8Array): AttachData {
  if (payload.length === 0) {
    throw new Error('Empty attach payload');
  }

  try {
    const text = new TextDecoder('utf-8').decode(payload);
    const parts = text.split('|');

    if (parts.length < 2) {
      throw new Error(`Invalid attach format: expected at least 2 fields, got ${parts.length}`);
    }

    const [asset, quantityStr, destinationVoutStr] = parts;

    return {
      asset: asset || '',
      quantity: BigInt(quantityStr || '0'),
      destinationVout:
        destinationVoutStr && destinationVoutStr !== ''
          ? parseInt(destinationVoutStr, 10)
          : undefined,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Invalid attach')) {
      throw e;
    }
    throw new Error(`Failed to parse attach payload: ${e}`);
  }
}

/**
 * Unpack a Detach message (type 102).
 * Format: just a destination address, or "0" if detaching to sender's own address.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Detach data
 * @throws Error if payload is invalid
 */
export function unpackDetach(payload: Uint8Array): DetachData {
  if (payload.length === 0) {
    throw new Error('Empty detach payload');
  }

  const text = new TextDecoder('utf-8').decode(payload);
  return {
    destination: text === '0' ? '' : text,
  };
}
