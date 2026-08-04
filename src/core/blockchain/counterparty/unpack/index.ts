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

import { BinaryReader, bytesEqual, hexToBytes } from '@/core/blockchain/counterparty/unpack/binary';
import { type AttachData, type DetachData, type MoveData, unpackAttach, unpackDetach, unpackMove } from '@/core/blockchain/counterparty/unpack/messages/attach';
import { type BetData, unpackBet } from '@/core/blockchain/counterparty/unpack/messages/bet';
import { type BroadcastData, unpackBroadcast } from '@/core/blockchain/counterparty/unpack/messages/broadcast';
import { type BTCPayData, unpackBTCPay } from '@/core/blockchain/counterparty/unpack/messages/btcpay';
import { type CancelData, unpackCancel } from '@/core/blockchain/counterparty/unpack/messages/cancel';
import { type DestroyData, unpackDestroy } from '@/core/blockchain/counterparty/unpack/messages/destroy';
import { type DispenseData, unpackDispense } from '@/core/blockchain/counterparty/unpack/messages/dispense';
import { type DispenserData, unpackDispenser } from '@/core/blockchain/counterparty/unpack/messages/dispenser';
import { type DividendData, unpackDividend } from '@/core/blockchain/counterparty/unpack/messages/dividend';
// Import message-specific unpackers
import { type EnhancedSendData, unpackEnhancedSend } from '@/core/blockchain/counterparty/unpack/messages/enhancedSend';
import { type FairmintData, unpackFairmint } from '@/core/blockchain/counterparty/unpack/messages/fairmint';
import { type FairminterData, unpackFairminter } from '@/core/blockchain/counterparty/unpack/messages/fairminter';
import { type IssuanceData, unpackIssuance } from '@/core/blockchain/counterparty/unpack/messages/issuance';
import { type MPMAData, unpackMPMA } from '@/core/blockchain/counterparty/unpack/messages/mpma';
import { type OrderData, unpackOrder } from '@/core/blockchain/counterparty/unpack/messages/order';
import { type PoolDepositData, type PoolWithdrawData, unpackPoolDeposit, unpackPoolWithdraw } from '@/core/blockchain/counterparty/unpack/messages/pool';
import { type SendData, unpackSend } from '@/core/blockchain/counterparty/unpack/messages/send';
import { type SweepData, unpackSweep } from '@/core/blockchain/counterparty/unpack/messages/sweep';
import { COUNTERPARTY_PREFIX, MessageTypeId, MessageTypeName } from '@/core/blockchain/counterparty/unpack/messageTypes';

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
  | BetData
  | DividendData
  | FairminterData
  | FairmintData
  | AttachData
  | MoveData
  | DetachData
  | PoolDepositData
  | PoolWithdrawData
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
  const firstByte = reader.peek(1)[0]!;

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

        case MessageTypeId.POOL_DEPOSIT:
          unpackedData = unpackPoolDeposit(rawPayload);
          break;

        case MessageTypeId.POOL_WITHDRAW:
          unpackedData = unpackPoolWithdraw(rawPayload);
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

        case MessageTypeId.BET:
          unpackedData = unpackBet(rawPayload);
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
          // Type 100 is a move between UTXOs, whose field list differs from attach's.
          unpackedData = unpackMove(rawPayload);
          break;

        case MessageTypeId.UTXO_ATTACH:
          // UTXO type 101 is attach (move to UTXO)
          unpackedData = unpackAttach(rawPayload);
          break;

        case MessageTypeId.UTXO_DETACH:
          // UTXO type 102 is detach (move to address)
          unpackedData = unpackDetach(rawPayload);
          break;

        default:
          // Keep the raw payload for display, but this is not a decode.
          unpackedData = { _raw: Array.from(rawPayload) };
          unpackError = `Unsupported message type: ${messageType} (ID: ${messageTypeId})`;
      }
    } catch (e) {
      unpackError = e instanceof Error ? e.message : 'Unknown error during unpacking';
    }

    return {
      // Success means the message was decoded. An unsupported type still returns data — the raw
      // bytes, for display — so the presence of data is not itself a decode.
      success: !unpackError,
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

export * from '@/core/blockchain/counterparty/unpack/address';
export * from '@/core/blockchain/counterparty/unpack/assetId';
export * from '@/core/blockchain/counterparty/unpack/binary';
export type { AttachData, MoveData } from '@/core/blockchain/counterparty/unpack/messages/attach';
export type { BroadcastData } from '@/core/blockchain/counterparty/unpack/messages/broadcast';
export type { BTCPayData } from '@/core/blockchain/counterparty/unpack/messages/btcpay';
export type { CancelData } from '@/core/blockchain/counterparty/unpack/messages/cancel';
export type { DestroyData } from '@/core/blockchain/counterparty/unpack/messages/destroy';
export type { DispenseData } from '@/core/blockchain/counterparty/unpack/messages/dispense';
export type { DispenserData } from '@/core/blockchain/counterparty/unpack/messages/dispenser';
export type { DividendData } from '@/core/blockchain/counterparty/unpack/messages/dividend';
// Re-export message-specific types
export type { EnhancedSendData } from '@/core/blockchain/counterparty/unpack/messages/enhancedSend';
export type { FairmintData } from '@/core/blockchain/counterparty/unpack/messages/fairmint';
export type { FairminterData } from '@/core/blockchain/counterparty/unpack/messages/fairminter';
export type { IssuanceData } from '@/core/blockchain/counterparty/unpack/messages/issuance';
export type { MPMAData, MPMASend } from '@/core/blockchain/counterparty/unpack/messages/mpma';
export type { OrderData } from '@/core/blockchain/counterparty/unpack/messages/order';
export type { PoolDepositData, PoolWithdrawData } from '@/core/blockchain/counterparty/unpack/messages/pool';
export type { SendData } from '@/core/blockchain/counterparty/unpack/messages/send';
export type { SweepData } from '@/core/blockchain/counterparty/unpack/messages/sweep';
// Re-export types and utilities
export * from '@/core/blockchain/counterparty/unpack/messageTypes';
// Re-export param schema
export {
  type Criticality,
  getCriticalParams,
  getDangerousParams,
  getMessageSchema,
  getSchemaByTypeId,
  MESSAGE_SCHEMAS,
  type MessageSchema,
  type ParamDefinition,
} from '@/core/blockchain/counterparty/unpack/paramSchema';
// Re-export provider verification utilities
export {
  type ApiCounterpartyMessage,
  type ProviderVerificationResult,
  verifyProviderTransaction,
} from '@/core/blockchain/counterparty/unpack/providerVerify';
// Re-export verification utilities
export {
  type ComposeParams,
  type ComposeRequest,
  type VerifiableComposeType,
  type VerificationMismatch,
  type VerificationResult,
  verifyTransaction,
  verifyTransactionLegacy,
} from '@/core/blockchain/counterparty/unpack/verify';
