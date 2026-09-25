import { bytesToHex } from '@noble/hashes/utils.js';
import {
  type DescribableMessage,
  type DescriptionLocalizer,
  describeMessageDetails,
  englishDescription,
  labelFor,
  type MessageHeadline,
  type ProtocolContext,
  type ProtocolField,
  protocolFields,
} from '@/core/counterparty/describe';
import type { CounterpartyMessage } from '@/core/counterparty/transaction';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack';
import { formatAmount } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';
import { t } from '@/i18n';

/**
 * Shared action-summary logic for the transaction and PSBT approval screens.
 *
 * Both screens derive a human-readable "what is this transaction" line from the
 * decoded Counterparty message. Keeping it in one place stops the two pages
 * from drifting — previously the PSBT screen printed raw satoshi quantities
 * while the transaction screen normalized them, so the same send showed two
 * different numbers.
 */

/** Only known UI templates are translated; payload text and identifiers never enter the catalog. */
const localizeAction: DescriptionLocalizer = (source, substitutions) => {
  switch (source) {
    case "Send": return t('tx_action_send', substitutions);
    case "Multi-Send": return t('tx_action_multi_send', substitutions);
    case "BTC Pay": return t('tx_action_btc_pay', substitutions);
    case "Order": return t('tx_action_order', substitutions);
    case "Cancel": return t('tx_action_cancel', substitutions);
    case "Dispenser": return t('tx_action_dispenser', substitutions);
    case "Dispense": return t('tx_action_dispense', substitutions);
    case "Issuance": return t('tx_action_issuance', substitutions);
    case "Subasset Issuance": return t('tx_action_subasset_issuance', substitutions);
    case "Dividend": return t('tx_action_dividend', substitutions);
    case "Sweep": return t('tx_action_sweep', substitutions);
    case "Broadcast": return t('tx_action_broadcast', substitutions);
    case "Pool Deposit": return t('tx_action_pool_deposit', substitutions);
    case "Pool Withdrawal": return t('tx_action_pool_withdrawal', substitutions);
    case "UTXO Move": return t('tx_action_utxo_move', substitutions);
    case "Attach": return t('tx_action_attach', substitutions);
    case "Detach": return t('tx_action_detach', substitutions);
    case "Destroy": return t('tx_action_destroy', substitutions);
    case "Mint": return t('tx_action_mint', substitutions);
    case "Create fairminter": return t('tx_action_create_fairminter', substitutions);
    case "Close dispenser": return t('tx_action_close_dispenser', substitutions);
    case "Fund dispenser": return t('tx_action_fund_dispenser', substitutions);
    case "Send $1 $2": return t('tx_action_send_amount', substitutions);
    case "Send $1 $2 to $3": return t('tx_action_send_amount_to', substitutions);
    case "Send to $1 recipient": return t('tx_action_send_one_recipient', substitutions);
    case "Send to $1 recipients": return t('tx_action_send_recipients', substitutions);
    case "Give $1 $2 for $3 $4": return t('tx_action_give_for', substitutions);
    case "Cancel order: $1": return t('tx_action_cancel_order_details', substitutions);
    case "Cancel a DEX order": return t('tx_action_cancel_dex_order', substitutions);
    case "sell $1 $2 for $3 $4": return t('tx_action_sell_for', substitutions);
    case "Close the $1 dispenser": return t('tx_action_close_asset_dispenser', substitutions);
    case "$1 $2 per $3 sats": return t('tx_action_dispense_rate', substitutions);
    case "Trigger a dispenser": return t('tx_action_trigger_dispenser', substitutions);
    case "Issue $1": return t('tx_action_issue_amount', substitutions);
    case "No new supply": return t('tx_action_no_new_supply', substitutions);
    case "$1 $2 per unit": return t('tx_action_per_unit', substitutions);
    case "All $1 holders": return t('tx_action_all_holders', substitutions);
    case "Pay BTC to settle a matched order": return t('tx_action_settle_btc', substitutions);
    case "Sweep to $1": return t('tx_action_sweep_to', substitutions);
    case "an empty message": return t('tx_action_empty_message', substitutions);
    case "Destroy $1 LP Tokens": return t('tx_action_destroy_lp', substitutions);
    case "Withdraw liquidity": return t('tx_action_withdraw_liquidity', substitutions);
    case "Deposit liquidity": return t('tx_action_deposit_liquidity', substitutions);
    case "Attach $1 $2": return t('tx_action_attach_amount', substitutions);
    case "Detach all assets from UTXO": return t('tx_action_detach_all', substitutions);
    case "Detach all assets from UTXO to $1": return t('tx_action_detach_all_to', substitutions);
    case "Move $1 $2": return t('tx_action_move_amount', substitutions);
    case "Move $1 $2 to $3": return t('tx_action_move_amount_to', substitutions);
    case "Destroy $1 $2": return t('tx_action_destroy_amount', substitutions);
    case "$1 (base units)": return t('tx_action_base_units', substitutions);
    case "Memo": return t('tx_action_memo', substitutions);
    case "Tag": return t('tx_action_tag', substitutions);
    case "$1 (hex)": return t('tx_action_hex_label', substitutions);
    case "Price": return t('tx_action_price', substitutions);
    case "BTC fee": return t('tx_action_btc_fee', substitutions);
    case "Expiry": return t('tx_action_expiry', substitutions);
    case "$1 blocks": return t('tx_action_blocks', substitutions);
    case "$1 block": return t('tx_action_block', substitutions);
    case "Escrow": return t('tx_action_escrow', substitutions);
    case "Per dispense": return t('tx_action_per_dispense', substitutions);
    case "Dispenses": return t('tx_action_dispenses', substitutions);
    case "You receive": return t('tx_action_you_receive', substitutions);
    case "XCP price per lot": return t('tx_action_xcp_price_per_lot', substitutions);
    case "Lot size": return t('tx_action_lot_size', substitutions);
    case "No limit": return t('tx_action_no_limit', substitutions);
    case "Per transaction limit": return t('tx_action_per_transaction_limit', substitutions);
    case "Per address limit": return t('tx_action_per_address_limit', substitutions);
    case "Hard cap": return t('tx_action_hard_cap', substitutions);
    case "Soft cap": return t('tx_action_soft_cap', substitutions);
    case "Soft cap deadline": return t('tx_action_soft_cap_deadline', substitutions);
    case "Block $1": return t('tx_action_block_height', substitutions);
    case "Premint": return t('tx_action_premint', substitutions);
    case "Pool allocation": return t('tx_action_pool_allocation', substitutions);
    case "LP asset": return t('tx_action_lp_asset', substitutions);
    case "XCP payment": return t('tx_action_xcp_payment', substitutions);
    case "None (free mint)": return t('tx_action_free_mint', substitutions);
    case "Burned": return t('tx_action_burned', substitutions);
    case "Seeds the liquidity pool": return t('tx_action_seeds_pool', substitutions);
    case "Paid to issuer": return t('tx_action_paid_to_issuer', substitutions);
    case "Starts": return t('tx_action_starts', substitutions);
    case "Ends": return t('tx_action_ends', substitutions);
    case "On confirmation": return t('tx_action_on_confirmation', substitutions);
    case "No end block": return t('tx_action_no_end_block', substitutions);
    case "Minted asset commission": return t('tx_action_minted_asset_commission', substitutions);
    case "Divisible": return t('tx_action_divisible', substitutions);
    case "Yes": return t('tx_action_yes', substitutions);
    case "No": return t('tx_action_no', substitutions);
    case "Lock description": return t('tx_action_lock_description', substitutions);
    case "Lock quantity": return t('tx_action_lock_quantity', substitutions);
    case "Description format": return t('tx_action_description_format', substitutions);
    case "Description content": return t('tx_action_description_content', substitutions);
    case "Description": return t('tx_action_description', substitutions);
    case "XCP burned": return t('tx_action_xcp_burned', substitutions);
    case "XCP to pool": return t('tx_action_xcp_to_pool', substitutions);
    case "XCP price": return t('tx_action_xcp_price', substitutions);
    case "Lock": return t('tx_action_lock', substitutions);
    case "Reset": return t('tx_action_reset', substitutions);
    case "Yes - supply can never be increased again": return t('tx_action_lock_consequence', substitutions);
    case "Yes - existing supply is destroyed and replaced": return t('tx_action_reset_consequence', substitutions);
    case "New owner": return t('tx_action_new_owner', substitutions);
    case "Supply before": return t('tx_action_supply_before', substitutions);
    case "Supply after": return t('tx_action_supply_after', substitutions);
    case "Share destroyed": return t('tx_action_share_destroyed', substitutions);
    case "Includes": return t('tx_action_includes', substitutions);
    case "All balances and asset ownership": return t('tx_action_sweep_balances_ownership', substitutions);
    case "Asset ownership only": return t('tx_action_sweep_ownership', substitutions);
    case "All balances": return t('tx_action_sweep_balances', substitutions);
    case "Format": return t('tx_action_format', substitutions);
    case "Plain text": return t('tx_action_plain_text', substitutions);
    case "Content": return t('tx_action_content', substitutions);
    case "Inscribed - this broadcast carries data, not a message": return t('tx_action_inscribed_data', substitutions);
    case "Value": return t('tx_action_value', substitutions);
    case "Fee fraction": return t('tx_action_fee_fraction', substitutions);
    case "Time left": return t('tx_action_time_left', substitutions);
    case "Expired - this payment will not settle the match": return t('tx_action_payment_expired', substitutions);
    case "Order match": return t('tx_action_order_match', substitutions);
    case "Order hash": return t('tx_action_order_hash', substitutions);
    case "Deposit": return t('tx_action_deposit', substitutions);
    case "Ratio": return t('tx_action_ratio', substitutions);
    case "Pool": return t('tx_action_pool', substitutions);
    case "Pool fee": return t('tx_action_pool_fee', substitutions);
    case "Min LP received": return t('tx_action_min_lp_received', substitutions);
    case "Min $1 back": return t('tx_action_min_asset_back', substitutions);
    case "XCP fee": return t('tx_action_xcp_fee', substitutions);
    case "New UTXO": return t('tx_action_new_utxo', substitutions);
    case "Detached": return t('tx_action_detached', substitutions);
    case "From UTXO": return t('tx_action_from_utxo', substitutions);
    case "To": return t('tx_action_to', substitutions);
    default: return englishDescription(source, substitutions);
  }
};

/** A historical message type, without the action-specific verbs used for approvals. */
export function historyTransactionTypeLabel(messageType: string): string {
  const aliases: Record<string, string> = {
    mpma: 'mpma_send',
    move_utxo: 'utxo_move',
    open_order: 'order',
    open_dispenser: 'dispenser',
  };
  const type = Object.hasOwn(aliases, messageType) ? aliases[messageType]! : messageType;
  return labelFor(type, (source, substitutions) => {
    // A future wire name must not turn inherited object members into a React child.
    if (typeof source !== 'string') return messageType;
    if (source === 'Fairmint') return t('fairminter_fairmint_fairmint');
    if (source === 'Fairminter') return t('compose_fairminter_fairminter');
    if (source === 'Unknown') return t('messages_order_status_unknown');
    return localizeAction(source, substitutions);
  });
}

/** The minimal decoded shape both approval screens share. */
interface TxActionSource {
  counterpartyMessage?: CounterpartyMessage;
  verification?: ProviderVerificationResult;
}

/**
 * Whether an asset is divisible, using enriched messageData when available.
 * Returns true for BTC/XCP, checks asset_info otherwise, undefined if unknown.
 */
export function isAssetDivisible(
  asset: string,
  messageData?: Record<string, unknown>,
  assetField?: string,
): boolean | undefined {
  const name = asset.toUpperCase();
  if (name === 'BTC' || name === 'XCP') return true;

  if (messageData && assetField) {
    const assetInfo = messageData[`${assetField}_info`] as Record<string, unknown> | undefined;
    if (assetInfo?.divisible === true) return true;
    if (assetInfo?.divisible === false) return false;
  }
  return undefined; // Unknown
}

/**
 * Normalize a raw quantity for display: divisible assets divide by 10^8,
 * indivisible show the raw integer with thousands separators.
 */
export function normalizeQuantity(
  quantity: unknown,
  asset: string,
  messageData?: Record<string, unknown>,
  assetField?: string,
): string {
  if (quantity == null) return '?';
  const val = BigInt(String(quantity));
  const divisible = isAssetDivisible(asset, messageData, assetField);
  // String, not Number: a Counterparty quantity is an unsigned 64-bit integer and doubles are
  // exact only to 2^53-1, so 9999999999999999 base units rendered as 100000000.00000000 rather
  // than 99999999.99999999 — a different amount than the one being signed. fromSatoshis is
  // BigNumber-backed and exact when handed the digits.
  if (divisible === true) return fromSatoshis(val.toString());
  const grouped = formatAmount({ value: val.toString(), maximumFractionDigits: 0 });
  if (divisible === false) return grouped;

  // Divisibility unknown. Every caller on the local-unpack path passes only (quantity, asset), so
  // this is reached for every asset but BTC and XCP — and precisely when the API decode failed and
  // the wallet is relying on its own bytes. Printing the bare integer reads as a quantity and is
  // off by 1e8 for any divisible asset: 1.5 PEPECASH as "150,000,000 PEPECASH". Label it so an
  // unknown is visibly an unknown rather than a confident wrong number — "base units" because
  // that count is correct whichever way the divisibility resolves.
  return localizeAction('$1 (base units)', [grouped]);
}

/**
 * Build a human-readable label and description from decoded transaction data.
 * Prefers the API counterpartyMessage, else falls back to the local unpack.
 */
/**
 * Canonical asset slot → the API field carrying its `*_info`.
 *
 * Divisibility has to be matched by slot rather than by name: the endpoint returns 0 for an asset
 * its ledger cannot resolve, so matching on the name fails for exactly the assets whose name the
 * local unpack had to supply.
 */
const ASSET_SLOT_TO_API_FIELD: Record<string, string> = {
  asset: 'asset',
  giveAsset: 'give_asset',
  getAsset: 'get_asset',
  dividendAsset: 'dividend_asset',
  assetA: 'asset_a',
  assetB: 'asset_b',
};

/** Approval verbs do not rename transaction types in historical/API descriptions. */
function approvalActionLabel(messageType: string, view?: DescribableMessage): string {
  if (messageType === 'fairmint') return localizeAction('Mint');
  if (messageType === 'fairminter') return localizeAction('Create fairminter');
  if (messageType === 'dispenser') {
    if (view?.dispenserStatus === 10) return localizeAction('Close dispenser');
    // Both opening and refilling commit escrow; the bytes alone cannot distinguish them.
    if (view?.dispenserStatus === 0 || view?.dispenserStatus === 1) return localizeAction('Fund dispenser');
  }
  return labelFor(messageType, localizeAction);
}

/**
 * Build a human-readable label and description from decoded transaction data.
 *
 * Neither decoder is sufficient alone, and each is blind where the other sees. The local unpack
 * derives an asset name arithmetically from its id, so it always has one; the API resolves names
 * through a ledger lookup and returns 0 for anything it has not indexed. The API carries
 * divisibility in `*_info`; the local unpack carries none, so on its own it can only label a
 * quantity as base units.
 *
 * Used separately, each blind spot reached the screen: "Deposit liquidity: … and 200,000,000 base
 * units 0" is both of them in one sentence — an unresolvable name printed as 0 by the API, beside
 * a quantity the local path could not scale. So when both are present the description is built
 * from the local fields and formatted with the API's divisibility.
 */
export function getTxActionInfo(
  decodedInfo: TxActionSource,
  context: ProtocolContext = {}
): { label: string; description: string; presentation?: MessageHeadline; protocol: ProtocolField[] } | null {
  const unpack = decodedInfo.verification?.localUnpack;
  const api = decodedInfo.counterpartyMessage;
  const localUsable = unpack?.success && unpack.messageType && unpack.data;

  if (localUsable && api) {
    const localView = fromLocalUnpack(unpack.data, api.messageData);
    // Before describeMessage, not after: the cancel headline reads this, and assigning it
    // afterwards left every resolved cancel showing its bare hash.
    if (context.cancelledOrder) {
      const o = context.cancelledOrder;
      localView.cancelledOrderSummary = localizeAction('sell $1 $2 for $3 $4', [o.giveQuantity, o.giveAsset, o.getQuantity, o.getAsset]);
    }
    const merged = describeMessageDetails(unpack.messageType!, localView, localizeAction);
    if (merged) {
      const view = localView;
      return {
        label: approvalActionLabel(unpack.messageType!, view),
        description: unpack.messageType === 'pooldeposit' ? localizeAction('Deposit liquidity') : merged.description,
        presentation: unpack.messageType === 'pooldeposit' ? { headline: localizeAction('Deposit liquidity') } : merged.presentation,
        protocol: protocolFields(unpack.messageType!, view, context, localizeAction),
      };
    }
  }

  // Only one source available — use whichever it is, with its own limitations stated by the
  // adapter rather than papered over.
  if (api) {
    // No local decode to merge with, so the protocol view has nothing trustworthy to read.
    return { label: approvalActionLabel(api.messageType), description: api.description, protocol: [] };
  }

  if (!localUsable) return null;
  const view = fromLocalUnpack(unpack!.data);
  const details = describeMessageDetails(unpack!.messageType!, view, localizeAction);
  return {
    label: approvalActionLabel(unpack!.messageType!, view),
    description: unpack!.messageType === 'pooldeposit' ? localizeAction('Deposit liquidity') : details?.description ?? unpack!.messageType!,
    presentation: unpack!.messageType === 'pooldeposit' ? { headline: localizeAction('Deposit liquidity') } : details?.presentation,
    protocol: protocolFields(unpack!.messageType!, view, context, localizeAction),
  };
}

/**
 * The output index an attach targets, so the details list can mark which output becomes the new
 * asset-bearing UTXO. Undefined for non-attach messages and for an attach that leaves the index
 * to core's default.
 */
export function attachDestinationVout(source: TxActionSource): number | undefined {
  const unpack = source.verification?.localUnpack;
  if (unpack?.success && unpack.messageType === 'attach') {
    const vout = (unpack.data as { destinationVout?: number }).destinationVout;
    if (typeof vout === 'number') return vout;
  }
  if (source.counterpartyMessage?.messageType === 'attach') {
    const raw = source.counterpartyMessage.messageData?.destination_vout;
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  }
  return undefined;
}

/**
 * Adapt a local unpack into the shared describer's view.
 *
 * The unpacker uses camelCase and carries asset names but no divisibility, so quantities are
 * labelled as base units unless the asset is one whose divisibility is fixed by the protocol.
 * That is the honest rendering: this path runs precisely when the API decode failed and the
 * wallet is relying on its own bytes.
 */
function fromLocalUnpack(
  raw: unknown,
  apiData?: Record<string, unknown>
): DescribableMessage {
  const data = raw as Record<string, unknown>;
  const sends = data.sends as unknown[] | undefined;

  /** Divisibility for a local asset slot, taken from the API's info for the matching field. */
  const divisibilityOf = (asset?: string): boolean | undefined => {
    const upper = String(asset ?? '').toUpperCase();
    if (upper === 'BTC' || upper === 'XCP') return true;
    // Issuance/fairminter bytes define the new asset's scale, even if ledger metadata is stale.
    if (asset === data.asset && typeof data.divisible === 'boolean') return data.divisible;
    if (!apiData) return undefined;

    for (const [slot, apiField] of Object.entries(ASSET_SLOT_TO_API_FIELD)) {
      if (data[slot] !== asset) continue;
      const info = apiData[`${apiField}_info`] as Record<string, unknown> | undefined;
      if (typeof info?.divisible === 'boolean') return info.divisible;
    }
    return undefined;
  };

  return {
    asset: data.asset as string | undefined,
    quantity: data.quantity,
    destination: data.destination as string | undefined,
    ...memoForDisplay(data),
    giveAsset: data.giveAsset as string | undefined,
    giveQuantity: data.giveQuantity,
    getAsset: data.getAsset as string | undefined,
    getQuantity: data.getQuantity,
    expiration: data.expiration as number | undefined,
    escrowQuantity: data.escrowQuantity,
    mainchainrate: data.mainchainrate,
    dividendAsset: data.dividendAsset as string | undefined,
    quantityPerUnit: data.quantityPerUnit,
    offerHash: (data.offerHash ?? (data.tx0Hash && data.tx1Hash ? `${data.tx0Hash}_${data.tx1Hash}` : undefined)) as string | undefined,
    text: (data.text ?? data.description) as string | undefined,
    assetA: data.assetA as string | undefined,
    quantityA: data.quantityA,
    assetB: data.assetB as string | undefined,
    quantityB: data.quantityB,
    recipientCount: sends?.length,
    destinationVout: data.destinationVout as number | undefined,
    mimeType: data.mimeType as string | undefined,
    value: data.value as number | undefined,
    feeFractionInt: data.feeFractionInt as number | undefined,
    subassetLongname: data.subassetLongname as string | undefined,
    sweepBalances: data.sweepBalances as boolean | undefined,
    sweepOwnership: data.sweepOwnership as boolean | undefined,
    divisible: data.divisible as boolean | undefined,
    lock: data.lock as boolean | undefined,
    reset: data.reset as boolean | undefined,
    // A utxo move names the outpoint it empties in `source`.
    sourceUtxo: typeof data.source === 'string' && data.source.includes(':')
      ? (data.source as string)
      : undefined,
    feeRequired: data.feeRequired,
    lpAsset: data.lpAsset as string | undefined,
    minLpQuantity: data.minLpQuantity,
    minQuantityA: data.minQuantityA,
    minQuantityB: data.minQuantityB,
    recipients: sends as { asset?: string; destination: string; quantity: unknown }[] | undefined,
    dispenserStatus: data.status as number | undefined,
    price: data.price,
    quantityByPrice: data.quantityByPrice,
    maxMintPerTx: data.maxMintPerTx,
    maxMintPerAddress: data.maxMintPerAddress,
    hardCap: data.hardCap,
    softCap: data.softCap,
    premintQuantity: data.premintQuantity,
    startBlock: data.startBlock as number | undefined,
    endBlock: data.endBlock as number | undefined,
    softCapDeadlineBlock: data.softCapDeadlineBlock as number | undefined,
    mintedAssetCommissionInt: data.mintedAssetCommissionInt,
    burnPayment: data.burnPayment as boolean | undefined,
    poolQuantity: data.poolQuantity,
    lockDescription: data.lockDescription as boolean | undefined,
    lockQuantity: data.lockQuantity as boolean | undefined,
    format: (quantity, asset) => {
      if (quantity == null) return '?';
      const divisible = divisibilityOf(asset);
      if (divisible === true) return fromSatoshis(String(quantity), { removeTrailingZeros: false });
      const whole = formatAmount({ value: BigInt(String(quantity)).toString(), maximumFractionDigits: 0 });
      if (divisible === false) return whole;
      return localizeAction('$1 (base units)', [whole]);
    },
    // The same value with nothing added, for the figures that get divided rather than displayed.
    // Undefined where divisibility is unknown: a derived rate computed on a guessed scale is wrong
    // by 1e8, which is the failure this whole layer exists to prevent.
    numeric: (quantity, asset) => {
      if (quantity == null) return undefined;
      const divisible = divisibilityOf(asset);
      if (divisible === true) return fromSatoshis(String(quantity), { removeTrailingZeros: true });
      if (divisible === false) return BigInt(String(quantity)).toString();
      return undefined;
    },
  };
}

/** Keep the locally decoded bytes authoritative; a hex-looking text memo is still text. */
function memoForDisplay(data: Record<string, unknown>): Pick<DescribableMessage, 'memo' | 'memoEncoding'> {
  const bytes = data.memoBytes;
  if (!(bytes instanceof Uint8Array)) {
    return typeof data.memo === 'string' ? { memo: data.memo,
      memoEncoding: data.memoIsBinary === true ? 'hex' : 'text' } : {};
  }
  if (bytes.length === 0) return {};
  if (data.memoIsBinary !== true) {
    try {
      // Preserve any BOM so it cannot disappear while classifying the signed bytes.
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      // Newlines and tabs are meaningful text. Other control/format bytes cannot be
      // faithfully inspected as prose; a whitespace-only memo would look absent.
      if (text.trim() && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text.replace(/[\t\n]/g, ''))) {
        return { memo: text, memoEncoding: 'text' };
      }
    } catch {
      // Invalid UTF-8 remains visible as its exact bytes, without replacement characters.
    }
  }
  return { memo: bytesToHex(bytes), memoEncoding: 'hex' };
}
