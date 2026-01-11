/**
 * Provider Transaction Verification
 *
 * Verifies Counterparty transactions from dApp/provider signing requests.
 * Compares local unpack results against API-decoded messages to detect
 * tampering or mismatches.
 */

import { unpackCounterpartyMessage, isCounterpartyData, type UnpackResult } from './index';
import { addressesEqual } from './address';
import type { EnhancedSendData } from './messages/enhancedSend';
import type { OrderData } from './messages/order';
import type { DispenserData } from './messages/dispenser';
import type { CancelData } from './messages/cancel';
import type { SendData } from './messages/send';

/**
 * API-decoded Counterparty message (from decodeCounterpartyMessage)
 */
export interface ApiCounterpartyMessage {
  messageType: string;
  messageTypeId: number;
  messageData: Record<string, unknown>;
  description: string;
}

/**
 * Result of provider transaction verification
 */
export interface ProviderVerificationResult {
  /** Whether verification passed (no critical mismatches) */
  passed: boolean;
  /** Warning message if verification failed or had issues */
  warning?: string;
  /** Detailed list of mismatches found */
  mismatches: string[];
  /** The locally unpacked message data */
  localUnpack?: UnpackResult;
}

/**
 * Normalize a value to bigint for comparison
 */
function toBigInt(value: unknown): bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.floor(value));
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Compare two quantities (handles bigint, number, string)
 */
function quantitiesEqual(a: unknown, b: unknown): boolean {
  const aBig = toBigInt(a);
  const bBig = toBigInt(b);
  if (aBig === null || bBig === null) return false;
  return aBig === bBig;
}

/**
 * Compare two asset names (case-insensitive)
 */
function assetsEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toUpperCase() === b.toUpperCase();
}

/**
 * Verify an enhanced_send message
 */
function verifyEnhancedSend(
  local: EnhancedSendData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  // Check asset
  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  // Check quantity
  if (!quantitiesEqual(local.quantity, api.quantity)) {
    mismatches.push(`Quantity: local=${local.quantity}, API=${api.quantity}`);
  }

  // Check destination
  const apiDest = (api.destination || api.address) as string | undefined;
  if (apiDest && !addressesEqual(local.destination, apiDest)) {
    mismatches.push(`Destination: local="${local.destination}", API="${apiDest}"`);
  }

  return mismatches;
}

/**
 * Verify a send message (legacy send)
 */
function verifySend(
  local: SendData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  if (!quantitiesEqual(local.quantity, api.quantity)) {
    mismatches.push(`Quantity: local=${local.quantity}, API=${api.quantity}`);
  }

  return mismatches;
}

/**
 * Verify an order message
 */
function verifyOrder(
  local: OrderData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  // Give asset/quantity
  const apiGiveAsset = (api.give_asset || api.giveAsset) as string | undefined;
  if (!assetsEqual(local.giveAsset, apiGiveAsset)) {
    mismatches.push(`Give asset: local="${local.giveAsset}", API="${apiGiveAsset}"`);
  }

  const apiGiveQty = api.give_quantity ?? api.giveQuantity;
  if (!quantitiesEqual(local.giveQuantity, apiGiveQty)) {
    mismatches.push(`Give quantity: local=${local.giveQuantity}, API=${apiGiveQty}`);
  }

  // Get asset/quantity
  const apiGetAsset = (api.get_asset || api.getAsset) as string | undefined;
  if (!assetsEqual(local.getAsset, apiGetAsset)) {
    mismatches.push(`Get asset: local="${local.getAsset}", API="${apiGetAsset}"`);
  }

  const apiGetQty = api.get_quantity ?? api.getQuantity;
  if (!quantitiesEqual(local.getQuantity, apiGetQty)) {
    mismatches.push(`Get quantity: local=${local.getQuantity}, API=${apiGetQty}`);
  }

  // Expiration
  if (api.expiration !== undefined && local.expiration !== api.expiration) {
    mismatches.push(`Expiration: local=${local.expiration}, API=${api.expiration}`);
  }

  return mismatches;
}

/**
 * Verify a dispenser message
 */
function verifyDispenser(
  local: DispenserData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  const apiGiveQty = api.give_quantity ?? api.giveQuantity;
  if (!quantitiesEqual(local.giveQuantity, apiGiveQty)) {
    mismatches.push(`Give quantity: local=${local.giveQuantity}, API=${apiGiveQty}`);
  }

  const apiEscrowQty = api.escrow_quantity ?? api.escrowQuantity;
  if (!quantitiesEqual(local.escrowQuantity, apiEscrowQty)) {
    mismatches.push(`Escrow quantity: local=${local.escrowQuantity}, API=${apiEscrowQty}`);
  }

  const apiRate = api.mainchainrate ?? api.satoshirate;
  if (!quantitiesEqual(local.mainchainrate, apiRate)) {
    mismatches.push(`Rate: local=${local.mainchainrate}, API=${apiRate}`);
  }

  return mismatches;
}

/**
 * Verify a cancel message
 */
function verifyCancel(
  local: CancelData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiHash = (api.offer_hash || api.offerHash || api.tx_hash || api.txHash) as string | undefined;
  if (apiHash && local.offerHash.toLowerCase() !== apiHash.toLowerCase()) {
    mismatches.push(`Offer hash: local="${local.offerHash}", API="${apiHash}"`);
  }

  return mismatches;
}

/**
 * Verify a provider transaction by comparing local unpack against API decode.
 *
 * @param opReturnData - OP_RETURN data from the transaction (hex string)
 * @param apiMessage - Optional API-decoded Counterparty message for comparison
 * @returns Verification result with any mismatches found
 */
export function verifyProviderTransaction(
  opReturnData: string | undefined,
  apiMessage?: ApiCounterpartyMessage
): ProviderVerificationResult {
  // No OP_RETURN data - not a Counterparty transaction
  if (!opReturnData) {
    return {
      passed: true,
      mismatches: [],
      warning: undefined,
    };
  }

  // Check if it's Counterparty data
  if (!isCounterpartyData(opReturnData)) {
    return {
      passed: true,
      mismatches: [],
      warning: undefined,
    };
  }

  // Unpack locally
  const localUnpack = unpackCounterpartyMessage(opReturnData);

  // If local unpack failed, that's a verification failure
  if (!localUnpack.success || !localUnpack.data) {
    return {
      passed: false,
      warning: localUnpack.error || 'Failed to unpack transaction locally',
      mismatches: ['Local unpack failed'],
      localUnpack,
    };
  }

  // If no API message to compare against, local unpack success is enough
  if (!apiMessage) {
    return {
      passed: true,
      mismatches: [],
      localUnpack,
    };
  }

  const mismatches: string[] = [];

  // Check message type matches
  if (localUnpack.messageType !== apiMessage.messageType) {
    mismatches.push(
      `Message type: local="${localUnpack.messageType}", API="${apiMessage.messageType}"`
    );
  }

  // Check message type ID matches
  if (localUnpack.messageTypeId !== apiMessage.messageTypeId) {
    mismatches.push(
      `Message type ID: local=${localUnpack.messageTypeId}, API=${apiMessage.messageTypeId}`
    );
  }

  // Verify specific fields based on message type
  const apiData = apiMessage.messageData;

  switch (localUnpack.messageType) {
    case 'enhanced_send':
      mismatches.push(...verifyEnhancedSend(localUnpack.data as EnhancedSendData, apiData));
      break;

    case 'send':
      mismatches.push(...verifySend(localUnpack.data as SendData, apiData));
      break;

    case 'order':
      mismatches.push(...verifyOrder(localUnpack.data as OrderData, apiData));
      break;

    case 'dispenser':
      mismatches.push(...verifyDispenser(localUnpack.data as DispenserData, apiData));
      break;

    case 'cancel':
      mismatches.push(...verifyCancel(localUnpack.data as CancelData, apiData));
      break;

    // For other message types, just check type match (already done above)
    default:
      break;
  }

  const passed = mismatches.length === 0;

  return {
    passed,
    warning: passed ? undefined : `Verification failed: ${mismatches.join('; ')}`,
    mismatches,
    localUnpack,
  };
}
