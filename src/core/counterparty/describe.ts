/**
 * One description per message type, for both approval paths.
 *
 * There were two: `describeCounterpartyMessage` over the API decode, keyed on snake_case fields,
 * and `getTxActionInfo`'s fallback over the local unpack, keyed on camelCase. Twenty types each,
 * sixteen in duplicate, and four covered by only one of them — so `broadcast`, `btcpay` and
 * `utxo` had no description on the local path while `mpma_send` and the subasset issuance
 * variants had none on the API path.
 *
 * Two implementations of one rule is the mechanical cause of a half-fix: a change lands in the
 * copy the author is looking at and the other keeps its old behaviour. Pool deposits disagreed by
 * 1e8 between the two for exactly this reason — one path had been given divisibility and the other
 * had not, and both were reachable from the same screen.
 *
 * The switch now exists once, over a canonical view. Each decoder supplies an adapter that maps
 * its own field names in, and — importantly — supplies its own quantity formatter, because the two
 * know different things: the API decode carries `asset_info` divisibility, while the local unpack
 * carries only names and must label a quantity whose units it cannot establish.
 */

import type { DisplayUnits } from '@/core/numeric';

/**
 * A decoded message in the shape the describer reads, independent of which decoder produced it.
 *
 * Fields are optional because no message carries all of them; a describer case reads only what
 * its own type defines.
 */
export interface DescribableMessage {
  asset?: string;
  quantity?: unknown;
  destination?: string;
  memo?: string;

  giveAsset?: string;
  giveQuantity?: unknown;
  getAsset?: string;
  getQuantity?: unknown;
  expiration?: number;

  escrowQuantity?: unknown;
  mainchainrate?: unknown;

  dividendAsset?: string;
  quantityPerUnit?: unknown;

  offerHash?: string;
  text?: string;

  assetA?: string;
  quantityA?: unknown;
  assetB?: string;
  quantityB?: unknown;

  recipientCount?: number;
  subassetLongname?: string;

  /**
   * Render a quantity in display units for the given asset.
   *
   * Supplied by the adapter rather than fixed here: the API decode can consult `asset_info`, the
   * local unpack cannot, and a describer that assumed divisibility would reintroduce the 1e8
   * class of error this consolidation exists to remove.
   */
  format: (quantity: unknown, asset?: string) => string;

  /** Display name for an asset, preferring a subasset longname where the decoder has one. */
  name?: (asset?: string) => string;
}

/** Title-case a message type for the small label above the headline. */
export function labelFor(messageType: string): string {
  return messageType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The single description switch.
 *
 * Returns null for a type this build cannot describe, which the caller must treat as "no
 * description" rather than substituting a generic one — an unrecognised message reaching the
 * approval screen already fails verification and blocks signing.
 */
export function describeMessage(
  messageType: string,
  m: DescribableMessage
): string | null {
  const q = (quantity: unknown, asset?: string) => m.format(quantity, asset);
  const n = (asset?: string) => (m.name ? m.name(asset) : (asset ?? ''));

  switch (messageType) {
    case 'enhanced_send':
    case 'send':
      return m.destination
        ? `Send ${q(m.quantity, m.asset)} ${n(m.asset)} to ${m.destination}`
        : `Send ${q(m.quantity, m.asset)} ${n(m.asset)}`;

    case 'mpma_send':
      // Recipients live in the payload rather than in outputs, so the count is the only thing a
      // one-line summary can honestly state; the recipients themselves are listed separately.
      return `Send to ${m.recipientCount ?? 0} recipient${m.recipientCount === 1 ? '' : 's'}`;

    case 'order':
      return `DEX Order: Give ${q(m.giveQuantity, m.giveAsset)} ${n(m.giveAsset)} for ${q(m.getQuantity, m.getAsset)} ${n(m.getAsset)}`;

    case 'cancel':
      return `Cancel Order: ${m.offerHash ?? ''}`;

    case 'dispenser':
      return `Create Dispenser: ${q(m.quantity, m.asset)} ${n(m.asset)} per ${m.mainchainrate} sats`;

    case 'dispense':
      // The payload is a marker byte; which dispenser is triggered is decided by the outputs,
      // which the approval screen shows directly.
      return 'Trigger a dispenser';

    case 'issuance':
    case 'subasset_issuance':
    case 'lr_issuance':
    case 'lr_subasset': {
      const asset = m.subassetLongname || n(m.asset);
      return m.quantity != null && m.quantity !== 0n && m.quantity !== 0
        ? `Issue Asset: ${asset} (${q(m.quantity, m.asset)} units)`
        : `Issue Asset: ${asset}`;
    }

    case 'dividend':
      return `Pay Dividend: ${q(m.quantityPerUnit, m.dividendAsset)} ${n(m.dividendAsset)} per ${n(m.asset)}`;

    case 'btcpay':
      return 'BTC Pay for Order Match';

    case 'sweep':
      return `Sweep to ${m.destination ?? ''}`;

    case 'broadcast':
      return `Broadcast: ${m.text || 'message'}`;

    case 'fairminter':
      return `Create Fairminter: ${n(m.asset)}`;

    case 'fairmint':
      return `Mint from Fairminter: ${n(m.asset)}`;

    case 'pooldeposit':
      return `Deposit liquidity: ${q(m.quantityA, m.assetA)} ${n(m.assetA)} and ${q(m.quantityB, m.assetB)} ${n(m.assetB)}`;

    case 'poolwithdraw':
      return `Withdraw liquidity: burn ${q(m.quantity, undefined)} LP tokens from ${n(m.assetA)}/${n(m.assetB)}`;

    case 'attach':
      return `Attach ${q(m.quantity, m.asset)} ${n(m.asset)} to UTXO`;

    case 'detach':
      // The payload carries one field — where everything on the UTXO goes.
      return m.destination
        ? `Detach all assets from UTXO to ${m.destination}`
        : 'Detach all assets from UTXO';

    // Both the API and the local unpack call this type `utxo`; `utxo_move` is accepted because
    // older records and tests use it.
    case 'utxo':
    case 'utxo_move':
      return `Move ${q(m.quantity, m.asset)} ${n(m.asset)} to ${m.destination ?? ''}`;

    case 'destroy':
      return `Destroy ${q(m.quantity, m.asset)} ${n(m.asset)}`;

    default:
      return null;
  }
}

export type { DisplayUnits };
