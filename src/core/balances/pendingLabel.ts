/**
 * Turning core's ledger action into a word to show beside a balance.
 *
 * Every string on the left of this table is one core actually writes into a DEBIT or CREDIT
 * (`action=` / `calling_function=` in `counterpartycore/lib`). Nothing here is inferred from
 * context, and that restraint is the point: "locking" reads well next to an asset, but core reports
 * a lock as plain `issuance`, so showing it would mean guessing at intent the ledger never stated.
 * A word we cannot source from the event does not go on the screen.
 *
 * Fees are mapped to the same word as the operation they belong to. A send that debits both the
 * asset and a fee produces two events, and the label should say "Sending" once rather than
 * dissolving into a generic because two reasons disagreed.
 */

/** Present participles, because the thing is happening now. */
const LABELS: Record<string, string> = {
  // Sends and sweeps
  send: 'Sending',
  'mpma send': 'Sending',
  sweep: 'Sweeping',
  'sweep fee': 'Sweeping',

  // DEX
  'open order': 'Ordering',
  'cancel order': 'Cancelling',
  'order match': 'Matching',
  filled: 'Matching',
  btcpay: 'Paying',

  // Issuance
  issuance: 'Issuing',
  'issuance fee': 'Issuing',
  'reset issuance': 'Resetting',

  // Dispensers
  dispense: 'Dispensing',
  'open dispenser': 'Opening',
  'open dispenser empty addr': 'Opening',
  'refill dispenser': 'Refilling',
  'close dispenser': 'Closing',

  // UTXO attachment
  'attach to utxo': 'Attaching',
  'attach to utxo fee': 'Attaching',
  'detach from utxo': 'Detaching',
  'utxo move': 'Moving',

  // Pools
  'pool deposit': 'Depositing',
  'pool deposit fee': 'Depositing',
  'pool withdraw': 'Withdrawing',
  'pool withdraw fee': 'Withdrawing',
  'escrowed pool liquidity': 'Depositing',

  // Fairminters
  'fairminter fee': 'Minting',
  'fairminter pool fee': 'Minting',
  'fairminter pool deposit': 'Minting',
  'unescrowed fairmint payment': 'Minting',
  'unescrowed fairmint': 'Minting',
  'fairmint commission': 'Minting',
  premint: 'Minting',
  'escrowed premint': 'Minting',
  'unescrowed premint': 'Minting',

  // Other
  dividend: 'Paying dividend',
  'dividend fee': 'Paying dividend',
  burn: 'Burning',
};

/** Shown when something is in flight that this table has no word for. */
export const GENERIC_PENDING_LABEL = 'Pending';

/**
 * One word for everything currently in flight against an asset.
 *
 * Returns null when nothing is pending. When the reasons disagree — a send and a dividend in the
 * same block's mempool — it falls back to {@link GENERIC_PENDING_LABEL} rather than picking one and
 * describing the wrong transaction. An unrecognised action does the same, so a protocol addition
 * shows up as "Pending" instead of vanishing from the screen.
 */
export function pendingLabel(reasons: readonly string[]): string | null {
  if (reasons.length === 0) return null;

  const labels = new Set(reasons.map((reason) => LABELS[reason] ?? GENERIC_PENDING_LABEL));
  if (labels.size === 1) {
    return labels.values().next().value ?? GENERIC_PENDING_LABEL;
  }
  return GENERIC_PENDING_LABEL;
}
