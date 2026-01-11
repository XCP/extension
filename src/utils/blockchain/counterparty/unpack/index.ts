/**
 * Counterparty Message Unpacker
 *
 * Local unpacking of Counterparty messages from OP_RETURN data.
 * This provides verification that composed transactions match what was requested,
 * without relying on the remote API to tell us what the transaction contains.
 *
 * Usage:
 *   const result = unpackCounterpartyMessage(opReturnData);
 *   if (result.success) {
 *     console.log(result.messageType, result.data);
 *   }
 */

import { BinaryReader, hexToBytes, bytesEqual } from './binary';
import { COUNTERPARTY_PREFIX, MessageTypeId, MessageTypeName } from './messageTypes';

// Import message-specific unpackers
import { unpackEnhancedSend, type EnhancedSendData } from './messages/enhancedSend';
import { unpackOrder, type OrderData } from './messages/order';
import { unpackDispenser, type DispenserData } from './messages/dispenser';
import { unpackCancel, type CancelData } from './messages/cancel';
import { unpackDestroy, type DestroyData } from './messages/destroy';
import { unpackSweep, type SweepData } from './messages/sweep';
import { unpackSend, type SendData } from './messages/send';
import { unpackIssuance, type IssuanceData } from './messages/issuance';
import { unpackMPMA, type MPMAData, type MPMASend } from './messages/mpma';
import { unpackBTCPay, type BTCPayData } from './messages/btcpay';
import { unpackDispense, type DispenseData } from './messages/dispense';
import { unpackBroadcast, type BroadcastData } from './messages/broadcast';
import { unpackDividend, type DividendData } from './messages/dividend';
import { unpackFairminter, type FairminterData } from './messages/fairminter';
import { unpackFairmint, type FairmintData } from './messages/fairmint';
import { unpackAttach, unpackDetach, type AttachData } from './messages/attach';

/**
 * Union type of all possible unpacked message data
 */
export type UnpackedMessageData =
  | EnhancedSendData
  | OrderData
  | DispenserData
  | CancelData
  | DestroyData
  | SweepData
  | SendData
  | IssuanceData
  | MPMAData
  | BTCPayData
  | DispenseData
  | BroadcastData
  | DividendData
  | FairminterData
  | FairmintData
  | AttachData
  | Record<string, unknown>; // Fallback for unsupported types

/**
 * Result of unpacking a Counterparty message
 */
export interface UnpackResult {
  /** Whether unpacking succeeded */
  success: boolean;
  /** Error message if unpacking failed */
  error?: string;
  /** Message type ID (e.g., 2 for enhanced_send) */
  messageTypeId?: number;
  /** Human-readable message type name */
  messageType?: string;
  /** Unpacked message data */
  data?: UnpackedMessageData;
  /** Raw message payload (after prefix and type ID) */
  rawPayload?: Uint8Array;
}

/**
 * Extract message type ID from the message payload.
 * Counterparty uses either 1-byte or 4-byte message type IDs.
 *
 * @param reader - Binary reader positioned at start of message (after prefix)
 * @returns Object with messageTypeId and remaining payload
 */
function extractMessageTypeId(reader: BinaryReader): { messageTypeId: number; success: boolean } {
  if (reader.remaining < 1) {
    return { messageTypeId: 0, success: false };
  }

  // Try 1-byte format first (for modern short_tx_type_id)
  const firstByte = reader.peek(1)[0];

  if (firstByte > 0 && firstByte < 256) {
    // 1-byte message type ID
    reader.skip(1);
    return { messageTypeId: firstByte, success: true };
  }

  // First byte is 0, try 4-byte format
  if (reader.remaining >= 4) {
    const messageTypeId = reader.readUint32BE();
    return { messageTypeId, success: true };
  }

  return { messageTypeId: 0, success: false };
}

/**
 * Unpack a Counterparty message from raw OP_RETURN data.
 *
 * @param data - OP_RETURN data as hex string or Uint8Array
 * @returns UnpackResult with unpacked data or error
 */
export function unpackCounterpartyMessage(data: string | Uint8Array): UnpackResult {
  try {
    // Convert hex to bytes if needed
    const bytes = typeof data === 'string' ? hexToBytes(data) : data;

    // Check minimum length (8 byte prefix + 1 byte type ID)
    if (bytes.length < 9) {
      return { success: false, error: 'Data too short for Counterparty message' };
    }

    // Check for CNTRPRTY prefix
    const prefix = bytes.slice(0, 8);
    if (!bytesEqual(prefix, COUNTERPARTY_PREFIX)) {
      return { success: false, error: 'Missing CNTRPRTY prefix' };
    }

    // Create reader for remaining data (after prefix)
    const reader = new BinaryReader(bytes.slice(8));

    // Extract message type ID
    const { messageTypeId, success: typeSuccess } = extractMessageTypeId(reader);
    if (!typeSuccess) {
      return { success: false, error: 'Could not extract message type ID' };
    }

    // Get human-readable type name
    const messageType = MessageTypeName[messageTypeId] || `unknown_${messageTypeId}`;

    // Get remaining payload
    const rawPayload = reader.readRemaining();

    // Dispatch to specific unpacker based on message type
    let unpackedData: UnpackedMessageData | undefined;
    let unpackError: string | undefined;

    try {
      switch (messageTypeId) {
        case MessageTypeId.SEND:
          unpackedData = unpackSend(rawPayload);
          break;

        case MessageTypeId.ENHANCED_SEND:
          unpackedData = unpackEnhancedSend(rawPayload);
          break;

        case MessageTypeId.ORDER:
          unpackedData = unpackOrder(rawPayload);
          break;

        case MessageTypeId.DISPENSER:
          unpackedData = unpackDispenser(rawPayload);
          break;

        case MessageTypeId.CANCEL:
          unpackedData = unpackCancel(rawPayload);
          break;

        case MessageTypeId.DESTROY:
          unpackedData = unpackDestroy(rawPayload);
          break;

        case MessageTypeId.SWEEP:
          unpackedData = unpackSweep(rawPayload);
          break;

        case MessageTypeId.ISSUANCE:
        case MessageTypeId.SUBASSET_ISSUANCE:
        case MessageTypeId.LR_ISSUANCE:
        case MessageTypeId.LR_SUBASSET:
          unpackedData = unpackIssuance(rawPayload, messageTypeId);
          break;

        case MessageTypeId.MPMA_SEND:
          unpackedData = unpackMPMA(rawPayload);
          break;

        case MessageTypeId.BTC_PAY:
          unpackedData = unpackBTCPay(rawPayload);
          break;

        case MessageTypeId.DISPENSE:
          unpackedData = unpackDispense(rawPayload);
          break;

        case MessageTypeId.BROADCAST:
          unpackedData = unpackBroadcast(rawPayload);
          break;

        case MessageTypeId.DIVIDEND:
          unpackedData = unpackDividend(rawPayload);
          break;

        case MessageTypeId.FAIRMINTER:
          unpackedData = unpackFairminter(rawPayload);
          break;

        case MessageTypeId.FAIRMINT:
          unpackedData = unpackFairmint(rawPayload);
          break;

        case MessageTypeId.UTXO:
          // UTXO type 100 is detach (move to address)
          unpackedData = unpackDetach(rawPayload);
          break;

        case MessageTypeId.UTXO_ATTACH:
          // UTXO type 101 is attach (move to UTXO)
          unpackedData = unpackAttach(rawPayload);
          break;

        default:
          // Return raw payload for unsupported types
          unpackedData = { _raw: Array.from(rawPayload) };
          unpackError = `Unsupported message type: ${messageType} (ID: ${messageTypeId})`;
      }
    } catch (e) {
      unpackError = e instanceof Error ? e.message : 'Unknown error during unpacking';
    }

    return {
      success: !unpackError || unpackedData !== undefined,
      error: unpackError,
      messageTypeId,
      messageType,
      data: unpackedData,
      rawPayload,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

/**
 * Check if data appears to be a Counterparty message (has CNTRPRTY prefix).
 */
export function isCounterpartyData(data: string | Uint8Array): boolean {
  try {
    const bytes = typeof data === 'string' ? hexToBytes(data) : data;
    if (bytes.length < 8) return false;
    return bytesEqual(bytes.slice(0, 8), COUNTERPARTY_PREFIX);
  } catch {
    return false;
  }
}

// Re-export types and utilities
export * from './messageTypes';
export * from './assetId';
export * from './address';
export * from './binary';

// Re-export message-specific types
export type { EnhancedSendData } from './messages/enhancedSend';
export type { OrderData } from './messages/order';
export type { DispenserData } from './messages/dispenser';
export type { CancelData } from './messages/cancel';
export type { DestroyData } from './messages/destroy';
export type { SweepData } from './messages/sweep';
export type { SendData } from './messages/send';
export type { IssuanceData } from './messages/issuance';
export type { MPMAData, MPMASend } from './messages/mpma';
export type { BTCPayData } from './messages/btcpay';
export type { DispenseData } from './messages/dispense';
export type { BroadcastData } from './messages/broadcast';
export type { DividendData } from './messages/dividend';
export type { FairminterData } from './messages/fairminter';
export type { FairmintData } from './messages/fairmint';
export type { AttachData } from './messages/attach';

// Re-export verification utilities
export {
  verifyTransaction,
  verifyTransactionLegacy,
  extractOpReturnData,
  type ComposeRequest,
  type ComposeParams,
  type VerificationResult,
  type VerificationMismatch,
  type VerifiableComposeType,
} from './verify';

// Re-export param schema
export {
  getMessageSchema,
  getSchemaByTypeId,
  getCriticalParams,
  getDangerousParams,
  MESSAGE_SCHEMAS,
  type Criticality,
  type ParamDefinition,
  type MessageSchema,
} from './paramSchema';

// Re-export provider verification utilities
export {
  verifyProviderTransaction,
  type ApiCounterpartyMessage,
  type ProviderVerificationResult,
} from './providerVerify';
