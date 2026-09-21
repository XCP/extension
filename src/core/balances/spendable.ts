/**
 * How much of a balance a new transaction may actually draw on.
 *
 * Counterparty debits at parse time, so coins committed by an unconfirmed transaction still sit in
 * the confirmed balance. The node will not stop you spending them twice: `get_balance` reads the
 * confirmed ledger, and a send's compose-time validation does not check sufficiency at all — that
 * happens at consensus, by which point the second transaction is already broadcast and its fee
 * already spent. The wallet is the only place this can be caught.
 *
 * So Max offers what is spendable while the balance keeps showing what is held. Both are true, and
 * conflating them is what makes a number people rely on start changing meaning: someone who reads
 * "10" on the card and "9" in the form is being told two different facts, which is fine as long as
 * the form says why. Someone whose card silently reads "9" has been told one wrong one.
 *
 * ## The direction this errs in
 *
 * If a pending transaction never confirms — dropped, replaced, never relayed — Max offered 9 when
 * 10 was really available. The user sends again later and nothing is lost. The opposite mistake
 * broadcasts a transaction that fails at consensus and spends a fee for nothing. Under-offering is
 * recoverable, over-offering is not, so every unknown here resolves towards offering less.
 *
 * Except one: when the pending total cannot be *stated*, nothing is subtracted at all. That is not
 * an exception to the rule but the same rule applied — a partial subtraction understates what is
 * committed and lets the overspend through anyway, while looking as though it was handled.
 */

import { toBigNumber } from '@/core/numeric';

/**
 * Plain decimal, never exponential.
 *
 * BigNumber's `toString` switches to exponent form for small magnitudes, so a spendable balance of
 * two satoshis renders as "2e-8" — which then goes straight into an amount field as literal text.
 * `toFixed` keeps the notation these figures are read and typed in.
 */
function decimal(value: ReturnType<typeof toBigNumber>): string {
  return value.toFixed();
}

/** What a form needs to offer a Max and explain it. */
export interface SpendableBalance {
  /** Display units. What Max should offer. */
  spendable: string;
  /** Display units, positive. What the mempool has committed; zero when nothing is pending. */
  pendingOutgoing: string;
  /** True when a pending debit exists but could not be totalled, so nothing was subtracted. */
  unknownPending: boolean;
}

/**
 * Reduce a confirmed balance by what the mempool has already committed.
 *
 * @param confirmed - Display units, as the balance hooks report it.
 * @param pendingOutgoing - Display units from core's own `quantity_normalized`, or null when a
 *   contributing debit had no readable figure. Null subtracts nothing and says so.
 */
export function spendableBalance(
  confirmed: string | null | undefined,
  pendingOutgoing: string | null | undefined
): SpendableBalance {
  const confirmedAmount = toBigNumber(confirmed ?? '0');

  if (pendingOutgoing === null || pendingOutgoing === undefined) {
    return {
      spendable: decimal(confirmedAmount),
      pendingOutgoing: '0',
      unknownPending: pendingOutgoing === null,
    };
  }

  const pending = toBigNumber(pendingOutgoing);
  if (pending.isLessThanOrEqualTo(0)) {
    return { spendable: decimal(confirmedAmount), pendingOutgoing: '0', unknownPending: false };
  }

  // Pending above the confirmed balance is impossible per the ledger, so it means the two reads
  // disagree — a node mid-reorg, a balance fetched a moment earlier. Offering zero is the
  // conservative reading and cannot produce an overspend; a negative Max would be nonsense.
  const spendable = confirmedAmount.minus(pending);
  return {
    spendable: spendable.isLessThan(0) ? '0' : decimal(spendable),
    pendingOutgoing: decimal(pending),
    unknownPending: false,
  };
}

/**
 * Whether a Counterparty pending figure applies to this asset at all.
 *
 * BTC does not go through the Counterparty ledger — its balance comes from the UTXO set, and a
 * pending BTC send produces no DEBIT event here. Subtracting a Counterparty figure from a BTC
 * balance would be arithmetic between two unrelated systems, and BTC's own unconfirmed handling
 * lives with UTXO selection instead.
 *
 * An absent asset answers false as well: callers pass one before a selection has been made, and
 * there is nothing to track pending movement against.
 */
export function tracksPendingLedgerDebits(asset: string | null | undefined): boolean {
  return !!asset && asset.toUpperCase() !== 'BTC';
}
