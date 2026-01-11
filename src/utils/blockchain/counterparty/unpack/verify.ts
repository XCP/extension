/**
 * Transaction Verification
 *
 * Verifies that a composed transaction matches what was requested.
 * This provides defense-in-depth against a compromised API returning
 * malicious transactions.
 *
 * Usage:
 *   const result = verifyTransaction(rawTxHex, {
 *     type: 'enhanced_send',
 *     params: { asset: 'XCP', quantity: 1000000000, destination: 'bc1q...' }
 *   });
 *
 *   if (!result.valid) {
 *     console.error('Transaction mismatch:', result.errors);
 *   }
 */

import { unpackCounterpartyMessage, UnpackedMessageData, MessageTypeId, MessageTypeName } from './index';
import type { EnhancedSendData } from './messages/enhancedSend';
import type { OrderData } from './messages/order';
import type { DispenserData } from './messages/dispenser';
import type { CancelData } from './messages/cancel';
import type { DestroyData } from './messages/destroy';
import type { SweepData } from './messages/sweep';
import type { SendData } from './messages/send';
import type { IssuanceData } from './messages/issuance';
import { addressesEqual } from './address';

/**
 * Compose request for enhanced send
 */
export interface EnhancedSendRequest {
  type: 'enhanced_send' | 'send';
  params: {
    asset: string;
    quantity: number | string | bigint;
    destination: string;
    memo?: string;
  };
}

/**
 * Compose request for order
 */
export interface OrderRequest {
  type: 'order';
  params: {
    give_asset: string;
    give_quantity: number | string | bigint;
    get_asset: string;
    get_quantity: number | string | bigint;
    expiration: number;
    fee_required?: number | string | bigint;
  };
}

/**
 * Compose request for dispenser
 */
export interface DispenserRequest {
  type: 'dispenser';
  params: {
    asset: string;
    give_quantity: number | string | bigint;
    escrow_quantity: number | string | bigint;
    mainchainrate: number | string | bigint;
    status?: number;
    open_address?: string;
  };
}

/**
 * Compose request for cancel
 */
export interface CancelRequest {
  type: 'cancel';
  params: {
    offer_hash: string;
  };
}

/**
 * Compose request for destroy
 */
export interface DestroyRequest {
  type: 'destroy';
  params: {
    asset: string;
    quantity: number | string | bigint;
    tag?: string;
  };
}

/**
 * Compose request for sweep
 */
export interface SweepRequest {
  type: 'sweep';
  params: {
    destination: string;
    flags: number;
    memo?: string;
  };
}

/**
 * Compose request for issuance
 */
export interface IssuanceRequest {
  type: 'issuance';
  params: {
    asset: string;
    quantity: number | string | bigint;
    divisible: boolean;
    description?: string;
  };
}

/**
 * Union of all compose request types
 */
export type ComposeRequest =
  | EnhancedSendRequest
  | OrderRequest
  | DispenserRequest
  | CancelRequest
  | DestroyRequest
  | SweepRequest
  | IssuanceRequest;

/**
 * Result of transaction verification
 */
export interface VerificationResult {
  /** Whether the transaction matches the request */
  valid: boolean;
  /** List of mismatches found */
  errors: string[];
  /** Warnings (non-critical differences) */
  warnings: string[];
  /** The unpacked transaction data */
  unpacked?: UnpackedMessageData;
  /** The message type that was unpacked */
  messageType?: string;
  /** Expected values from the request */
  expected: Record<string, unknown>;
  /** Actual values from the transaction */
  actual: Record<string, unknown>;
}

/**
 * Normalize quantity to bigint for comparison
 */
function toBigInt(value: number | string | bigint | undefined): bigint {
  if (value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.floor(value));
  return BigInt(value);
}

/**
 * Verify an enhanced send transaction
 */
function verifyEnhancedSend(
  data: EnhancedSendData,
  params: EnhancedSendRequest['params']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check asset
  if (data.asset.toUpperCase() !== params.asset.toUpperCase()) {
    errors.push(`Asset mismatch: expected "${params.asset}", got "${data.asset}"`);
  }

  // Check quantity
  const expectedQuantity = toBigInt(params.quantity);
  if (data.quantity !== expectedQuantity) {
    errors.push(`Quantity mismatch: expected ${expectedQuantity}, got ${data.quantity}`);
  }

  // Check destination
  if (!addressesEqual(data.destination, params.destination)) {
    errors.push(`Destination mismatch: expected "${params.destination}", got "${data.destination}"`);
  }

  // Check memo (if specified)
  if (params.memo !== undefined && data.memo !== params.memo) {
    warnings.push(`Memo mismatch: expected "${params.memo}", got "${data.memo || '(none)'}"`);
  }

  return { errors, warnings };
}

/**
 * Verify an order transaction
 */
function verifyOrder(
  data: OrderData,
  params: OrderRequest['params']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check give asset
  if (data.giveAsset.toUpperCase() !== params.give_asset.toUpperCase()) {
    errors.push(`Give asset mismatch: expected "${params.give_asset}", got "${data.giveAsset}"`);
  }

  // Check give quantity
  const expectedGiveQty = toBigInt(params.give_quantity);
  if (data.giveQuantity !== expectedGiveQty) {
    errors.push(`Give quantity mismatch: expected ${expectedGiveQty}, got ${data.giveQuantity}`);
  }

  // Check get asset
  if (data.getAsset.toUpperCase() !== params.get_asset.toUpperCase()) {
    errors.push(`Get asset mismatch: expected "${params.get_asset}", got "${data.getAsset}"`);
  }

  // Check get quantity
  const expectedGetQty = toBigInt(params.get_quantity);
  if (data.getQuantity !== expectedGetQty) {
    errors.push(`Get quantity mismatch: expected ${expectedGetQty}, got ${data.getQuantity}`);
  }

  // Check expiration
  if (data.expiration !== params.expiration) {
    errors.push(`Expiration mismatch: expected ${params.expiration}, got ${data.expiration}`);
  }

  // Check fee_required (if specified)
  if (params.fee_required !== undefined) {
    const expectedFee = toBigInt(params.fee_required);
    if (data.feeRequired !== expectedFee) {
      warnings.push(`Fee required mismatch: expected ${expectedFee}, got ${data.feeRequired}`);
    }
  }

  return { errors, warnings };
}

/**
 * Verify a dispenser transaction
 */
function verifyDispenser(
  data: DispenserData,
  params: DispenserRequest['params']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check asset
  if (data.asset.toUpperCase() !== params.asset.toUpperCase()) {
    errors.push(`Asset mismatch: expected "${params.asset}", got "${data.asset}"`);
  }

  // Check give quantity
  const expectedGiveQty = toBigInt(params.give_quantity);
  if (data.giveQuantity !== expectedGiveQty) {
    errors.push(`Give quantity mismatch: expected ${expectedGiveQty}, got ${data.giveQuantity}`);
  }

  // Check escrow quantity
  const expectedEscrowQty = toBigInt(params.escrow_quantity);
  if (data.escrowQuantity !== expectedEscrowQty) {
    errors.push(`Escrow quantity mismatch: expected ${expectedEscrowQty}, got ${data.escrowQuantity}`);
  }

  // Check mainchainrate
  const expectedRate = toBigInt(params.mainchainrate);
  if (data.mainchainrate !== expectedRate) {
    errors.push(`Mainchainrate mismatch: expected ${expectedRate}, got ${data.mainchainrate}`);
  }

  // Check status (if specified)
  if (params.status !== undefined && data.status !== params.status) {
    errors.push(`Status mismatch: expected ${params.status}, got ${data.status}`);
  }

  // Check open_address (if specified)
  if (params.open_address && data.openAddress) {
    if (!addressesEqual(data.openAddress, params.open_address)) {
      errors.push(`Open address mismatch: expected "${params.open_address}", got "${data.openAddress}"`);
    }
  }

  return { errors, warnings };
}

/**
 * Verify a cancel transaction
 */
function verifyCancel(
  data: CancelData,
  params: CancelRequest['params']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check offer hash (case-insensitive hex comparison)
  if (data.offerHash.toLowerCase() !== params.offer_hash.toLowerCase()) {
    errors.push(`Offer hash mismatch: expected "${params.offer_hash}", got "${data.offerHash}"`);
  }

  return { errors, warnings };
}

/**
 * Verify a destroy transaction
 */
function verifyDestroy(
  data: DestroyData,
  params: DestroyRequest['params']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check asset
  if (data.asset.toUpperCase() !== params.asset.toUpperCase()) {
    errors.push(`Asset mismatch: expected "${params.asset}", got "${data.asset}"`);
  }

  // Check quantity
  const expectedQuantity = toBigInt(params.quantity);
  if (data.quantity !== expectedQuantity) {
    errors.push(`Quantity mismatch: expected ${expectedQuantity}, got ${data.quantity}`);
  }

  // Check tag (if specified)
  if (params.tag !== undefined && data.tag !== params.tag) {
    warnings.push(`Tag mismatch: expected "${params.tag}", got "${data.tag || '(none)'}"`);
  }

  return { errors, warnings };
}

/**
 * Verify a sweep transaction
 */
function verifySweep(
  data: SweepData,
  params: SweepRequest['params']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check destination
  if (!addressesEqual(data.destination, params.destination)) {
    errors.push(`Destination mismatch: expected "${params.destination}", got "${data.destination}"`);
  }

  // Check flags
  if (data.flags !== params.flags) {
    errors.push(`Flags mismatch: expected ${params.flags}, got ${data.flags}`);
  }

  // Check memo (if specified)
  if (params.memo !== undefined && data.memo !== params.memo) {
    warnings.push(`Memo mismatch: expected "${params.memo}", got "${data.memo || '(none)'}"`);
  }

  return { errors, warnings };
}

/**
 * Verify a transaction matches the compose request.
 *
 * @param opReturnData - The OP_RETURN data from the transaction (hex or bytes)
 * @param request - The original compose request
 * @returns Verification result with any mismatches found
 */
export function verifyTransaction(
  opReturnData: string | Uint8Array,
  request: ComposeRequest
): VerificationResult {
  const result: VerificationResult = {
    valid: false,
    errors: [],
    warnings: [],
    expected: request.params as Record<string, unknown>,
    actual: {},
  };

  // Unpack the transaction
  const unpacked = unpackCounterpartyMessage(opReturnData);

  if (!unpacked.success || !unpacked.data) {
    result.errors.push(unpacked.error || 'Failed to unpack transaction');
    return result;
  }

  result.unpacked = unpacked.data;
  result.messageType = unpacked.messageType;
  result.actual = unpacked.data as Record<string, unknown>;

  // Verify based on request type
  let verifyResult: { errors: string[]; warnings: string[] };

  switch (request.type) {
    case 'enhanced_send':
    case 'send':
      // Check message type matches
      if (unpacked.messageTypeId !== MessageTypeId.ENHANCED_SEND &&
          unpacked.messageTypeId !== MessageTypeId.SEND) {
        result.errors.push(
          `Message type mismatch: expected send, got ${unpacked.messageType}`
        );
        return result;
      }
      verifyResult = verifyEnhancedSend(
        unpacked.data as EnhancedSendData,
        request.params
      );
      break;

    case 'order':
      if (unpacked.messageTypeId !== MessageTypeId.ORDER) {
        result.errors.push(
          `Message type mismatch: expected order, got ${unpacked.messageType}`
        );
        return result;
      }
      verifyResult = verifyOrder(unpacked.data as OrderData, request.params);
      break;

    case 'dispenser':
      if (unpacked.messageTypeId !== MessageTypeId.DISPENSER) {
        result.errors.push(
          `Message type mismatch: expected dispenser, got ${unpacked.messageType}`
        );
        return result;
      }
      verifyResult = verifyDispenser(unpacked.data as DispenserData, request.params);
      break;

    case 'cancel':
      if (unpacked.messageTypeId !== MessageTypeId.CANCEL) {
        result.errors.push(
          `Message type mismatch: expected cancel, got ${unpacked.messageType}`
        );
        return result;
      }
      verifyResult = verifyCancel(unpacked.data as CancelData, request.params);
      break;

    case 'destroy':
      if (unpacked.messageTypeId !== MessageTypeId.DESTROY) {
        result.errors.push(
          `Message type mismatch: expected destroy, got ${unpacked.messageType}`
        );
        return result;
      }
      verifyResult = verifyDestroy(unpacked.data as DestroyData, request.params);
      break;

    case 'sweep':
      if (unpacked.messageTypeId !== MessageTypeId.SWEEP) {
        result.errors.push(
          `Message type mismatch: expected sweep, got ${unpacked.messageType}`
        );
        return result;
      }
      verifyResult = verifySweep(unpacked.data as SweepData, request.params);
      break;

    case 'issuance':
      if (unpacked.messageTypeId !== MessageTypeId.ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.SUBASSET_ISSUANCE) {
        result.errors.push(
          `Message type mismatch: expected issuance, got ${unpacked.messageType}`
        );
        return result;
      }
      // Basic issuance verification
      const issuanceData = unpacked.data as IssuanceData;
      verifyResult = { errors: [], warnings: [] };
      if (issuanceData.asset.toUpperCase() !== request.params.asset.toUpperCase()) {
        verifyResult.errors.push(
          `Asset mismatch: expected "${request.params.asset}", got "${issuanceData.asset}"`
        );
      }
      const expectedQty = toBigInt(request.params.quantity);
      if (issuanceData.quantity !== expectedQty) {
        verifyResult.errors.push(
          `Quantity mismatch: expected ${expectedQty}, got ${issuanceData.quantity}`
        );
      }
      if (issuanceData.divisible !== request.params.divisible) {
        verifyResult.errors.push(
          `Divisible mismatch: expected ${request.params.divisible}, got ${issuanceData.divisible}`
        );
      }
      break;

    default:
      result.errors.push(`Unknown request type: ${(request as ComposeRequest).type}`);
      return result;
  }

  result.errors.push(...verifyResult.errors);
  result.warnings.push(...verifyResult.warnings);
  result.valid = result.errors.length === 0;

  return result;
}

/**
 * Extract OP_RETURN data from a raw transaction hex.
 * This looks for OP_RETURN outputs and extracts the data.
 *
 * @param rawTxHex - Raw transaction hex
 * @returns OP_RETURN data as hex string, or null if not found
 */
export function extractOpReturnData(rawTxHex: string): string | null {
  // OP_RETURN is 0x6a, followed by push opcode and data
  // Common patterns:
  //   6a4c XX ... = OP_RETURN OP_PUSHDATA1 <len> <data>
  //   6a XX ...   = OP_RETURN OP_PUSH_N <data> (for small data)

  const tx = rawTxHex.toLowerCase();

  // Find OP_RETURN in outputs
  // This is a simplified search - a full parser would be better
  let idx = tx.indexOf('6a');
  while (idx !== -1) {
    // Check if this looks like an OP_RETURN output
    const nextByte = parseInt(tx.slice(idx + 2, idx + 4), 16);

    if (nextByte === 0x4c) {
      // OP_PUSHDATA1 - next byte is length
      const len = parseInt(tx.slice(idx + 4, idx + 6), 16);
      if (len > 0 && idx + 6 + len * 2 <= tx.length) {
        const data = tx.slice(idx + 6, idx + 6 + len * 2);
        // Check for CNTRPRTY prefix
        if (data.startsWith('434e545250525459')) {
          return data;
        }
      }
    } else if (nextByte >= 1 && nextByte <= 75) {
      // Direct push (1-75 bytes)
      const len = nextByte;
      if (idx + 4 + len * 2 <= tx.length) {
        const data = tx.slice(idx + 4, idx + 4 + len * 2);
        // Check for CNTRPRTY prefix
        if (data.startsWith('434e545250525459')) {
          return data;
        }
      }
    }

    idx = tx.indexOf('6a', idx + 2);
  }

  return null;
}
