/**
 * Provider Transaction Verification
 *
 * Verifies Counterparty transactions from dApp/provider signing requests.
 * Compares local unpack results against API-decoded messages to detect
 * tampering or mismatches.
 */

import { addressesEqual } from '@/core/counterparty/unpack/address';
import { isCounterpartyData, type UnpackResult, unpackCounterpartyMessage } from '@/core/counterparty/unpack/index';
import type { AttachData, DetachData } from '@/core/counterparty/unpack/messages/attach';
import type { BroadcastData } from '@/core/counterparty/unpack/messages/broadcast';
import type { BTCPayData } from '@/core/counterparty/unpack/messages/btcpay';
import type { CancelData } from '@/core/counterparty/unpack/messages/cancel';
import type { DestroyData } from '@/core/counterparty/unpack/messages/destroy';
import type { DispenserData } from '@/core/counterparty/unpack/messages/dispenser';
import type { DividendData } from '@/core/counterparty/unpack/messages/dividend';
import type { EnhancedSendData } from '@/core/counterparty/unpack/messages/enhancedSend';
import type { FairmintData } from '@/core/counterparty/unpack/messages/fairmint';
import type { FairminterData } from '@/core/counterparty/unpack/messages/fairminter';
import type { IssuanceData } from '@/core/counterparty/unpack/messages/issuance';
import type { MPMAData } from '@/core/counterparty/unpack/messages/mpma';
import type { OrderData } from '@/core/counterparty/unpack/messages/order';
import type { PoolDepositData, PoolWithdrawData } from '@/core/counterparty/unpack/messages/pool';
import type { SendData } from '@/core/counterparty/unpack/messages/send';
import type { SweepData } from '@/core/counterparty/unpack/messages/sweep';
import { proveByRepack } from '@/core/counterparty/unpack/repackVerify';

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
  /** Whether verification passed (no critical mismatches). undefined = not attempted. */
  passed: boolean | undefined;
  /**
   * Whether a second decoding was actually compared against the local one.
   *
   * `passed: true` alone does not mean anything was cross-checked: when the API decode is
   * unavailable — a network error, a non-200, or a payload core rejects — there is nothing to
   * compare and a successful local unpack is all that happened. Reporting that as verified
   * overstates it precisely when the least checking occurred, so the display distinguishes the two.
   */
  comparedAgainstApi: boolean;
  /**
   * Whether the decode was rebuilt into the exact payload being signed.
   *
   * A stronger and more relevant claim than the API comparison above, which reads the same bytes
   * from a second decoder and so can only vouch for this project's unpacker. See repackVerify.ts.
   */
  repackProved: boolean;
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
  if (!a) return false;
  if (b === undefined || b === null) return false;

  // Core resolves an asset name through a ledger lookup, and `get_asset_name` returns 0 for an
  // asset the node does not know (ledger/issuances.py). That is an absence of information, not a
  // disagreement — 0 is not a valid asset name and cannot be what the bytes say. Treating it as a
  // mismatch blocked signing on the state of a node's index rather than on the transaction: an
  // order, destroy or dividend naming an asset the queried node had not indexed reported
  // tampering. Same shape as the rounding-induced false block fixed earlier — an API limitation
  // rendered as an accusation.
  //
  // Checked before the falsy guard and stringified, because the endpoint serializes the marker as
  // the NUMBER 0: it is falsy, so a guard placed after `!b` never sees it, and this parameter is
  // typed string but is not always one at runtime. Both facts found by the differential fuzzer.
  if (String(b) === '0') return true;

  if (!b) return false;
  return a.toUpperCase() === String(b).toUpperCase();
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
/**
 * Detach carries a single field — where the assets leave the UTXO to. A wrong
 * destination sends them to an address the signer does not control, so this is
 * exactly the comparison worth making, not one to skip.
 */
function verifyDetach(
  local: DetachData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiDest = getApiValue(api, 'destination', 'address') as string | undefined;
  // "0" is the protocol's stand-in for "back to the sender", which the API
  // renders as the resolved address — not a mismatch.
  if (apiDest && local.destination !== '0' && !addressesEqual(local.destination, apiDest)) {
    mismatches.push(`Destination: local="${local.destination}", API="${apiDest}"`);
  }

  return mismatches;
}

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
/**
 * Returns null when the API payload offers nothing to compare against, which is different from
 * comparing and finding nothing wrong. Previously both cases returned an empty mismatch list, so
 * an mpma_send that was never checked reported the same "no tampering detected" as one that
 * passed every field.
 */
function verifyMPMA(
  local: MPMAData,
  api: Record<string, unknown>
): string[] | null {
  const mismatches: string[] = [];

  // `/v2/transactions/unpack` returns mpma_send message_data as a bare array of sends rather than
  // an object, so the keyed lookup finds nothing; an array is still read here for API shapes that
  // do wrap it.
  const apiSends = (Array.isArray(api)
    ? api
    : getApiValue(api, 'sends', 'destinations')) as Array<Record<string, unknown>> | undefined;

  if (!apiSends || !Array.isArray(apiSends) || apiSends.length === 0) {
    return null;
  }

  // The endpoint returns exactly one send no matter how many the message carries — a two-send and
  // a three-send MPMA both come back with the first send alone. Treating that as a count mismatch
  // would block every legitimate multi-destination send, so a short list is reported as "nothing
  // compared" rather than as tampering. The API can only ever add confidence here: the recipients
  // on screen are read from the bytes, not from this response.
  if (local.sends.length !== apiSends.length) {
    return null;
  }

  // Verify each send
  for (let i = 0; i < local.sends.length; i++) {
    const localSend = local.sends[i]!;
    const apiSend = apiSends[i]!;

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

  const apiMaxMintPerAddress = getApiValue(api, 'max_mint_per_address', 'maxMintPerAddress');
  if (apiMaxMintPerAddress !== undefined && !quantitiesEqual(local.maxMintPerAddress, apiMaxMintPerAddress)) {
    mismatches.push(`Max mint per address: local=${local.maxMintPerAddress}, API=${apiMaxMintPerAddress}`);
  }

  const apiPoolQuantity = getApiValue(api, 'pool_quantity', 'poolQuantity');
  if (apiPoolQuantity !== undefined && !quantitiesEqual(local.poolQuantity, apiPoolQuantity)) {
    mismatches.push(`Pool quantity: local=${local.poolQuantity}, API=${apiPoolQuantity}`);
  }

  const apiLpAsset = getApiValue(api, 'lp_asset', 'lpAsset') as string | null | undefined;
  if (apiLpAsset !== undefined && local.lpAsset !== apiLpAsset) {
    mismatches.push(`LP asset: local=${local.lpAsset}, API=${apiLpAsset}`);
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

  const apiVout = getApiValue(api, 'destination_vout', 'destinationVout') as number | null | undefined;
  if (apiVout != null && local.destinationVout !== apiVout) {
    mismatches.push(`Destination vout: local=${local.destinationVout}, API=${apiVout}`);
  }

  return mismatches;
}

function verifyPoolDeposit(
  local: PoolDepositData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiAssetA = getApiValue(api, 'asset_a', 'assetA') as string | undefined;
  if (apiAssetA && !assetsEqual(local.assetA, apiAssetA)) {
    mismatches.push(`Asset A: local="${local.assetA}", API="${apiAssetA}"`);
  }

  const apiAssetB = getApiValue(api, 'asset_b', 'assetB') as string | undefined;
  if (apiAssetB && !assetsEqual(local.assetB, apiAssetB)) {
    mismatches.push(`Asset B: local="${local.assetB}", API="${apiAssetB}"`);
  }

  const apiQuantityA = getApiValue(api, 'quantity_a', 'quantityA');
  if (apiQuantityA !== undefined && !quantitiesEqual(local.quantityA, apiQuantityA)) {
    mismatches.push(`Quantity A: local=${local.quantityA}, API=${apiQuantityA}`);
  }

  const apiQuantityB = getApiValue(api, 'quantity_b', 'quantityB');
  if (apiQuantityB !== undefined && !quantitiesEqual(local.quantityB, apiQuantityB)) {
    mismatches.push(`Quantity B: local=${local.quantityB}, API=${apiQuantityB}`);
  }

  const apiMinLp = getApiValue(api, 'min_lp_quantity', 'minLpQuantity');
  if (apiMinLp !== undefined && !quantitiesEqual(local.minLpQuantity, apiMinLp)) {
    mismatches.push(`Min LP quantity: local=${local.minLpQuantity}, API=${apiMinLp}`);
  }

  // The LP asset decides which token the deposit pays out, so leaving it uncompared meant the one
  // field naming what you receive was the one field never checked.
  const apiLpAsset = getApiValue(api, 'lp_asset', 'lpAsset') as string | undefined;
  if (apiLpAsset && local.lpAsset && !assetsEqual(local.lpAsset, apiLpAsset)) {
    mismatches.push(`LP asset: local="${local.lpAsset}", API="${apiLpAsset}"`);
  }

  return mismatches;
}

function verifyPoolWithdraw(
  local: PoolWithdrawData,
  api: Record<string, unknown>
): string[] {
  const mismatches: string[] = [];

  const apiAssetA = getApiValue(api, 'asset_a', 'assetA') as string | undefined;
  if (apiAssetA && !assetsEqual(local.assetA, apiAssetA)) {
    mismatches.push(`Asset A: local="${local.assetA}", API="${apiAssetA}"`);
  }

  const apiAssetB = getApiValue(api, 'asset_b', 'assetB') as string | undefined;
  if (apiAssetB && !assetsEqual(local.assetB, apiAssetB)) {
    mismatches.push(`Asset B: local="${local.assetB}", API="${apiAssetB}"`);
  }

  if (api.quantity !== undefined && !quantitiesEqual(local.quantity, api.quantity)) {
    mismatches.push(`Quantity: local=${local.quantity}, API=${api.quantity}`);
  }

  const apiMinA = getApiValue(api, 'min_quantity_a', 'minQuantityA');
  if (apiMinA !== undefined && !quantitiesEqual(local.minQuantityA, apiMinA)) {
    mismatches.push(`Min quantity A: local=${local.minQuantityA}, API=${apiMinA}`);
  }

  const apiMinB = getApiValue(api, 'min_quantity_b', 'minQuantityB');
  if (apiMinB !== undefined && !quantitiesEqual(local.minQuantityB, apiMinB)) {
    mismatches.push(`Min quantity B: local=${local.minQuantityB}, API=${apiMinB}`);
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
  // No OP_RETURN data or not recognizable Counterparty data — skip verification
  if (!opReturnData || !isCounterpartyData(opReturnData)) {
    return {
      passed: undefined,
      comparedAgainstApi: false,
      repackProved: false,
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
      comparedAgainstApi: false,
      repackProved: false,
      warning: localUnpack.error || 'Failed to unpack transaction locally',
      mismatches: ['Local unpack failed'],
      localUnpack,
    };
  }

  // Nothing to compare against: the message decoded locally, but no second opinion was obtained.
  // Not a failure — the transaction is not blocked — but the display must not call it verified.
  if (!apiMessage) {
    return {
      passed: true,
      comparedAgainstApi: false,
      repackProved: false,
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

  // Verify specific fields based on message type.
  //
  // Whether any payload field was actually compared, as opposed to the type and
  // type ID matching and the switch falling through. Reporting a pass as
  // "compared against the API" when no comparator ran overstates the check
  // precisely where the least of it happened, which is what this flag exists to
  // prevent.
  let payloadCompared = true;
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

    case 'mpma_send': {
      const mpmaMismatches = verifyMPMA(localUnpack.data as MPMAData, apiData);
      if (mpmaMismatches === null) {
        payloadCompared = false;
      } else {
        mismatches.push(...mpmaMismatches);
      }
      break;
    }

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
      mismatches.push(...verifyAttach(localUnpack.data as AttachData, apiData));
      break;

    case 'pooldeposit':
      mismatches.push(...verifyPoolDeposit(localUnpack.data as PoolDepositData, apiData));
      break;

    case 'poolwithdraw':
      mismatches.push(...verifyPoolWithdraw(localUnpack.data as PoolWithdrawData, apiData));
      break;

    case 'detach':
      mismatches.push(...verifyDetach(localUnpack.data as DetachData, apiData));
      break;

    case 'dispense':
      // A dispense payload is a marker byte: core's unpack returns only { data },
      // so there is no field to compare. Which dispenser is triggered lives in
      // the outputs, which the approval screen shows directly.
      payloadCompared = false;
      break;

    default:
      // No comparator for this type in this build. The type and type ID above
      // still matched, but no payload field was checked.
      payloadCompared = false;
      break;
  }

  const passed = mismatches.length === 0;

  // Independent of everything above: rebuild the decode into bytes and compare with the payload.
  // Needs no network and cannot be swayed by any remote party, so it holds even when the API
  // decode is missing entirely.
  const repack = proveByRepack(localUnpack.messageType, localUnpack.data, opReturnData);

  return {
    passed,
    comparedAgainstApi: payloadCompared,
    repackProved: repack.proved,
    warning: passed ? undefined : `Verification failed: ${mismatches.join('; ')}`,
    mismatches,
    localUnpack,
  };
}
