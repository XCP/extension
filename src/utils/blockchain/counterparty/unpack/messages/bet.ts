/**
 * Bet Message Unpacker
 *
 * Message ID: 40
 * Format: ">HIQQdII" (38 bytes)
 *   - bet_type (H): 2 bytes — 0 BullCFD, 1 BearCFD, 2 Equal, 3 NotEqual
 *   - deadline (I): 4 bytes — unix timestamp the feed must report against
 *   - wager_quantity (Q): 8 bytes — XCP staked, in base units
 *   - counterwager_quantity (Q): 8 bytes — XCP required from the other side
 *   - target_value (d): 8 bytes — IEEE 754 double the feed is compared to
 *   - leverage (I): 4 bytes — fixed point, 5040 = 1x
 *   - expiration (I): 4 bytes — blocks the order stays open
 *
 * The feed address is a transaction output, not part of this payload.
 */

import { BinaryReader } from '@/utils/blockchain/counterparty/unpack/binary';

/** Exact length of a bet payload; core rejects any other size. */
const BET_LENGTH = 2 + 4 + 8 + 8 + 8 + 4 + 4;

/** Bet types, as encoded in the two-byte bet_type field. */
export const BetType: Record<number, string> = {
  0: 'BullCFD',
  1: 'BearCFD',
  2: 'Equal',
  3: 'NotEqual',
};

/**
 * Unpacked bet data
 */
export interface BetData {
  /** Raw bet type */
  betType: number;
  /** Human-readable bet type, or undefined if the value is not a known type */
  betTypeName?: string;
  /** Unix timestamp the feed must report against */
  deadline: number;
  /** XCP staked, in base units */
  wagerQuantity: bigint;
  /** XCP required from the other side, in base units */
  counterwagerQuantity: bigint;
  /** Value the feed is compared to */
  targetValue: number;
  /** Leverage in fixed point, 5040 = 1x */
  leverage: number;
  /** Blocks the order stays open */
  expiration: number;
}

/**
 * Unpack a bet message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked bet data
 * @throws Error if payload is invalid
 */
export function unpackBet(payload: Uint8Array): BetData {
  if (payload.length !== BET_LENGTH) {
    throw new Error(`Invalid bet payload length: ${payload.length} (expected ${BET_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const betType = reader.readUint16BE();
  const deadline = reader.readUint32BE();
  const wagerQuantity = reader.readUint64BE();
  const counterwagerQuantity = reader.readUint64BE();

  const targetBytes = reader.readBytes(8);
  const targetValue = new DataView(
    targetBytes.buffer,
    targetBytes.byteOffset,
    8
  ).getFloat64(0, false);

  const leverage = reader.readUint32BE();
  const expiration = reader.readUint32BE();

  return {
    betType,
    betTypeName: BetType[betType],
    deadline,
    wagerQuantity,
    counterwagerQuantity,
    targetValue,
    leverage,
    expiration,
  };
}
