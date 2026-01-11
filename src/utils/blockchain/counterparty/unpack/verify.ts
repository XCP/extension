/**
 * Transaction Verification
 *
 * Verifies that a composed transaction matches what was requested.
 * This provides defense-in-depth against a compromised API returning
 * malicious transactions.
 *
 * Uses compose.ts types directly and paramSchema.ts for criticality levels.
 * Verifies against response.result.params from the API.
 */

import { unpackCounterpartyMessage, UnpackedMessageData, MessageTypeId } from './index';
import type { EnhancedSendData } from './messages/enhancedSend';
import type { OrderData } from './messages/order';
import type { DispenserData } from './messages/dispenser';
import type { CancelData } from './messages/cancel';
import type { DestroyData } from './messages/destroy';
import type { SweepData } from './messages/sweep';
import type { SendData } from './messages/send';
import type { IssuanceData } from './messages/issuance';
import { addressesEqual } from './address';
import { getMessageSchema, type Criticality } from './paramSchema';

// Import compose types directly
import type {
  SendOptions,
  OrderOptions,
  DispenserOptions,
  CancelOptions,
  DestroyOptions,
  SweepOptions,
  IssuanceOptions,
} from '@/utils/blockchain/counterparty/compose';

/**
 * Supported compose types for verification
 */
export type VerifiableComposeType =
  | 'send'
  | 'enhanced_send'
  | 'order'
  | 'dispenser'
  | 'cancel'
  | 'destroy'
  | 'sweep'
  | 'issuance';

/**
 * Compose params - the params object from compose options
 * These match what the API returns in response.result.params
 */
export type ComposeParams =
  | Pick<SendOptions, 'destination' | 'asset' | 'quantity' | 'memo' | 'memo_is_hex'>
  | Pick<OrderOptions, 'give_asset' | 'give_quantity' | 'get_asset' | 'get_quantity' | 'expiration' | 'fee_required'>
  | Pick<DispenserOptions, 'asset' | 'give_quantity' | 'escrow_quantity' | 'mainchainrate' | 'status' | 'open_address' | 'oracle_address'>
  | Pick<CancelOptions, 'offer_hash'>
  | Pick<DestroyOptions, 'asset' | 'quantity' | 'tag'>
  | Pick<SweepOptions, 'destination' | 'flags' | 'memo'>
  | Pick<IssuanceOptions, 'asset' | 'quantity' | 'divisible' | 'lock' | 'reset' | 'transfer_destination' | 'description'>;

/**
 * A mismatch found during verification
 */
export interface VerificationMismatch {
  /** Field name */
  field: string;
  /** Expected value (from request) */
  expected: unknown;
  /** Actual value (from transaction) */
  actual: unknown;
  /** How critical this mismatch is */
  criticality: Criticality;
  /** Human-readable description of the risk */
  riskDescription: string;
}

/**
 * Result of transaction verification
 */
export interface VerificationResult {
  /** Whether the transaction matches the request (no critical/dangerous mismatches) */
  valid: boolean;
  /** Critical mismatches (funds at risk) - blocks signing */
  criticalMismatches: VerificationMismatch[];
  /** Dangerous mismatches (harmful side effects) - blocks signing */
  dangerousMismatches: VerificationMismatch[];
  /** Informational mismatches (metadata differences) - warning only */
  infoMismatches: VerificationMismatch[];
  /** Legacy: all errors (critical + dangerous) */
  errors: string[];
  /** Legacy: all warnings (informational) */
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
function toBigInt(value: number | string | bigint | boolean | undefined | null): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.floor(value));
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/**
 * Compare two values, handling bigint/number/string conversions
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  // Handle null/undefined
  if (a === null || a === undefined) {
    return b === null || b === undefined;
  }
  if (b === null || b === undefined) return false;

  // Handle booleans
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }

  // Handle numbers/bigints/strings that represent quantities
  if (typeof a === 'bigint' || typeof b === 'bigint' ||
      typeof a === 'number' || typeof b === 'number') {
    return toBigInt(a as string | number | bigint) === toBigInt(b as string | number | bigint);
  }

  // Handle strings (addresses, assets, etc.)
  if (typeof a === 'string' && typeof b === 'string') {
    // Check if it looks like an address
    if (a.startsWith('bc1') || a.startsWith('1') || a.startsWith('3') ||
        b.startsWith('bc1') || b.startsWith('1') || b.startsWith('3')) {
      return addressesEqual(a, b);
    }
    // Case-insensitive comparison for assets/hashes
    return a.toLowerCase() === b.toLowerCase();
  }

  return a === b;
}

/**
 * Add a mismatch to the result
 */
function addMismatch(
  result: VerificationResult,
  field: string,
  expected: unknown,
  actual: unknown,
  criticality: Criticality,
  riskDescription: string
): void {
  const mismatch: VerificationMismatch = {
    field,
    expected,
    actual,
    criticality,
    riskDescription,
  };

  // Convert BigInt to string for JSON serialization
  const stringify = (val: unknown): string => {
    if (typeof val === 'bigint') return val.toString();
    return JSON.stringify(val);
  };
  // Capitalize field name for readability (e.g., 'asset' -> 'Asset mismatch')
  const capitalizedField = field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
  const message = `${capitalizedField} mismatch: expected ${stringify(expected)}, got ${stringify(actual)}`;

  switch (criticality) {
    case 'critical':
      result.criticalMismatches.push(mismatch);
      result.errors.push(`[CRITICAL] ${message}`);
      break;
    case 'dangerous':
      result.dangerousMismatches.push(mismatch);
      result.errors.push(`[DANGEROUS] ${message}`);
      break;
    case 'informational':
      result.infoMismatches.push(mismatch);
      result.warnings.push(message);
      break;
  }
}

/**
 * Verify send/enhanced_send transaction
 */
function verifySend(
  data: EnhancedSendData | SendData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  const schema = getMessageSchema('enhanced_send');
  if (!schema) return;

  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = lose wrong tokens');
  }

  // Quantity - critical
  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = lose more than intended');
  }

  // Destination - critical (for enhanced_send)
  if ('destination' in data && params.destination) {
    if (!valuesEqual(data.destination, params.destination)) {
      addMismatch(result, 'destination', params.destination, data.destination, 'critical',
        'Wrong address = funds sent to wrong recipient');
    }
  }

  // Memo - informational
  if (params.memo !== undefined && 'memo' in data) {
    if (!valuesEqual(data.memo, params.memo)) {
      addMismatch(result, 'memo', params.memo, data.memo, 'informational',
        'Just metadata, no direct financial impact');
    }
  }
}

/**
 * Verify order transaction
 */
function verifyOrder(
  data: OrderData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Give asset - critical
  if (!valuesEqual(data.giveAsset, params.give_asset)) {
    addMismatch(result, 'give_asset', params.give_asset, data.giveAsset, 'critical',
      'Wrong asset = offering wrong tokens');
  }

  // Give quantity - critical
  if (!valuesEqual(data.giveQuantity, params.give_quantity)) {
    addMismatch(result, 'give_quantity', params.give_quantity, data.giveQuantity, 'critical',
      'Wrong amount = offering more than intended');
  }

  // Get asset - critical
  if (!valuesEqual(data.getAsset, params.get_asset)) {
    addMismatch(result, 'get_asset', params.get_asset, data.getAsset, 'critical',
      'Wrong asset = receiving wrong tokens');
  }

  // Get quantity - critical
  if (!valuesEqual(data.getQuantity, params.get_quantity)) {
    addMismatch(result, 'get_quantity', params.get_quantity, data.getQuantity, 'critical',
      'Wrong amount = bad exchange rate');
  }

  // Expiration - dangerous
  if (!valuesEqual(data.expiration, params.expiration)) {
    addMismatch(result, 'expiration', params.expiration, data.expiration, 'dangerous',
      'Too short = expires before fill, too long = funds locked longer');
  }

  // Fee required - dangerous (only if specified)
  if (params.fee_required !== undefined) {
    if (!valuesEqual(data.feeRequired, params.fee_required)) {
      addMismatch(result, 'fee_required', params.fee_required, data.feeRequired, 'dangerous',
        'Higher fee = lose more BTC on match');
    }
  }
}

/**
 * Verify dispenser transaction
 */
function verifyDispenser(
  data: DispenserData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = dispensing wrong tokens');
  }

  // Give quantity - critical
  if (!valuesEqual(data.giveQuantity, params.give_quantity)) {
    addMismatch(result, 'give_quantity', params.give_quantity, data.giveQuantity, 'critical',
      'Wrong amount = giving wrong amount per dispense');
  }

  // Escrow quantity - critical
  if (!valuesEqual(data.escrowQuantity, params.escrow_quantity)) {
    addMismatch(result, 'escrow_quantity', params.escrow_quantity, data.escrowQuantity, 'critical',
      'Wrong amount = locking wrong total amount');
  }

  // Mainchainrate - critical
  if (!valuesEqual(data.mainchainrate, params.mainchainrate)) {
    addMismatch(result, 'mainchainrate', params.mainchainrate, data.mainchainrate, 'critical',
      'Wrong rate = selling at wrong price');
  }

  // Status - dangerous
  if (params.status !== undefined) {
    if (!valuesEqual(data.status, params.status)) {
      addMismatch(result, 'status', params.status, data.status, 'dangerous',
        'Wrong status = dispenser open when should be closed or vice versa');
    }
  }

  // Open address - dangerous
  if (params.open_address && data.openAddress) {
    if (!valuesEqual(data.openAddress, params.open_address)) {
      addMismatch(result, 'open_address', params.open_address, data.openAddress, 'dangerous',
        'Wrong address = someone else can refill/control dispenser');
    }
  }

  // Oracle address - dangerous
  if (params.oracle_address && data.oracleAddress) {
    if (!valuesEqual(data.oracleAddress, params.oracle_address)) {
      addMismatch(result, 'oracle_address', params.oracle_address, data.oracleAddress, 'dangerous',
        'Wrong oracle = price determined by untrusted source');
    }
  }
}

/**
 * Verify cancel transaction
 */
function verifyCancel(
  data: CancelData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Offer hash - critical
  if (!valuesEqual(data.offerHash, params.offer_hash)) {
    addMismatch(result, 'offer_hash', params.offer_hash, data.offerHash, 'critical',
      'Wrong hash = cancelling wrong order/offer');
  }
}

/**
 * Verify destroy transaction
 */
function verifyDestroy(
  data: DestroyData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset = destroying wrong tokens');
  }

  // Quantity - critical
  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = destroying more than intended');
  }

  // Tag - informational
  if (params.tag !== undefined) {
    if (!valuesEqual(data.tag, params.tag)) {
      addMismatch(result, 'tag', params.tag, data.tag, 'informational',
        'Just a label, no financial impact');
    }
  }
}

/**
 * Verify sweep transaction
 */
function verifySweep(
  data: SweepData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Destination - critical
  if (!valuesEqual(data.destination, params.destination)) {
    addMismatch(result, 'destination', params.destination, data.destination, 'critical',
      'Wrong address = all assets sent to wrong recipient');
  }

  // Flags - dangerous
  if (!valuesEqual(data.flags, params.flags)) {
    addMismatch(result, 'flags', params.flags, data.flags, 'dangerous',
      'Controls what gets swept (balances, ownerships, etc.)');
  }

  // Memo - informational
  if (params.memo !== undefined) {
    if (!valuesEqual(data.memo, params.memo)) {
      addMismatch(result, 'memo', params.memo, data.memo, 'informational',
        'Just metadata, no direct financial impact');
    }
  }
}

/**
 * Verify issuance transaction
 */
function verifyIssuance(
  data: IssuanceData,
  params: Record<string, unknown>,
  result: VerificationResult
): void {
  // Asset - critical
  if (!valuesEqual(data.asset, params.asset)) {
    addMismatch(result, 'asset', params.asset, data.asset, 'critical',
      'Wrong asset name = creating/modifying wrong asset');
  }

  // Quantity - critical
  if (!valuesEqual(data.quantity, params.quantity)) {
    addMismatch(result, 'quantity', params.quantity, data.quantity, 'critical',
      'Wrong amount = issuing wrong supply');
  }

  // Divisible - dangerous (only check if specified, permanent on first issuance)
  if (params.divisible !== undefined) {
    if (!valuesEqual(data.divisible, params.divisible)) {
      addMismatch(result, 'divisible', params.divisible, data.divisible, 'dangerous',
        'PERMANENT: Cannot change divisibility after creation');
    }
  }

  // Lock - dangerous (permanent, locks supply forever)
  if (params.lock !== undefined && params.lock === true) {
    // If user requested lock=true, the transaction should be a lock/reset type
    if (!data.isLock) {
      addMismatch(result, 'lock', true, false, 'dangerous',
        'PERMANENT: Locks supply forever, cannot issue more');
    }
  } else if (params.lock === false && data.isLock) {
    // User didn't request lock but transaction would lock
    addMismatch(result, 'lock', false, true, 'dangerous',
      'PERMANENT: Locks supply forever, cannot issue more');
  }

  // Reset - dangerous (destructive, existing holders lose tokens)
  if (params.reset !== undefined && params.reset === true) {
    if (!data.isReset) {
      addMismatch(result, 'reset', true, false, 'dangerous',
        'DESTRUCTIVE: Resets asset, existing holders lose tokens');
    }
  } else if (params.reset === false && data.isReset) {
    addMismatch(result, 'reset', false, true, 'dangerous',
      'DESTRUCTIVE: Resets asset, existing holders lose tokens');
  }

  // Transfer destination - critical (if specified)
  if (params.transfer_destination) {
    // Note: transfer_destination is in the Bitcoin outputs, not OP_RETURN
    // We can't verify this from the unpacked message alone
    // This would need to be checked against the transaction outputs
  }

  // Description - informational
  if (params.description !== undefined) {
    if (!valuesEqual(data.description, params.description)) {
      addMismatch(result, 'description', params.description, data.description, 'informational',
        'Asset description, visible but not financial');
    }
  }
}

/**
 * Verify a composed transaction matches the request params.
 *
 * Supports two call signatures for backward compatibility:
 * - verifyTransaction(opReturnData, composeType, params) - new API
 * - verifyTransaction(opReturnData, { type, params }) - legacy API
 *
 * @param opReturnData - The OP_RETURN data from the transaction (hex or bytes)
 * @param composeTypeOrRequest - The compose type string OR a legacy request object
 * @param params - The params (only for new API)
 * @returns Verification result with any mismatches found
 */
export function verifyTransaction(
  opReturnData: string | Uint8Array,
  composeTypeOrRequest: VerifiableComposeType | string | ComposeRequest,
  params?: Record<string, unknown>
): VerificationResult {
  // Handle legacy API: verifyTransaction(data, { type, params })
  let composeType: string;
  let actualParams: Record<string, unknown>;

  if (typeof composeTypeOrRequest === 'object' && 'type' in composeTypeOrRequest) {
    // Legacy call signature
    composeType = composeTypeOrRequest.type;
    actualParams = composeTypeOrRequest.params;
  } else {
    // New call signature
    composeType = composeTypeOrRequest as string;
    actualParams = params || {};
  }
  const result: VerificationResult = {
    valid: false,
    criticalMismatches: [],
    dangerousMismatches: [],
    infoMismatches: [],
    errors: [],
    warnings: [],
    expected: actualParams,
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

  // Verify based on compose type
  switch (composeType) {
    case 'send':
    case 'enhanced_send':
      // Check message type matches
      if (unpacked.messageTypeId !== MessageTypeId.ENHANCED_SEND &&
          unpacked.messageTypeId !== MessageTypeId.SEND) {
        result.errors.push(`Message type mismatch: expected send, got ${unpacked.messageType}`);
        return result;
      }
      verifySend(unpacked.data as EnhancedSendData | SendData, actualParams, result);
      break;

    case 'order':
      if (unpacked.messageTypeId !== MessageTypeId.ORDER) {
        result.errors.push(`Message type mismatch: expected order, got ${unpacked.messageType}`);
        return result;
      }
      verifyOrder(unpacked.data as OrderData, actualParams, result);
      break;

    case 'dispenser':
      if (unpacked.messageTypeId !== MessageTypeId.DISPENSER) {
        result.errors.push(`Message type mismatch: expected dispenser, got ${unpacked.messageType}`);
        return result;
      }
      verifyDispenser(unpacked.data as DispenserData, actualParams, result);
      break;

    case 'cancel':
      if (unpacked.messageTypeId !== MessageTypeId.CANCEL) {
        result.errors.push(`Message type mismatch: expected cancel, got ${unpacked.messageType}`);
        return result;
      }
      verifyCancel(unpacked.data as CancelData, actualParams, result);
      break;

    case 'destroy':
      if (unpacked.messageTypeId !== MessageTypeId.DESTROY) {
        result.errors.push(`Message type mismatch: expected destroy, got ${unpacked.messageType}`);
        return result;
      }
      verifyDestroy(unpacked.data as DestroyData, actualParams, result);
      break;

    case 'sweep':
      if (unpacked.messageTypeId !== MessageTypeId.SWEEP) {
        result.errors.push(`Message type mismatch: expected sweep, got ${unpacked.messageType}`);
        return result;
      }
      verifySweep(unpacked.data as SweepData, actualParams, result);
      break;

    case 'issuance':
      if (unpacked.messageTypeId !== MessageTypeId.ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.SUBASSET_ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.LR_ISSUANCE &&
          unpacked.messageTypeId !== MessageTypeId.LR_SUBASSET) {
        result.errors.push(`Message type mismatch: expected issuance, got ${unpacked.messageType}`);
        return result;
      }
      verifyIssuance(unpacked.data as IssuanceData, actualParams, result);
      break;

    default:
      // Unknown compose type - can't verify, but don't fail
      result.warnings.push(`Unknown compose type: ${composeType}, skipping verification`);
      result.valid = true;
      return result;
  }

  // Transaction is valid if no critical or dangerous mismatches
  result.valid = result.criticalMismatches.length === 0 &&
                 result.dangerousMismatches.length === 0;

  return result;
}

/**
 * Legacy interface for backward compatibility
 */
export interface ComposeRequest {
  type: VerifiableComposeType;
  params: Record<string, unknown>;
}

/**
 * Legacy verify function for backward compatibility
 */
export function verifyTransactionLegacy(
  opReturnData: string | Uint8Array,
  request: ComposeRequest
): VerificationResult {
  return verifyTransaction(opReturnData, request.type, request.params);
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
