/**
 * Dispense Message Unpacker
 *
 * Message ID: 13
 * Format: Minimal - just a single null byte marker
 *
 * This message type is used to explicitly trigger a dispense.
 * The actual dispense logic is handled based on the BTC sent to a dispenser address.
 * The message payload is minimal - just a marker byte (0x00).
 */

/**
 * Unpacked Dispense data
 */
export interface DispenseData {
  /** Raw data bytes (typically just a marker) */
  data: Uint8Array;
}

/**
 * Unpack a Dispense message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Dispense data
 */
export function unpackDispense(payload: Uint8Array): DispenseData {
  // Dispense messages have minimal payload (usually just 0x00 marker)
  return {
    data: payload,
  };
}
