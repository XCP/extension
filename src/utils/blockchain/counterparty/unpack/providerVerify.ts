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
import type { DestroyData } from './messages/destroy';
import type { SweepData } from './messages/sweep';
import type { IssuanceData } from './messages/issuance';
import type { MPMAData } from './messages/mpma';
import type { BTCPayData } from './messages/btcpay';
import type { BroadcastData } from './messages/broadcast';
import type { DividendData } from './messages/dividend';
import type { FairminterData } from './messages/fairminter';
import type { FairmintData } from './messages/fairmint';
import type { AttachData } from './messages/attach';

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
 * Get a value from an object with multiple possible keys
 */
function getApiValue(api: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (api[key] !== undefined) return api[key];
  }
  return undefined;
}

/**
 * Verify an enhanced_send message
 */
function verifyEnhancedSend(
  local: EnhancedSendData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  if (!quantitiesEqual(local.quantity, api.quantity)) {
    mismatches.push(`Quantity: local=${local.quantity}, API=${api.quantity}`);
  }

  const apiDest = getApiValue(api, 'destination', 'address') as string | undefined;
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

  const apiGiveAsset = getApiValue(api, 'give_asset', 'giveAsset') as string | undefined;
  if (!assetsEqual(local.giveAsset, apiGiveAsset)) {
    mismatches.push(`Give asset: local="${local.giveAsset}", API="${apiGiveAsset}"`);
  }

  const apiGiveQty = getApiValue(api, 'give_quantity', 'giveQuantity');
  if (!quantitiesEqual(local.giveQuantity, apiGiveQty)) {
    mismatches.push(`Give quantity: local=${local.giveQuantity}, API=${apiGiveQty}`);
  }

  const apiGetAsset = getApiValue(api, 'get_asset', 'getAsset') as string | undefined;
  if (!assetsEqual(local.getAsset, apiGetAsset)) {
    mismatches.push(`Get asset: local="${local.getAsset}", API="${apiGetAsset}"`);
  }

  const apiGetQty = getApiValue(api, 'get_quantity', 'getQuantity');
  if (!quantitiesEqual(local.getQuantity, apiGetQty)) {
    mismatches.push(`Get quantity: local=${local.getQuantity}, API=${apiGetQty}`);
  }

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

  const apiGiveQty = getApiValue(api, 'give_quantity', 'giveQuantity');
  if (!quantitiesEqual(local.giveQuantity, apiGiveQty)) {
    mismatches.push(`Give quantity: local=${local.giveQuantity}, API=${apiGiveQty}`);
  }

  const apiEscrowQty = getApiValue(api, 'escrow_quantity', 'escrowQuantity');
  if (!quantitiesEqual(local.escrowQuantity, apiEscrowQty)) {
    mismatches.push(`Escrow quantity: local=${local.escrowQuantity}, API=${apiEscrowQty}`);
  }

  const apiRate = getApiValue(api, 'mainchainrate', 'satoshirate');
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

  const apiHash = getApiValue(api, 'offer_hash', 'offerHash', 'tx_hash', 'txHash') as string | undefined;
  if (apiHash && local.offerHash.toLowerCase() !== apiHash.toLowerCase()) {
    mismatches.push(`Offer hash: local="${local.offerHash}", API="${apiHash}"`);
  }

  return mismatches;
}

/**
 * Verify a destroy message
 */
function verifyDestroy(
  local: DestroyData,
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
 * Verify a sweep message
 */
function verifySweep(
  local: SweepData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiDest = getApiValue(api, 'destination', 'address') as string | undefined;
  if (apiDest && !addressesEqual(local.destination, apiDest)) {
    mismatches.push(`Destination: local="${local.destination}", API="${apiDest}"`);
  }

  if (api.flags !== undefined && local.flags !== api.flags) {
    mismatches.push(`Flags: local=${local.flags}, API=${api.flags}`);
  }

  return mismatches;
}

/**
 * Verify an issuance message
 */
function verifyIssuance(
  local: IssuanceData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiAsset = getApiValue(api, 'asset', 'asset_name') as string | undefined;
  if (!assetsEqual(local.asset, apiAsset)) {
    mismatches.push(`Asset: local="${local.asset}", API="${apiAsset}"`);
  }

  if (!quantitiesEqual(local.quantity, api.quantity)) {
    mismatches.push(`Quantity: local=${local.quantity}, API=${api.quantity}`);
  }

  if (api.divisible !== undefined && local.divisible !== api.divisible) {
    mismatches.push(`Divisible: local=${local.divisible}, API=${api.divisible}`);
  }

  const apiLock = getApiValue(api, 'lock', 'locked');
  if (apiLock !== undefined && local.isLock !== apiLock) {
    mismatches.push(`Lock: local=${local.isLock}, API=${apiLock}`);
  }

  const apiReset = getApiValue(api, 'reset');
  if (apiReset !== undefined && local.isReset !== apiReset) {
    mismatches.push(`Reset: local=${local.isReset}, API=${apiReset}`);
  }

  return mismatches;
}

/**
 * Verify an MPMA send message
 */
function verifyMPMA(
  local: MPMAData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  // API may return sends as an array
  const apiSends = getApiValue(api, 'sends', 'destinations') as Array<Record<string, unknown>> | undefined;

  if (!apiSends || !Array.isArray(apiSends)) {
    // Can't verify individual sends without API data
    return mismatches;
  }

  if (local.sends.length !== apiSends.length) {
    mismatches.push(`Send count: local=${local.sends.length}, API=${apiSends.length}`);
    return mismatches;
  }

  // Verify each send
  for (let i = 0; i < local.sends.length; i++) {
    const localSend = local.sends[i];
    const apiSend = apiSends[i];

    if (!assetsEqual(localSend.asset, apiSend.asset as string)) {
      mismatches.push(`Send[${i}] asset: local="${localSend.asset}", API="${apiSend.asset}"`);
    }

    if (!quantitiesEqual(localSend.quantity, apiSend.quantity)) {
      mismatches.push(`Send[${i}] quantity: local=${localSend.quantity}, API=${apiSend.quantity}`);
    }

    const apiDest = getApiValue(apiSend, 'destination', 'address') as string | undefined;
    if (apiDest && !addressesEqual(localSend.destination, apiDest)) {
      mismatches.push(`Send[${i}] destination: local="${localSend.destination}", API="${apiDest}"`);
    }
  }

  return mismatches;
}

/**
 * Verify a BTCPay message
 */
function verifyBTCPay(
  local: BTCPayData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiOrderMatchId = getApiValue(api, 'order_match_id', 'orderMatchId') as string | undefined;
  if (apiOrderMatchId && local.orderMatchId.toLowerCase() !== apiOrderMatchId.toLowerCase()) {
    mismatches.push(`Order match ID: local="${local.orderMatchId}", API="${apiOrderMatchId}"`);
  }

  return mismatches;
}

/**
 * Verify a broadcast message
 */
function verifyBroadcast(
  local: BroadcastData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (api.timestamp !== undefined && local.timestamp !== api.timestamp) {
    mismatches.push(`Timestamp: local=${local.timestamp}, API=${api.timestamp}`);
  }

  if (api.value !== undefined) {
    const apiValue = typeof api.value === 'number' ? api.value : parseFloat(api.value as string);
    if (Math.abs(local.value - apiValue) > 0.0001) {
      mismatches.push(`Value: local=${local.value}, API=${apiValue}`);
    }
  }

  const apiFee = getApiValue(api, 'fee_fraction', 'fee_fraction_int', 'feeFractionInt');
  if (apiFee !== undefined && !quantitiesEqual(local.feeFractionInt, apiFee)) {
    mismatches.push(`Fee fraction: local=${local.feeFractionInt}, API=${apiFee}`);
  }

  return mismatches;
}

/**
 * Verify a dividend message
 */
function verifyDividend(
  local: DividendData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  const apiQtyPerUnit = getApiValue(api, 'quantity_per_unit', 'quantityPerUnit');
  if (!quantitiesEqual(local.quantityPerUnit, apiQtyPerUnit)) {
    mismatches.push(`Quantity per unit: local=${local.quantityPerUnit}, API=${apiQtyPerUnit}`);
  }

  const apiDivAsset = getApiValue(api, 'dividend_asset', 'dividendAsset') as string | undefined;
  if (apiDivAsset && !assetsEqual(local.dividendAsset, apiDivAsset)) {
    mismatches.push(`Dividend asset: local="${local.dividendAsset}", API="${apiDivAsset}"`);
  }

  return mismatches;
}

/**
 * Verify a fairminter message
 */
function verifyFairminter(
  local: FairminterData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  if (!quantitiesEqual(local.price, api.price)) {
    mismatches.push(`Price: local=${local.price}, API=${api.price}`);
  }

  const apiQtyByPrice = getApiValue(api, 'quantity_by_price', 'quantityByPrice');
  if (!quantitiesEqual(local.quantityByPrice, apiQtyByPrice)) {
    mismatches.push(`Quantity by price: local=${local.quantityByPrice}, API=${apiQtyByPrice}`);
  }

  const apiHardCap = getApiValue(api, 'hard_cap', 'hardCap');
  if (apiHardCap !== undefined && !quantitiesEqual(local.hardCap, apiHardCap)) {
    mismatches.push(`Hard cap: local=${local.hardCap}, API=${apiHardCap}`);
  }

  if (api.divisible !== undefined && local.divisible !== api.divisible) {
    mismatches.push(`Divisible: local=${local.divisible}, API=${api.divisible}`);
  }

  return mismatches;
}

/**
 * Verify a fairmint message
 */
function verifyFairmint(
  local: FairmintData,
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
 * Verify an attach/detach message
 */
function verifyAttach(
  local: AttachData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  if (!assetsEqual(local.asset, api.asset as string)) {
    mismatches.push(`Asset: local="${local.asset}", API="${api.asset}"`);
  }

  if (!quantitiesEqual(local.quantity, api.quantity)) {
    mismatches.push(`Quantity: local=${local.quantity}, API=${api.quantity}`);
  }

  const apiVout = getApiValue(api, 'destination_vout', 'destinationVout') as number | undefined;
  if (apiVout !== undefined && local.destinationVout !== apiVout) {
    mismatches.push(`Destination vout: local=${local.destinationVout}, API=${apiVout}`);
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

    case 'destroy':
      mismatches.push(...verifyDestroy(localUnpack.data as DestroyData, apiData));
      break;

    case 'sweep':
      mismatches.push(...verifySweep(localUnpack.data as SweepData, apiData));
      break;

    case 'issuance':
    case 'subasset_issuance':
    case 'lr_issuance':
    case 'lr_subasset':
      mismatches.push(...verifyIssuance(localUnpack.data as IssuanceData, apiData));
      break;

    case 'mpma_send':
      mismatches.push(...verifyMPMA(localUnpack.data as MPMAData, apiData));
      break;

    case 'btcpay':
      mismatches.push(...verifyBTCPay(localUnpack.data as BTCPayData, apiData));
      break;

    case 'broadcast':
      mismatches.push(...verifyBroadcast(localUnpack.data as BroadcastData, apiData));
      break;

    case 'dividend':
      mismatches.push(...verifyDividend(localUnpack.data as DividendData, apiData));
      break;

    case 'fairminter':
      mismatches.push(...verifyFairminter(localUnpack.data as FairminterData, apiData));
      break;

    case 'fairmint':
      mismatches.push(...verifyFairmint(localUnpack.data as FairmintData, apiData));
      break;

    case 'attach':
    case 'detach':
      mismatches.push(...verifyAttach(localUnpack.data as AttachData, apiData));
      break;

    case 'dispense':
      // Dispense has minimal payload - just a marker byte
      // Verification is at the transaction level (destination/amount)
      break;

    default:
      // Unknown message type - type match check is done above
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
