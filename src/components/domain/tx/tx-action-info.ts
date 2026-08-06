import { type DescribableMessage, describeMessage, labelFor } from '@/core/counterparty/describe';
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
  // unknown is visibly an unknown rather than a confident wrong number.
  return `${val.toLocaleString()} base units`;
}

/** LP tokens are always divisible. */
export function normalizeLpQuantity(quantity: unknown): string {
  if (quantity == null) return '?';
  return fromSatoshis(String(quantity), { removeTrailingZeros: true });
}

/**
 * Build a human-readable label and description from decoded transaction data.
 * Prefers the API counterpartyMessage, else falls back to the local unpack.
 */
export function getTxActionInfo(decodedInfo: TxActionSource): { label: string; description: string } | null {
  // The API decode already carries a description built by the shared describer.
  if (decodedInfo.counterpartyMessage) {
    return {
      label: labelFor(decodedInfo.counterpartyMessage.messageType),
      description: decodedInfo.counterpartyMessage.description,
    };
  }

  // Otherwise describe from the local unpack, through the same switch rather than a parallel one.
  const unpack = decodedInfo.verification?.localUnpack;
  if (!unpack?.success || !unpack.messageType || !unpack.data) return null;

  const description = describeMessage(unpack.messageType, fromLocalUnpack(unpack.data));
  return {
    label: labelFor(unpack.messageType),
    description: description ?? unpack.messageType,
  };
}

/**
 * Adapt a local unpack into the shared describer's view.
 *
 * The unpacker uses camelCase and carries asset names but no divisibility, so quantities are
 * labelled as base units unless the asset is one whose divisibility is fixed by the protocol.
 * That is the honest rendering: this path runs precisely when the API decode failed and the
 * wallet is relying on its own bytes.
 */
function fromLocalUnpack(raw: unknown): DescribableMessage {
  const data = raw as Record<string, unknown>;
  const sends = data.sends as unknown[] | undefined;

  return {
    asset: data.asset as string | undefined,
    quantity: data.quantity,
    destination: data.destination as string | undefined,
    giveAsset: data.giveAsset as string | undefined,
    giveQuantity: data.giveQuantity,
    getAsset: data.getAsset as string | undefined,
    getQuantity: data.getQuantity,
    expiration: data.expiration as number | undefined,
    escrowQuantity: data.escrowQuantity,
    mainchainrate: data.mainchainrate,
    dividendAsset: data.dividendAsset as string | undefined,
    quantityPerUnit: data.quantityPerUnit,
    offerHash: data.offerHash as string | undefined,
    text: data.text as string | undefined,
    assetA: data.assetA as string | undefined,
    quantityA: data.quantityA,
    assetB: data.assetB as string | undefined,
    quantityB: data.quantityB,
    recipientCount: sends?.length,
    subassetLongname: data.subassetLongname as string | undefined,
    format: (quantity, asset) => normalizeQuantity(quantity, asset ?? ''),
  };
}
