/**
 * Dispenser Message Unpacker
 *
 * Message ID: 12
 * Format: ">QQQQB" (33 bytes fixed, matching counterparty-core dispenser.py) + optional fields
 *   - asset_id (Q): 8 bytes - Asset to dispense
 *   - give_quantity (Q): 8 bytes - Units given per dispense
 *   - escrow_quantity (Q): 8 bytes - Total quantity in escrow
 *   - mainchainrate (Q): 8 bytes - Satoshis required per give_quantity (BEFORE status)
 *   - status (B): 1 byte - Status code
 *
 * Optional fields (appended, 21 bytes each):
 *   - action_address: present for OPEN_EMPTY_ADDRESS, or CLOSED when extra bytes exist
 *   - oracle_address: present for oracle dispensers
 *
 * Status values:
 *   0 = OPEN
 *   1 = OPEN_EMPTY_ADDRESS
 *   10 = CLOSED
 *   11 = CLOSING
 */

import { PACKED_ADDRESS_LENGTH, unpackAddress } from '@/core/counterparty/unpack/address';
import { assetIdToName } from '@/core/counterparty/unpack/assetId';
import { BinaryReader } from '@/core/counterparty/unpack/binary';
import { DispenserStatus } from '@/core/counterparty/unpack/messageTypes';

/** Fixed length of the dispenser struct (">QQQQB"), matching core's LENGTH=33. */
const DISPENSER_LENGTH = 33; // 4 x Q (8 bytes) + 1 x B (1 byte)

/**
 * Unpacked dispenser data
 */
export interface DispenserData {
  /** Asset name (e.g., "XCP", "PEPECASH") */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity given per dispense */
  giveQuantity: bigint;
  /** Total quantity in escrow */
  escrowQuantity: bigint;
  /** Satoshis required per give_quantity */
  mainchainrate: bigint;
  /** Status code */
  status: number;
  /** Status name */
  statusName: string;
  /** Action address (for OPEN_EMPTY_ADDRESS or CLOSING) */
  openAddress?: string;
  /** Oracle address (for oracle dispensers) */
  oracleAddress?: string;
}

/**
 * Get human-readable status name
 */
function getStatusName(status: number): string {
  switch (status) {
    case DispenserStatus.OPEN:
      return 'open';
    case DispenserStatus.OPEN_EMPTY_ADDRESS:
      return 'open_empty_address';
    case DispenserStatus.CLOSED:
      return 'closed';
    case DispenserStatus.CLOSING:
      return 'closing';
    default:
      return `unknown_${status}`;
  }
}

/**
 * Unpack a dispenser message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked dispenser data
 * @throws Error if payload is invalid
 */
export function unpackDispenser(payload: Uint8Array): DispenserData {
  if (payload.length < DISPENSER_LENGTH) {
    throw new Error(`Invalid dispenser payload length: ${payload.length} (minimum ${DISPENSER_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  // Fixed-layout ">QQQQB": mainchainrate precedes status and is mandatory.
  const assetId = reader.readUint64BE();
  const giveQuantity = reader.readUint64BE();
  const escrowQuantity = reader.readUint64BE();
  const mainchainrate = reader.readUint64BE();
  const status = reader.readUint8();

  // Convert asset ID to name
  const asset = assetIdToName(assetId);

  const result: DispenserData = {
    asset,
    assetId,
    giveQuantity,
    escrowQuantity,
    mainchainrate,
    status,
    statusName: getStatusName(status),
  };

  // action_address: core reads it whenever the status calls for one, without first checking that
  // 21 bytes are there — a short slice raises and the whole message becomes
  // "invalid: could not unpack". `dispenser_origin_permission_extended` is long active and
  // protocol activations are permanent, so the CLOSED case is simply on.
  //
  // Gating these reads on `remaining >= 21` instead, as this did, silently dropped trailing bytes
  // core rejects: a dispenser with a few stray bytes rendered as clean here and is void on chain.
  const expectsActionAddress =
    status === DispenserStatus.OPEN_EMPTY_ADDRESS ||
    (status === DispenserStatus.CLOSED && reader.remaining > 0);

  if (expectsActionAddress) {
    if (reader.remaining < PACKED_ADDRESS_LENGTH) {
      throw new Error(
        `Dispenser action address truncated: ${reader.remaining} bytes, expected ${PACKED_ADDRESS_LENGTH}`
      );
    }
    result.openAddress = unpackAddress(reader.readBytes(PACKED_ADDRESS_LENGTH));
  }

  // oracle_address: any remaining bytes must be a whole address, for the same reason.
  if (reader.remaining > 0) {
    if (reader.remaining < PACKED_ADDRESS_LENGTH) {
      throw new Error(
        `Dispenser oracle address truncated: ${reader.remaining} bytes, expected ${PACKED_ADDRESS_LENGTH}`
      );
    }
    result.oracleAddress = unpackAddress(reader.readBytes(PACKED_ADDRESS_LENGTH));
  }

  return result;
}
