/**
 * This wallet does not sign oracle-priced dispensers.
 *
 * An oracle dispenser prices in fiat: core converts the BTC paid using the oracle address's most
 * recent broadcast (`messages/dispense.py::get_must_give` → `ledger.other.get_oracle_last_price`).
 *
 * That lookup is
 *
 *     SELECT * FROM broadcasts
 *     WHERE source = :source AND status = 'valid' AND block_index < :block_index
 *     ORDER BY tx_index DESC LIMIT 1
 *
 * — with no bound on age. There is no staleness check anywhere in core: a price broadcast years ago
 * is applied verbatim today, and most oracle feeds stopped publishing long ago. Two consequences
 * make this unsignable rather than merely unwise:
 *
 *  1. The rate is not fixed when you approve. The oracle's owner can broadcast a new price in any
 *     block before the transaction confirms, and core will use the newest one below the confirming
 *     block. What the BTC buys is decided after the signature, by a third party.
 *  2. Where the feed is dead, the price applied is whatever the market happened to be on the day it
 *     stopped, which has no relationship to what the payer thinks they are paying.
 *
 * The approval screen's job is to say what will happen if you approve. For an oracle dispenser it
 * cannot, so this refuses instead of showing a number it cannot stand behind. Fixed-rate dispensers
 * — the overwhelming majority — are unaffected.
 */

import type { SecurityWarning } from '@/core/counterparty/transactionSafety';

/** Refuse a dispense that would trigger an oracle-priced dispenser. */
export function oracleDispenseWarning(oracleAssets: string[]): SecurityWarning | null {
  if (oracleAssets.length === 0) return null;
  return {
    severity: 'block',
    title: 'Blocked: Oracle-Priced Dispenser',
    message:
      `This payment would trigger an oracle-priced dispenser (${oracleAssets.join(', ')}). ` +
      'Its rate comes from a price feed with no expiry, which the feed owner can change after ' +
      'you sign — so how much you receive cannot be stated here. This wallet does not sign them.',
  };
}

/** Refuse the creation of a dispenser that prices from an oracle. */
export function oracleDispenserWarning(oracleAddress: unknown): SecurityWarning | null {
  if (typeof oracleAddress !== 'string' || oracleAddress === '') return null;
  return {
    severity: 'block',
    title: 'Blocked: Oracle-Priced Dispenser',
    message:
      `This would open a dispenser priced by the feed at ${oracleAddress} rather than at a fixed ` +
      'rate. Core applies that feed’s latest broadcast with no check on its age, so the price ' +
      'buyers pay is not the one set here. This wallet does not sign them.',
  };
}
