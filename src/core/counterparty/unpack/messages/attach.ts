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
/**
 * Unpacked move data (type 100): assets moved from one UTXO to another.
 */
export interface MoveData {
  /** Source UTXO the assets are held by, as "txid:vout". */
  source: string;
  /** Destination — a UTXO or an address. */
  destination: string;
  /** Asset name */
  asset: string;
  /** Quantity moved */
  quantity: bigint;
}

/**
 * Unpack a move message (type 100).
 * Format: `source|destination|asset|quantity`, UTF-8 (core `utxo.py`).
 *
 * This is a different field list from attach, which carries `asset|quantity|vout`. Routing type 100
 * through the attach unpacker read the destination address as the quantity, so `BigInt` threw and
 * every move failed to decode — which, since an undecodable message is treated as unverifiable,
 * blocked the transaction outright.
 */
export function unpackMove(payload: Uint8Array): MoveData {
  if (payload.length === 0) {
    throw new Error('Empty move payload');
  }

  const parts = new TextDecoder('utf-8').decode(payload).split('|');
  if (parts.length < 4) {
    throw new Error(`Invalid move format: expected 4 fields, got ${parts.length}`);
  }

  const [source, destination, asset, quantityStr] = parts;
  if (!/^\d+$/.test((quantityStr ?? '').trim())) {
    throw new Error('Invalid move quantity');
  }

  return {
    source: source ?? '',
    destination: destination ?? '',
    asset: asset ?? '',
    quantity: BigInt(quantityStr!.trim()),
  };
}

export function unpackAttach(payload: Uint8Array): AttachData {
  if (payload.length === 0) {
    throw new Error('Empty attach payload');
  }

  try {
    const text = new TextDecoder('utf-8').decode(payload);
    const parts = text.split('|');

    // Exactly three. Core tuple-unpacks `(asset, quantity, destination_vout) = data_content`,
    // so any other count raises there and voids the message; accepting extras showed a clean
    // attach for a payload the chain will not honour.
    if (parts.length !== 3) {
      throw new Error(`Invalid attach format: expected 3 fields, got ${parts.length}`);
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
