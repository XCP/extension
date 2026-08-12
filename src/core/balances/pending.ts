/**
 * What the mempool is about to do to a balance.
 *
 * The problem this solves: `/addresses/{address}/balances` is the confirmed ledger. Counterparty
 * debits at parse time, so an unconfirmed fairmint leaves the XCP it will spend sitting in your
 * balance looking spendable — and nothing stops you composing a DEX order against the same coins.
 * Whichever confirms second fails.
 *
 * The thing *not* to do is re-derive Counterparty's debit rules here. Which message types debit
 * what, in which order, under which protocol activations, is consensus logic; a second
 * implementation of it in a wallet would be wrong eventually and wrong silently. Core already
 * parses mempool transactions and emits the same DEBIT and CREDIT events it emits for confirmed
 * ones, with `action`/`calling_function` naming the reason. So the wallet asks rather than derives.
 *
 * Double counting is core's problem and core handles it: when a block is parsed, the mempool rows
 * for the transactions it contained are deleted in the *same* database transaction that marks the
 * block parsed (`parser/blocks.py`), specifically so an API reader cannot observe a transaction as
 * both confirmed and pending. There is no window to defend against here.
 *
 * What this cannot see: a transaction the queried node has not accepted into its own mempool.
 * Mempools differ, and a wallet pointed at a node that never saw the broadcast will show nothing
 * pending. That is a floor on what any client-side answer can claim, which is why the UI wording
 * this feeds should describe what is known rather than assert what is spendable.
 */

import { toBigNumber } from '@/core/numeric';

/** A DEBIT or CREDIT the node has parsed out of a mempool transaction. */
export interface MempoolLedgerEvent {
  tx_hash: string;
  event: string;
  params?: {
    address?: string;
    asset?: string;
    /** Base units. Unsigned 64-bit, so it may arrive as a string. */
    quantity?: number | string;
    /** Why the debit happened, e.g. "issuance fee". DEBIT only. */
    action?: string;
    /** Why the credit happened, e.g. "issuance". CREDIT only. */
    calling_function?: string;
    /**
     * The same quantity in display units, as core computed it.
     *
     * Preferred over converting `quantity` here, because converting needs the asset's divisibility
     * and this codebase's balance hook defaults that to `true` when it does not know — a wrong
     * `true` is a factor-of-1e8 error in a figure that gates spending. Core knows, so core's number
     * is used and no divisibility is assumed anywhere in this module.
     */
    quantity_normalized?: string;
  };
}

/** The net effect of the mempool on one asset, in base units. */
export interface PendingDelta {
  asset: string;
  /** Leaving the address if these confirm. */
  debited: bigint;
  /** Arriving if these confirm. */
  credited: bigint;
  /** Distinct reasons, in first-seen order, for explaining the figure. */
  reasons: string[];
  /** Distinct transactions contributing, so the UI can link to them. */
  txHashes: string[];
  /**
   * Total leaving, in display units, or null when it cannot be stated exactly.
   *
   * Null when any contributing debit arrived without a normalized figure. It means "there is
   * something outgoing but I cannot total it", which callers must treat as unknown rather than
   * zero: reducing a spendable balance by a number that is missing a term would understate what is
   * committed, and quietly let through the overspend this exists to prevent.
   */
  debitedNormalized: string | null;
}

/**
 * Base units as an exact integer.
 *
 * Counterparty quantities are unsigned 64-bit and a JS double is exact only to 2^53-1, so anything
 * large arrives as a string. `BigInt` is exact for both; `Number` would silently round, which for a
 * balance is the whole bug this module exists to avoid. Anything not a whole number is rejected
 * rather than truncated — a fractional base unit means the value is not what this thinks it is.
 */
function toBaseUnits(value: number | string | undefined): bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? BigInt(value) : null;
  }
  const trimmed = value.trim();
  return /^-?\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

/**
 * Running total of display-unit debits, where a single missing figure poisons the total.
 *
 * Once null it stays null: a sum missing one of its terms is not a smaller sum, it is an unknown
 * one, and the difference matters when the result decides how much someone may spend.
 */
function addNormalized(running: string | null, next: string | undefined): string | null {
  if (running === null) return null;
  if (next === undefined || !/^-?\d*\.?\d+$/.test(next.trim())) return null;
  return toBigNumber(running).plus(toBigNumber(next.trim())).toString();
}

function addReason(delta: PendingDelta, reason: string | undefined): void {
  if (reason && !delta.reasons.includes(reason)) delta.reasons.push(reason);
}

/**
 * Fold mempool ledger events into a per-asset view of what is pending for one address.
 *
 * `address` is matched exactly against each event's own `params.address`. The endpoint that
 * supplies these matches addresses with a SQL `LIKE '%address%'` against a joined column, so its
 * results are a superset by construction — filtering here is what makes the answer this address's
 * rather than a neighbour's.
 *
 * Events missing an address, asset or a readable quantity are skipped: a partial figure presented
 * as a balance is worse than admitting the mempool holds something unreadable, which
 * {@link countUnreadable} reports separately.
 */
export function pendingByAsset(
  events: MempoolLedgerEvent[],
  address: string
): Map<string, PendingDelta> {
  const byAsset = new Map<string, PendingDelta>();

  for (const event of events) {
    const params = event.params;
    if (!params || params.address !== address) continue;

    const asset = params.asset;
    if (!asset) continue;

    const quantity = toBaseUnits(params.quantity);
    if (quantity === null) continue;

    let delta = byAsset.get(asset);
    if (!delta) {
      delta = { asset, debited: 0n, credited: 0n, reasons: [], txHashes: [], debitedNormalized: '0' };
      byAsset.set(asset, delta);
    }

    if (event.event === 'DEBIT') {
      delta.debited += quantity;
      delta.debitedNormalized = addNormalized(delta.debitedNormalized, params.quantity_normalized);
      addReason(delta, params.action);
    } else if (event.event === 'CREDIT') {
      delta.credited += quantity;
      addReason(delta, params.calling_function);
    } else {
      continue;
    }

    if (!delta.txHashes.includes(event.tx_hash)) delta.txHashes.push(event.tx_hash);
  }

  // A zero net with no reasons carries no information; a zero net *with* reasons does (something is
  // in flight that happens to balance out), so only the truly empty are dropped.
  for (const [asset, delta] of byAsset) {
    if (delta.debited === 0n && delta.credited === 0n && delta.reasons.length === 0) {
      byAsset.delete(asset);
    }
  }

  return byAsset;
}

/**
 * The same fold, keyed on the UTXO a movement touches rather than the asset.
 *
 * A UTXO row asks a different question from a balance row. "Is this particular output being
 * detached" is not answered by "something is happening to XCP", and an address moving one of five
 * attached outputs should mark one row rather than all of them. Ledger events name the UTXO they
 * concern, so this groups on that; events without one are address-level and belong to
 * {@link pendingByAsset}.
 */
export function pendingByUtxo(
  events: MempoolLedgerEvent[],
  address: string
): Map<string, PendingDelta> {
  const byUtxo = new Map<string, PendingDelta>();

  for (const event of events) {
    if (event.event !== 'DEBIT' && event.event !== 'CREDIT') continue;

    const params = event.params as
      | (NonNullable<MempoolLedgerEvent['params']> & { utxo?: string; utxo_address?: string })
      | undefined;
    if (!params) continue;

    const utxo = params.utxo;
    if (typeof utxo !== 'string' || utxo.length === 0) continue;
    // Ownership must be positive, not merely unexcluded. The endpoint matches addresses with a
    // SQL LIKE, so its results are a superset, and a UTXO-held balance names its owner in
    // `utxo_address` (with `address` unset) while an address-level movement does the reverse. An
    // event naming us in neither field is someone else's, whatever fields it happens to omit —
    // the earlier exclude-on-mismatch guard let an event with both fields absent through.
    if (params.utxo_address !== address && params.address !== address) continue;

    const asset = params.asset;
    const quantity = toBaseUnits(params.quantity);
    if (!asset || quantity === null) continue;

    let delta = byUtxo.get(utxo);
    if (!delta) {
      delta = { asset, debited: 0n, credited: 0n, reasons: [], txHashes: [], debitedNormalized: '0' };
      byUtxo.set(utxo, delta);
    }

    if (event.event === 'DEBIT') {
      delta.debited += quantity;
      delta.debitedNormalized = addNormalized(delta.debitedNormalized, params.quantity_normalized);
      addReason(delta, params.action);
    } else {
      delta.credited += quantity;
      addReason(delta, params.calling_function);
    }

    if (!delta.txHashes.includes(event.tx_hash)) delta.txHashes.push(event.tx_hash);
  }

  return byUtxo;
}

/**
 * Events for this address that could not be folded in — an unreadable quantity, a missing asset.
 *
 * Reported rather than ignored. "Something is pending that I could not total" is a different
 * statement from "nothing is pending", and only one of them is safe to render as a balance.
 */
export function countUnreadable(events: MempoolLedgerEvent[], address: string): number {
  let unreadable = 0;
  for (const event of events) {
    if (event.event !== 'DEBIT' && event.event !== 'CREDIT') continue;
    const params = event.params;
    if (!params || params.address !== address) continue;
    if (!params.asset || toBaseUnits(params.quantity) === null) unreadable += 1;
  }
  return unreadable;
}

/** What a balance row should say about one asset. */
export interface PendingSummary {
  /** Confirmed, straight from the ledger. Never adjusted. */
  confirmed: bigint;
  /** Confirmed minus pending debits: what a new transaction can actually draw on. */
  spendable: bigint;
  /** Pending debits, as a positive number. */
  outgoing: bigint;
  /** Pending credits, as a positive number. */
  incoming: bigint;
  reasons: string[];
  /**
   * True when pending debits exceed the confirmed balance, which the ledger says cannot happen.
   * Signals a disagreement — a node mid-reorg, a stale balance read — rather than a spendable
   * figure, so callers show the confirmed number and say nothing about spendable.
   */
  inconsistent: boolean;
}

/**
 * Combine a confirmed balance with the pending view.
 *
 * `spendable` is deliberately a separate figure rather than a replacement for `confirmed`. A
 * headline number that quietly changes meaning is its own defect: someone who reads "4 XCP" and
 * later reads "0 XCP" with no explanation has been told two different things by the same label.
 * Show the confirmed balance, and say what is in flight beside it.
 */
export function summarize(confirmed: bigint, delta: PendingDelta | undefined): PendingSummary {
  const outgoing = delta?.debited ?? 0n;
  const incoming = delta?.credited ?? 0n;
  const inconsistent = outgoing > confirmed;

  return {
    confirmed,
    spendable: inconsistent ? confirmed : confirmed - outgoing,
    outgoing,
    incoming,
    reasons: delta?.reasons ?? [],
    inconsistent,
  };
}
