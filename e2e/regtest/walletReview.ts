/**
 * What the wallet tells the user a transaction will do, computed by the functions its screens use.
 *
 * Two surfaces, both reproduced from production code rather than re-derived:
 *
 * - `composeAsWallet` runs the in-wallet compose flow as `contexts/composer-context.tsx` does it:
 *   normalize the form, compose through the production composer, read the message back out of the
 *   bytes, rebuild or field-check it, bound the fee, account for every output, and overlay the
 *   verified review params. `reviewPageFacts` then reads the result the way each
 *   `pages/compose/.../review.tsx` does, field for field, into the values that page displays.
 * - `approvalReview` runs the approval path a site's request takes
 *   (`decodeTransactionForApproval` then `getTxActionInfo`), which is also where the shared
 *   describer, the protocol context (dispense payouts, attach fees, detached assets, cancelled
 *   orders, destroy supply) and the MPMA recipient list come from.
 *
 * The composer context is a React component, so its compose step cannot be called directly; the
 * steps below follow it in order and cite it. Anything that step does not do (the ZELD hunt,
 * script-payment caution, replay records) changes no fact this suite compares.
 */

import { getTxActionInfo, normalizeQuantity } from '@/components/domain/tx/tx-action-info';
import { checkTransactionFee } from '@/core/bitcoin/feeVerification';
import { type DecodedTransactionInfo, decodeTransactionForApproval } from '@/core/bitcoin/transactionApprovalDecoder';
import { clearApiCache, fetchAllAddressDispensers, fetchAssetFairminter, fetchOrderMatch } from '@/core/counterparty/api';
import { btcPayPayment } from '@/core/counterparty/btcpayPayment';
import type { ApiResponse } from '@/core/counterparty/compose';
import { calculateDispensePayouts, describePayout } from '@/core/counterparty/dispenseOutcome';
import { describeFairminterPaymentModel, getFairmintCost, isPaidFairminter, readFairminterPaymentModel } from '@/core/counterparty/fairminterModel';
import { normalizeFormData, verifiedReviewParams } from '@/core/counterparty/normalize';
import { checkOutputPolicy, type IntendedDestination, pinnedDestinations, withPinnedDestinations } from '@/core/counterparty/outputPolicy';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { chooseComposeEncoding, composeWithEncoding } from '@/core/counterparty/taprootEncoding';
import { fetchInputValues } from '@/core/counterparty/transaction';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { packAddress } from '@/core/counterparty/unpack/address';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { extractCounterpartyPayload } from '@/core/counterparty/unpack/opReturn';
import { verifyTransaction } from '@/core/counterparty/unpack/verify';
import { formatAmount } from '@/core/format';
import { divide, fromSatoshis, roundDown, toBigNumber } from '@/core/numeric';
import type { RegtestKey } from './regtestHarness';
import { resolveRegtestPrevout } from './regtestHarness';
import { toMainnet } from './walletTransport';

export type ComposeApi = (data: any) => Promise<ApiResponse>;

/** A wallet address: the mainnet spelling of a throwaway key, as the wallet holds it. */
export function walletAddress(key: RegtestKey): string {
  return toMainnet(key.address);
}

export interface WalletCompose {
  composeType: string;
  /** The response as the review page receives it: fee recomputed, verified params overlaid. */
  response: ApiResponse;
  /** What the form submitted, normalized, as sent to the composer. */
  dataForApi: Record<string, unknown>;
  /** The message read out of the transaction's own bytes (`state.decodedMessage`). */
  decodedMessage: { messageType: string; data: Record<string, unknown> } | null;
  /** Differences too small to block, as the review screen would list them. */
  verificationWarnings: string[];
}

/** Every Bitcoin address named anywhere in the request; `composer-context.tsx` `addressesNamedIn`. */
function addressesNamedIn(params: Record<string, unknown>): string[] {
  const addresses: string[] = [];
  for (const value of Object.values(params)) {
    if (typeof value !== 'string') continue;
    for (const candidate of value.split(/[,:\s]+/).map(part => part.trim()).filter(Boolean)) {
      try {
        packAddress(candidate);
        addresses.push(candidate);
      } catch {
        // not an address
      }
    }
  }
  return addresses;
}

/**
 * The in-wallet compose flow, step for step as `composer-context.tsx` `compose` runs it, for an
 * address holding no Taproot-encoded message (every message here fits an OP_RETURN).
 */
export async function composeAsWallet(
  composeType: string,
  composeApi: ComposeApi,
  form: Record<string, string>,
  key: RegtestKey,
  satPerVbyte = '2',
): Promise<WalletCompose> {
  clearApiCache();
  const source = walletAddress(key);
  const formData = new FormData();
  for (const [name, value] of Object.entries({ ...form, sat_per_vbyte: satPerVbyte })) formData.set(name, value);

  const { normalizedData, assetInfoCache } = await normalizeFormData(formData, composeType);
  const dataForApi: Record<string, unknown> = { ...normalizedData, sourceAddress: source };

  const encoding = chooseComposeEncoding(composeType, dataForApi, source);
  if (encoding === 'taproot') throw new Error(`${composeType} chose Taproot encoding; this suite covers OP_RETURN composes only`);
  let response = await composeWithEncoding(composeApi, dataForApi, encoding);
  if (!response?.result?.rawtransaction) throw new Error(`${composeType}: the composer returned no transaction`);

  const counterpartyData = extractCounterpartyPayload(response.result.rawtransaction);
  let decodedMessage: WalletCompose['decodedMessage'] = null;
  const verificationWarnings: string[] = [];
  if (counterpartyData) {
    const unpacked = unpackCounterpartyMessage(counterpartyData);
    if (unpacked.success && unpacked.messageType && unpacked.data) {
      decodedMessage = { messageType: unpacked.messageType, data: unpacked.data as Record<string, unknown> };
    }
    const expected = packComposeMessage(composeType, dataForApi, decodedMessage?.data);
    if (expected) {
      if (bytesToHex(expected.bytes).toLowerCase() !== counterpartyData.toLowerCase()) {
        throw new Error(`${composeType}: the composed message differs from the one this request should produce `
          + `(expected ${bytesToHex(expected.bytes)}, composed ${counterpartyData})`);
      }
    } else {
      const verification = verifyTransaction(counterpartyData, composeType, dataForApi);
      if (!verification.valid) throw new Error(`${composeType}: verification failed: ${verification.errors.join('; ')}`);
      verificationWarnings.push(...verification.warnings);
    }
  } else if (packComposeMessage(composeType, dataForApi)) {
    throw new Error(`${composeType}: the composed transaction carries no message`);
  }

  const feeCheck = await checkTransactionFee(
    { rawTransaction: response.result.rawtransaction, userFeeRate: dataForApi.sat_per_vbyte as string },
    fetchInputValues,
  );
  if (!feeCheck.ok) throw new Error(`${composeType}: fee check failed: ${feeCheck.error}`);
  if (feeCheck.computedFee !== undefined) {
    if (typeof response.result.btc_fee === 'number' && response.result.btc_fee !== feeCheck.computedFee) {
      verificationWarnings.push(`fee ${feeCheck.computedFee} differs from reported ${response.result.btc_fee}`);
    }
    response = { ...response, result: { ...response.result, btc_fee: feeCheck.computedFee } };
  }

  const intendedDestinations: IntendedDestination[] = addressesNamedIn(dataForApi).map(address => ({ address }));
  if (composeType === 'btcpay') {
    // The payee and amount come from the order match, read from the ledger (composer-context.tsx).
    const match = await fetchOrderMatch(String(dataForApi.order_match_id ?? ''));
    const payment = match ? btcPayPayment(match) : null;
    if (!payment) throw new Error('btcpay: the order match could not be read');
    // The regtest node spells the payee for regtest; the wallet compares mainnet spellings.
    intendedDestinations.push({ address: toMainnet(payment.address), value: payment.quantity });
  }
  const outputCheck = checkOutputPolicy({
    rawTransaction: response.result.rawtransaction,
    ownAddresses: [source],
    intendedDestinations: withPinnedDestinations(intendedDestinations, pinnedDestinations(composeType, dataForApi, [source])),
    positionalDestination: composeType === 'issuance' && typeof dataForApi.transfer_destination === 'string'
      && dataForApi.transfer_destination ? dataForApi.transfer_destination : undefined,
  });
  if (!outputCheck.ok) throw new Error(`${composeType}: output policy refused: ${outputCheck.error}`);

  response = {
    ...response,
    result: {
      ...response.result,
      params: { ...response.result.params, ...verifiedReviewParams(composeType, dataForApi, assetInfoCache) } as ApiResponse['result']['params'],
    },
  };
  return { composeType, response, dataForApi, decodedMessage, verificationWarnings };
}

/** The compose review pages, by the page that renders them. */
export type ReviewPage =
  | 'send' | 'mpma' | 'dispenser' | 'dispenser-close' | 'dispense' | 'order' | 'cancel'
  | 'issuance' | 'issue-supply' | 'lock-supply' | 'transfer-ownership' | 'update-description'
  | 'destroy' | 'dividend' | 'sweep' | 'broadcast' | 'attach' | 'detach' | 'move' | 'btcpay'
  | 'fairminter' | 'fairmint';

export interface ReviewPageFacts {
  /** `ReviewScreen`'s "From". */
  from: string;
  /** `ReviewScreen`'s "To", when it shows one. */
  to?: string;
  /** The page's own rows, keyed by what they state; values are the strings the page renders. */
  fields: Record<string, string>;
  /** MPMA and multi-send rows. */
  sends?: Array<{ asset: string; quantity: string; destination: string }>;
  /** `ReviewScreen`'s fee row, in sats. */
  btcFeeSats: number;
  /** `ReviewScreen`'s XCP fee row, in display units, when the response carries one. */
  xcpFee?: string;
}

/** Read a composed response the way the named review page does (`pages/compose/.../review.tsx`). */
export async function reviewPageFacts(page: ReviewPage, composed: WalletCompose): Promise<ReviewPageFacts> {
  const { result } = composed.response;
  const params = result.params as any;
  const decoded = composed.decodedMessage?.data as Record<string, any> | undefined;
  // review-screen.tsx
  const from = page === 'dispense' ? params.address ?? params.source : params.source;
  const to = page === 'dispense' ? params.dispenser : decoded?.destination ?? params.destination;
  const base: ReviewPageFacts = {
    from, ...(to ? { to } : {}), fields: {}, btcFeeSats: result.btc_fee,
    ...(result.xcp_fee !== undefined ? { xcpFee: fromSatoshis(result.xcp_fee, true).toFixed(8) } : {}),
  };
  const f = base.fields;

  switch (page) {
    case 'send': { // send/review.tsx, single send
      const asset = decoded?.asset ?? params.asset;
      f.asset = asset;
      f.amount = decoded?.quantity !== undefined
        ? normalizeQuantity(decoded.quantity, asset, params, 'asset')
        : String(params.quantity_normalized ?? params.quantity);
      if (decoded?.memo ?? params.memo) f.memo = String(decoded?.memo ?? params.memo);
      break;
    }
    case 'mpma': // send/mpma/review.tsx
      base.sends = (params.asset_dest_quant_list || []).map(([asset, destination, quantity]: [string, string, string]) => ({
        asset, destination,
        quantity: normalizeQuantity(quantity, asset, { asset_info: params.verified_asset_info?.[asset] }, 'asset'),
      }));
      break;
    case 'dispenser': // dispenser/review.tsx
      f.asset = decoded?.asset ?? params.asset;
      f.escrow = String(params.escrow_quantity_normalized);
      f.perDispense = String(params.give_quantity_normalized);
      f.priceBtc = formatAmount({ value: toBigNumber(fromSatoshis(decoded?.mainchainrate ?? params.mainchainrate)), minimumFractionDigits: 8, maximumFractionDigits: 8 });
      break;
    case 'dispenser-close': // dispenser/close/review.tsx
      f.asset = params.asset;
      if (params.give_remaining_normalized) f.escrowReturned = String(params.give_remaining_normalized);
      break;
    case 'dispense': { // dispenser/dispense/review.tsx
      const btcQuantity = params.quantity || 0;
      const response = await fetchAllAddressDispensers(params.dispenser, { status: 'open,closing', verbose: true });
      const triggered = (response.result ?? []).filter(d => (d.status === 0 || d.status === 11) && (d.satoshirate || 0) <= btcQuantity);
      const payouts = calculateDispensePayouts(response.result ?? [], btcQuantity);
      f.dispensers = String(triggered.length);
      f.youReceive = payouts.map(describePayout).join('\n');
      if (triggered.length === 1) {
        const rate = toBigNumber(triggered[0]!.satoshirate || 0);
        f.numberOfDispenses = (rate.isGreaterThan(0) ? roundDown(divide(btcQuantity, rate)) : toBigNumber(0)).toString();
      }
      f.btcPayment = formatAmount({ value: fromSatoshis(btcQuantity, true), minimumFractionDigits: 8, maximumFractionDigits: 8 });
      break;
    }
    case 'order': // order/review.tsx
      f.give = `${params.give_quantity_normalized ?? params.give_quantity} ${params.give_asset_info?.asset_longname || params.give_asset}`;
      f.get = `${params.get_quantity_normalized ?? params.get_quantity} ${params.get_asset_info?.asset_longname || params.get_asset}`;
      f.expiration = String(params.expiration);
      break;
    case 'btcpay': // order/btcpay/review.tsx
      f.orderMatchId = decoded?.orderMatchId ?? params.order_match_id;
      break;
    case 'cancel': // order/cancel/review.tsx
      f.orderHash = params.offer_hash;
      break;
    case 'issuance': // issuance/review.tsx
      f.asset = params.asset;
      f.issuance = String(params.quantity_normalized ?? params.quantity);
      f.locked = String(['true', '1', 1, true].includes(params.lock) && params.lock !== 'false');
      if (params.description) f.description = params.description;
      break;
    case 'issue-supply': { // issuance/issue-supply/review.tsx
      const current = params.asset_info?.supply_normalized ?? '0';
      const issued = params.quantity_normalized ?? params.quantity;
      f.asset = params.asset;
      f.currentSupply = String(current);
      f.afterIssuance = formatAmount({ value: toBigNumber(current).plus(toBigNumber(issued)), minimumFractionDigits: 0 });
      break;
    }
    case 'lock-supply': // issuance/lock-supply/review.tsx
      f.asset = params.asset;
      f.supplyToLock = String(params.asset_info?.supply_normalized ?? '0');
      break;
    case 'transfer-ownership': // issuance/transfer-ownership/review.tsx
      f.asset = params.asset;
      f.newOwner = params.transfer_destination;
      break;
    case 'update-description': // issuance/update-description/review.tsx
      f.asset = params.asset;
      f.description = params.description;
      break;
    case 'destroy': // issuance/destroy-supply/review.tsx
      f.amount = `${params.quantity_normalized ?? params.quantity} ${params.asset}`;
      if (params.tag) f.memo = params.tag;
      break;
    case 'dividend': // dividend/review.tsx
      f.asset = params.asset;
      f.dividend = `${params.quantity_per_unit_normalized} ${params.dividend_asset}`;
      break;
    case 'sweep': // sweep/review.tsx
      f.destination = params.destination;
      if (params.memo) f.memo = params.memo;
      if (params.flag !== undefined) f.flag = String(params.flag);
      break;
    case 'broadcast': // broadcast/review.tsx
      f.message = params.text;
      break;
    case 'attach': // utxo/attach/review.tsx
      f.asset = params.asset || 'N/A';
      f.quantity = params.quantity && params.asset ? `${params.quantity_normalized ?? params.quantity} ${params.asset}` : 'N/A';
      if (params.destination_vout !== undefined && params.destination_vout !== null) f.destinationOutput = String(params.destination_vout);
      break;
    case 'detach': // utxo/detach/review.tsx
      f.sourceUtxo = params.sourceUtxo || params.utxo || 'N/A';
      if (params.destination) f.destination = params.destination;
      break;
    case 'move': // utxo/move/review.tsx renders only the ReviewScreen rows
      break;
    case 'fairminter': // fairminter/review.tsx
      f.asset = params.asset;
      f.lotPrice = String(params.lot_price);
      f.lotSize = String(params.lot_size);
      if (Number(params.max_mint_per_address_normalized ?? 0) > 0) f.mintPerAddress = String(params.max_mint_per_address_normalized);
      f.hardCap = String(params.hard_cap);
      if (Number(params.soft_cap ?? 0) > 0) f.softCap = String(params.soft_cap);
      if (params.description) f.description = params.description;
      break;
    case 'fairmint': { // fairminter/fairmint/review.tsx
      const quantityDisplay = String(params.quantity_normalized ?? params.quantity);
      const fairminter = await fetchAssetFairminter(params.asset);
      f.asset = params.asset;
      if (fairminter) {
        const model = readFairminterPaymentModel(fairminter);
        if (isPaidFairminter(model)) {
          f.youReceive = `${quantityDisplay} ${params.asset}`;
          const cost = getFairmintCost(fairminter, quantityDisplay);
          if (cost !== null) f.youPay = `${cost} XCP`;
        } else {
          f.youPay = 'network fee only';
        }
        f.payment = describeFairminterPaymentModel(model);
      } else {
        f.quantity = quantityDisplay;
      }
      break;
    }
  }
  return base;
}

export interface ApprovalReview {
  decoded: DecodedTransactionInfo;
  /** The action label; absent when the transaction carries no message (a UTXO move). */
  label?: string;
  /** The headline and its subline, as the summary card shows them. */
  headline?: string;
  subline?: string;
  address?: string;
  description?: string;
  /** The protocol detail list: label → values (a label can repeat, e.g. one "You receive" per payout). */
  protocol: Record<string, string[]>;
  /** Titles of the warnings shown, and whether signing is blocked. */
  warnings: string[];
  blocked: boolean;
}

/** The approval screen's reading of a transaction (`pages/requests/transaction/approve.tsx`). */
export async function approvalReview(rawTxHex: string, key: RegtestKey): Promise<ApprovalReview> {
  clearApiCache();
  const decoded = await decodeTransactionForApproval(rawTxHex, walletAddress(key), resolveRegtestPrevout);
  const info = getTxActionInfo(decoded, decoded.protocolContext);
  const protocol: Record<string, string[]> = {};
  for (const field of info?.protocol ?? []) (protocol[field.label] ??= []).push(...(field.items ?? [field.value]));
  return {
    decoded, label: info?.label, description: info?.description,
    headline: info?.presentation?.headline, subline: info?.presentation?.subline, address: info?.presentation?.address,
    protocol,
    warnings: decoded.safety.warnings.map(warning => warning.title),
    blocked: decoded.safety.blocked,
  };
}
