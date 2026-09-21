import { bytesToHex } from '@noble/hashes/utils.js';
import {
  type DescribableMessage,
  describeMessage,
  labelFor,
  type ProtocolContext,
  type ProtocolField,
  protocolFields,
} from '@/core/counterparty/describe';
import type { CounterpartyMessage } from '@/core/counterparty/transaction';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack';
import { fromSatoshis } from '@/core/numeric';

/**
 * Shared action-summary logic for the transaction and PSBT approval screens.
 *
 * Both screens derive a human-readable "what is this transaction" line from the
 * decoded Counterparty message. Keeping it in one place stops the two pages
 * from drifting — previously the PSBT screen printed raw satoshi quantities
 * while the transaction screen normalized them, so the same send showed two
 * different numbers.
 */

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
  if (divisible === false) return val.toLocaleString();

  // Divisibility unknown. Every caller on the local-unpack path passes only (quantity, asset), so
  // this is reached for every asset but BTC and XCP — and precisely when the API decode failed and
  // the wallet is relying on its own bytes. Printing the bare integer reads as a quantity and is
  // off by 1e8 for any divisible asset: 1.5 PEPECASH as "150,000,000 PEPECASH". Label it so an
  // unknown is visibly an unknown rather than a confident wrong number — "base units" because
  // that count is correct whichever way the divisibility resolves.
  return `${val.toLocaleString()} (base units)`;
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
  if (messageType === 'fairmint') return 'Mint';
  if (messageType === 'fairminter') return 'Create fairminter';
  if (messageType === 'dispenser') {
    if (view?.dispenserStatus === 10) return 'Close dispenser';
    // Both opening and refilling commit escrow; the bytes alone cannot distinguish them.
    if (view?.dispenserStatus === 0 || view?.dispenserStatus === 1) return 'Fund dispenser';
  }
  return labelFor(messageType);
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
): { label: string; description: string; protocol: ProtocolField[] } | null {
  const unpack = decodedInfo.verification?.localUnpack;
  const api = decodedInfo.counterpartyMessage;
  const localUsable = unpack?.success && unpack.messageType && unpack.data;

  if (localUsable && api) {
    const localView = fromLocalUnpack(unpack.data, api.messageData);
    // Before describeMessage, not after: the cancel headline reads this, and assigning it
    // afterwards left every resolved cancel showing its bare hash.
    if (context.cancelledOrder) {
      const o = context.cancelledOrder;
      localView.cancelledOrderSummary = `sell ${o.giveQuantity} ${o.giveAsset} for ${o.getQuantity} ${o.getAsset}`;
    }
    const merged = describeMessage(unpack.messageType!, localView);
    if (merged) {
      const view = localView;
      return {
        label: approvalActionLabel(unpack.messageType!, view),
        description: unpack.messageType === 'pooldeposit' ? 'Deposit liquidity' : merged,
        protocol: protocolFields(unpack.messageType!, view, context),
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
  const description = describeMessage(unpack!.messageType!, view);
  return {
    label: approvalActionLabel(unpack!.messageType!, view),
    description: unpack!.messageType === 'pooldeposit' ? 'Deposit liquidity' : description ?? unpack!.messageType!,
    protocol: protocolFields(unpack!.messageType!, view, context),
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
      if (divisible === false) return BigInt(String(quantity)).toLocaleString();
      return `${BigInt(String(quantity)).toLocaleString()} (base units)`;
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
