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
  return val.toLocaleString();
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
  // Try API message first
  if (decodedInfo.counterpartyMessage) {
    return {
      label: decodedInfo.counterpartyMessage.messageType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: decodedInfo.counterpartyMessage.description,
    };
  }

  // Fall back to local unpack
  const unpack = decodedInfo.verification?.localUnpack;
  if (!unpack?.success || !unpack.messageType || !unpack.data) return null;

  const data = unpack.data as Record<string, unknown>;
  const label = unpack.messageType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  switch (unpack.messageType) {
    case 'enhanced_send':
    case 'send':
      return { label: 'Send', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'order':
      return { label: 'Order', description: `Give ${normalizeQuantity(data.giveQuantity, data.giveAsset as string)} ${data.giveAsset} for ${normalizeQuantity(data.getQuantity, data.getAsset as string)} ${data.getAsset}` };
    case 'cancel':
      return { label: 'Cancel Order', description: `Cancel ${String(data.offerHash).slice(0, 16)}…` };
    case 'issuance':
    case 'subasset_issuance':
    case 'lr_issuance':
    case 'lr_subasset':
      return { label: 'Issuance', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'dispenser':
      return { label: 'Dispenser', description: `${normalizeQuantity(data.escrowQuantity, data.asset as string)} ${data.asset}` };
    case 'dispense':
      return { label: 'Dispense', description: 'Dispense from dispenser' };
    case 'sweep':
      return { label: 'Sweep', description: `Sweep to ${String(data.destination).slice(0, 16)}…` };
    case 'destroy':
      return { label: 'Destroy', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'dividend':
      return { label: 'Dividend', description: `${normalizeQuantity(data.quantityPerUnit, data.dividendAsset as string)} ${data.dividendAsset} per ${data.asset}` };
    case 'attach':
      return { label: 'Attach', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'detach':
      // Detach may carry a quantity/asset or only a destination; handle both.
      return {
        label: 'Detach',
        description: data.quantity != null
          ? `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}`
          : data.destination
            ? `To ${String(data.destination).slice(0, 16)}…`
            : 'Detach assets from UTXO',
      };
    case 'mpma_send':
      return { label: 'Multi-Send', description: `${(data.sends as unknown[])?.length || 0} recipients` };
    case 'fairminter':
      return { label: 'Fairminter', description: `${data.asset}` };
    case 'fairmint':
      return { label: 'Fairmint', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'pooldeposit':
      return { label: 'Pool Deposit', description: `${normalizeQuantity(data.quantityA, data.assetA as string)} ${data.assetA} + ${normalizeQuantity(data.quantityB, data.assetB as string)} ${data.assetB}` };
    case 'poolwithdraw':
      return { label: 'Pool Withdraw', description: `Burn ${normalizeLpQuantity(data.quantity)} LP tokens from ${data.assetA}/${data.assetB}` };
    default:
      return { label, description: unpack.messageType };
  }
}
