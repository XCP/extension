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

import {
  type DisplayUnits,
  divide,
  isGreaterThan,
  isLessThan,
  isLessThanOrEqualTo,
  multiply,
  roundDown,
  toBigNumber,
  toGroupedString,
} from '@/core/numeric';

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
  /** One-line account of the order a cancel refers to, when it could be resolved. */
  cancelledOrderSummary?: string;
  /** Output index an attach targets. */
  destinationVout?: number;
  /** MIME type a broadcast declares; absent means plain text. */
  mimeType?: string;
  /** Numeric value a broadcast carries, for feeds and oracles. */
  value?: number;
  /** Fee fraction an oracle broadcast charges, as an integer of 1e8. */
  feeFractionInt?: number;
  subassetLongname?: string;

  /** Sweep flags, already decoded: what the sweep carries. */
  sweepBalances?: boolean;
  sweepOwnership?: boolean;
  /** Issuance switches, read from the wire rather than inferred from the message type. */
  divisible?: boolean;
  lock?: boolean;
  reset?: boolean;
  /** The outpoint a utxo move spends from. */
  sourceUtxo?: string;
  /** BTC an order requires alongside it, for orders whose give or get side is BTC. */
  feeRequired?: unknown;
  /** The pool an LP operation belongs to. */
  lpAsset?: string;
  /** MPMA recipients, which travel in the payload rather than in outputs. */
  recipients?: { asset?: string; destination: string; quantity: unknown }[];
  /**
   * A dispenser message's status: 0 open, 1 open with an empty address, 10 closed
   * (core `messages/dispenser.py`).
   *
   * Opening a dispenser commits assets to it; closing one shuts it down and refunds what is left.
   * Both carry the same fields, so without this the two opposite acts rendered identically.
   */
  dispenserStatus?: number;

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

  /**
   * A quantity in display units as a plain number string — no separators, no unit, no caveat.
   *
   * Derived figures (an order's price, a destroy's share of supply) need arithmetic, and `format`'s
   * output is not a valid input for it: separators must be stripped and the "(decimals unconfirmed)"
   * caveat parses to NaN.
   *
   * Returns undefined when divisibility is not established — a derived figure must be withheld
   * rather than computed against an assumed scale.
   */
  numeric?: (quantity: unknown, asset?: string) => string | undefined;
}

/**
 * The small label above the headline.
 *
 * Title-casing the wire name alone produced "Mpma Send", "Btcpay", "Lr Issuance" and "Utxo" — the
 * protocol's internal spelling shown to someone who has never read the protocol. Types whose name
 * does not survive that treatment are spelled out; the rest fall through to title case.
 */
/** Core `messages/dispenser.py`: 0 open, 1 open with an empty address, 10 closed. */
const DISPENSER_STATUS_CLOSED = 10;

const TYPE_LABELS: Record<string, string> = {
  enhanced_send: 'Send',
  mpma_send: 'Multi-Send',
  btcpay: 'BTC Payment',
  lr_issuance: 'Issuance',
  lr_subasset: 'Subasset Issuance',
  pooldeposit: 'Pool Deposit',
  poolwithdraw: 'Pool Withdrawal',
  utxo: 'UTXO Move',
  utxo_move: 'UTXO Move',
  // One word, the way the protocol and the rest of this wallet spell them.
  fairminter: 'Fairminter',
  fairmint: 'Fairmint',
};

export function labelFor(messageType: string): string {
  return (
    TYPE_LABELS[messageType] ??
    messageType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
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
      return `Give ${q(m.giveQuantity, m.giveAsset)} ${n(m.giveAsset)} for ${q(m.getQuantity, m.getAsset)} ${n(m.getAsset)}`;

    case 'cancel':
      // Name the trade where the order resolved; otherwise say what is being done and leave the
      // hash to the detail list, which is where 64 characters belong.
      return m.cancelledOrderSummary
        ? `Cancel order: ${m.cancelledOrderSummary}`
        : 'Cancel a DEX order';

    case 'dispenser':
      // Closing refunds the escrow and shuts the dispenser down; opening commits assets to it.
      // Both messages carry the same fields, so describing them identically stated the opposite of
      // what half of them do.
      if (m.dispenserStatus === DISPENSER_STATUS_CLOSED) {
        return `Close the ${n(m.asset)} dispenser`;
      }
      // giveQuantity, not quantity: a dispenser's payout per trigger. Reading `quantity` here
      // rendered every dispenser as "? XCP".
      return `${q(m.giveQuantity, m.asset)} ${n(m.asset)} per ${toGroupedString((m.mainchainrate ?? 0) as string | number, 0)} sats`;

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
        ? `${asset} — issue ${q(m.quantity, m.asset)}`
        : `${asset} — no new supply`;
    }

    case 'dividend':
      return `${q(m.quantityPerUnit, m.dividendAsset)} ${n(m.dividendAsset)} per ${n(m.asset)}`;

    case 'btcpay':
      // Not "BTC Pay for Order Match": that is the label above it, and the eyebrow repeating the
      // headline is the pattern being removed everywhere else. Say what it does instead.
      return 'Pay BTC to settle a matched order';

    case 'sweep':
      return `Sweep to ${m.destination ?? ''}`;

    case 'broadcast':
      return m.text || 'an empty message';

    case 'fairminter':
      return n(m.asset);

    case 'fairmint':
      // The quantity is optional: a fairmint may take the fairminter's lot size. With no amount
      // to state, name the asset rather than formatting nothing as "?".
      return m.quantity == null ? n(m.asset) : `${q(m.quantity, m.asset)} ${n(m.asset)}`;

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

/**
 * Ledger facts the message itself does not carry, looked up so the detail list can say what the
 * transaction means rather than only what it contains.
 *
 * A cancel names an order by hash and nothing else; a destroy names an amount with no sense of
 * scale; a dividend names a rate whose total cost depends on the supply it is paid across. None of
 * that is in the bytes, and this is the class of question the API is the right source for.
 */
export interface ProtocolContext {
  /** The order a cancel refers to, when it could be resolved. */
  cancelledOrder?: {
    giveQuantity: string;
    giveAsset: string;
    getQuantity: string;
    getAsset: string;
  };
  /** Total supply of the message's own asset, in display units. */
  assetSupply?: string;
  /** Total dividend payable: the per-unit rate across the paying asset's supply. */
  dividendTotal?: string;
  /**
   * The transaction's own id, so an attach can name the UTXO it creates. Core builds that
   * destination as `f"{tx_hash}:{destination_vout}"`, which is the one thing an attach produces
   * and the thing worth checking — the asset and amount are already in the headline above.
   */
  transactionId?: string;
  /**
   * XCP charged by the protocol, in display units. Attach and detach carry a fee that scales with
   * demand (`gas.get_transaction_fee`), and it is always paid in XCP, so it is a cost the sender
   * bears beyond the Bitcoin fee.
   */
  protocolFeeXcp?: string;
  /** Assets attached to the UTXO a detach releases, in display units. */
  detachingAssets?: string[];
  /**
   * Blocks left to pay a BTCPay before its order match expires.
   *
   * Core sets `match_expire_index = block_index + 20` (order.py), so a payment landing after that
   * does nothing — the match is gone and the BTC is spent for no effect. Negative means expired.
   */
  btcpayBlocksLeft?: number;
  /**
   * What each triggered dispenser pays back, one line per payout.
   *
   * Core pays from every open dispenser at the address, so this is a list and not a single asset.
   */
  dispensePayouts?: string[];
  /** XCP a dividend costs beyond the distributed asset: core charges a per-holder fee. */
  dividendFeeXcp?: string;
}

/** A labelled field of the Counterparty message, for the protocol detail list. */
export interface ProtocolField {
  label: string;
  value: string;
}

/**
 * The message's own fields, for a section separate from the Bitcoin view of the transaction.
 *
 * The headline is one line and necessarily loses most of what a message says: a fairminter's
 * headline is its asset name, while the thing being agreed to is a set of caps, a price and a
 * deadline. Those belong on screen, and they belong apart from inputs and outputs — the Bitcoin
 * view answers "what moves", this answers "what does the protocol do".
 *
 * Empty for a type whose headline already says everything it carries.
 */
/**
 * An order's price, phrased so its direction is explicit: "1 XCP = 200 PEPECASH" rather than
 * "200 PEPECASH per XCP", which requires knowing which side was divided by.
 */
function priceOf(m: DescribableMessage, n: (asset?: string) => string): string | undefined {
  const give = m.numeric?.(m.giveQuantity, m.giveAsset);
  const get = m.numeric?.(m.getQuantity, m.getAsset);
  if (give === undefined || get === undefined) return undefined;

  if (!toBigNumber(give).isFinite() || !toBigNumber(get).isFinite()) return undefined;
  if (isLessThanOrEqualTo(give, 0)) return undefined;

  return `1 ${n(m.giveAsset)} = ${toGroupedString(divide(get, give))} ${n(m.getAsset)}`;
}

/**
 * How many dispenses a dispenser can still pay out, from what it holds and what it gives.
 *
 * "Dispenses" rather than "triggers" only because the compose flow already counts them that way
 * ("# of Dispenses"); the act itself is still called triggering a dispenser.
 */
function dispensesAvailable(m: DescribableMessage): string | undefined {
  const escrow = m.numeric?.(m.escrowQuantity, m.asset);
  const give = m.numeric?.(m.giveQuantity, m.asset);
  if (escrow === undefined || give === undefined) return undefined;

  if (!toBigNumber(give).isFinite() || isLessThanOrEqualTo(give, 0)) return undefined;
  if (!toBigNumber(escrow).isFinite()) return undefined;

  return toGroupedString(roundDown(divide(escrow, give)), 0);
}

/** What a sweep carries, from its flags - balances, ownership, or both. */
function sweepContents(m: DescribableMessage): string | undefined {
  if (m.sweepBalances && m.sweepOwnership) return 'All balances and asset ownership';
  if (m.sweepOwnership) return 'Asset ownership only';
  if (m.sweepBalances) return 'All balances';
  return undefined;
}

/** A destroy's share of the asset's total supply, so the amount has a scale. */
function shareOfSupply(m: DescribableMessage, supply?: string): string | undefined {
  if (!supply) return undefined;
  const destroyed = m.numeric?.(m.quantity, m.asset);
  if (destroyed === undefined) return undefined;

  const total = supply.replace(/,/g, '');
  if (!toBigNumber(total).isFinite() || !toBigNumber(destroyed).isFinite()) return undefined;
  if (isLessThanOrEqualTo(total, 0)) return undefined;

  const pct = multiply(divide(destroyed, total), 100);
  // Nothing can destroy more than the supply. A figure above 100% means the two sides are in
  // different units, and printing it would be stating a number we have just shown to be wrong.
  if (isGreaterThan(pct, 100)) return undefined;
  return isLessThan(pct, 0.01) ? '<0.01%' : `${pct.toFixed(2)}%`;
}

export function protocolFields(
  messageType: string,
  m: DescribableMessage,
  context: ProtocolContext = {}
): ProtocolField[] {
  const q = (quantity: unknown, asset?: string) => m.format(quantity, asset);
  const n = (asset?: string) => (m.name ? m.name(asset) : (asset ?? ''));
  const fields: ProtocolField[] = [];
  const add = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    fields.push({ label, value: String(value) });
  };

  /**
   * A quantity with its asset, or nothing when the message does not carry one.
   *
   * Every field here is optional in some variant of its message — a fairminter can leave the caps
   * unset, a dispenser can omit the escrow. Formatting an absent quantity yields "?", and pairing
   * that with an asset name printed "Lot size: ? A95428957068369061" on screen: a row that states
   * only that we have nothing to state. A row we cannot fill does not belong on the list.
   */
  const amount = (quantity: unknown, asset?: string, unit?: string): string | undefined => {
    if (quantity === undefined || quantity === null) return undefined;
    const formatted = q(quantity, asset);
    if (formatted === '?') return undefined;
    const suffix = unit ?? n(asset);
    return suffix ? `${formatted} ${suffix}` : formatted;
  };

  switch (messageType) {
    case 'enhanced_send':
    case 'send':
      // Asset, amount and destination are the headline in full; the memo is the only field it
      // cannot carry.
      add('Memo', m.memo);
      break;

    case 'mpma_send':
      // The headline can only state a count, because the recipients are in the payload rather than
      // in outputs - so this list is the only account of who is paid. One row per recipient in the
      // same shape as every other row: the label names the field, the value carries the data.
      for (const r of m.recipients ?? []) {
        const paid = amount(r.quantity, r.asset);
        if (paid) add('Recipient', `${paid} to ${r.destination}`);
      }
      break;

    case 'order':
      add('Price', priceOf(m, n));
      // Only orders with a BTC side carry one; every other order sets it to zero, and a row
      // reading "BTC fee: 0.00000000 BTC" is noise on the majority of orders.
      if (m.feeRequired != null && isGreaterThan(String(m.feeRequired), 0)) {
        add('BTC fee', amount(m.feeRequired, 'BTC', 'BTC'));
      }
      add('Expiry', m.expiration ? `${m.expiration.toLocaleString()} blocks` : undefined);
      break;

    case 'dispenser':
      // Closing is stated in the headline and refunds rather than commits, so the escrow figures
      // describe the opening case only.
      if (m.dispenserStatus !== DISPENSER_STATUS_CLOSED) {
        add('Escrow', amount(m.escrowQuantity, m.asset));
        add('Dispenses', dispensesAvailable(m));
      }
      break;

    case 'dispense':
      // "Trigger a dispenser" says nothing about what comes back, and core pays out from every
      // open dispenser at the address - so one payment can return several assets.
      for (const payout of context.dispensePayouts ?? []) add('You receive', payout);
      break;

    case 'fairminter':
      // The headline is the asset name alone; everything being agreed to is here.
      add('XCP price', amount(m.giveQuantity, 'XCP', 'XCP'));
      add('Lot size', amount(m.quantityA, m.asset));
      add('Hard cap', amount(m.getQuantity, m.asset));
      add('Soft cap', amount(m.quantityB, m.asset));
      add('Deadline', m.expiration ? `block ${m.expiration.toLocaleString()}` : undefined);
      break;

    case 'fairmint':
      // Headline: the amount being minted. Not in it: what it costs. "XCP price" rather than
      // "Cost", because this is a purchase price and the same screen uses "XCP fee" for the
      // protocol charge on attach, detach and dividend - one name per concept.
      add('XCP price', context.protocolFeeXcp ? `${context.protocolFeeXcp} XCP` : undefined);
      break;

    case 'issuance':
    case 'subasset_issuance':
    case 'lr_issuance':
    case 'lr_subasset':
      // Ordered by consequence: the switches that cannot be undone and the change of owner come
      // before a description that can run several lines and change nothing.
      if (m.lock) add('Lock', 'Yes - supply can never be increased again');
      if (m.reset) add('Reset', 'Yes - existing supply is destroyed and replaced');
      add('New owner', m.destination);
      if (m.divisible !== undefined) add('Divisible', m.divisible ? 'Yes' : 'No');
      add('Description', m.text);
      break;

    case 'dividend':
      // Headline: the rate. Here: the bill, before the supply it is measured against.
      add(
        'Total payout',
        context.dividendTotal ? `${context.dividendTotal} ${n(m.dividendAsset)}` : undefined
      );
      add('XCP fee', context.dividendFeeXcp ? `${context.dividendFeeXcp} XCP` : undefined);
      add('Supply', context.assetSupply ? `${context.assetSupply} ${n(m.asset)}` : undefined);
      break;

    case 'destroy':
      // Headline: the amount. Without the supply it has no sense of scale - destroying 1,000 of
      // 1,000 is a very different act from destroying 1,000 of a billion.
      add('Share of supply', shareOfSupply(m, context.assetSupply));
      add(
        'Total supply',
        context.assetSupply ? `${context.assetSupply} ${n(m.asset)}` : undefined
      );
      add('Tag', m.memo);
      break;

    case 'sweep':
      // Headline: the destination. Not in it: what actually moves, which is the whole question -
      // a sweep can hand over asset ownership as well as balances.
      add('Includes', sweepContents(m));
      add('Memo', m.memo);
      break;

    case 'broadcast': {
      // The text is the headline. What is not visible there is what kind of broadcast this is: a
      // feed carrying a value and a fee, or content inscribed under a MIME type.
      const mime = m.mimeType && m.mimeType !== '' ? m.mimeType : 'text/plain';
      add('Format', mime === 'text/plain' ? 'Plain text' : mime);
      if (mime !== 'text/plain') {
        add('Content', 'Inscribed - this broadcast carries data, not a message');
      }
      if (m.value) add('Value', m.value.toLocaleString());
      if (m.feeFractionInt) {
        // Stored as an integer of 1e8; a feed's cut of what it settles.
        add('Fee fraction', `${(m.feeFractionInt / 1e6).toFixed(2)}%`);
      }
      break;
    }

    case 'btcpay':
      // The headline is the same sentence for every BTCPay. Whether there is still time to pay is
      // the part that can make this transaction worthless, so it comes before the identifier.
      if (context.btcpayBlocksLeft !== undefined) {
        add(
          'Time left',
          context.btcpayBlocksLeft > 0
            ? `${context.btcpayBlocksLeft} block${context.btcpayBlocksLeft === 1 ? '' : 's'}`
            : 'Expired - this payment will not settle the match'
        );
      }
      add('Order match', m.offerHash);
      break;

    case 'cancel':
      // The headline names the order in words where it resolved; the hash is what goes on chain.
      add('Order hash', m.offerHash);
      break;

    case 'pooldeposit':
    case 'poolwithdraw':
      // Both amounts are the headline; the pool they belong to is not.
      add('Pool', m.lpAsset ? n(m.lpAsset) : undefined);
      break;

    case 'attach':
      // The XCP fee is a cost; the UTXO is an identifier, so it comes second. Asset and amount are
      // already stated in the headline.
      add('XCP fee', context.protocolFeeXcp ? `${context.protocolFeeXcp} XCP` : undefined);
      add(
        'New UTXO',
        context.transactionId !== undefined && m.destinationVout !== undefined
          ? `${context.transactionId}:${m.destinationVout}`
          : undefined
      );
      break;

    case 'detach':
      // The destination is in the headline. What is not is which balances come back.
      for (const asset of context.detachingAssets ?? []) add('Released', asset);
      add('XCP fee', context.protocolFeeXcp ? `${context.protocolFeeXcp} XCP` : undefined);
      break;

    case 'utxo':
    case 'utxo_move':
      // Asset, amount and destination are the headline; which UTXO is being emptied is not.
      add('From UTXO', m.sourceUtxo);
      break;

    default:
      break;
  }

  return fields;
}
