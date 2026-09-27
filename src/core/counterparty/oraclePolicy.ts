/**
 * Policy: this wallet does not sign oracle-priced dispensers.
 *
 * An oracle dispenser prices in fiat from the oracle address's latest broadcast
 * (`messages/dispense.py::get_must_give` → `ledger.other.get_oracle_last_price`). That query bounds
 * the broadcast only by block height, never by age, so the rate is whatever was last published and
 * the feed's owner can change it in any block before the transaction confirms. The payout is
 * therefore not knowable at signing time, and these are refused rather than shown with a figure
 * that may not hold. Fixed-rate dispensers are unaffected.
 */

import type { SecurityWarning } from '@/core/counterparty/transactionSafety';

/** Hide oracle listings before calculating prices or offering a dispenser for selection.
 * Keep API responses unfiltered so signing checks can still detect oracle payouts.
 */
export function isFixedRateDispenser(dispenser: { oracle_address?: string | null }): boolean {
  return !dispenser.oracle_address;
}

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

/**
 * Hold a dispense whose dispenser inventory could not be read.
 *
 * The oracle refusal above only fires once the dispensers behind the paid address are known; a
 * failed lookup would otherwise let the same payment through unchecked. Only a dispense raises
 * this — a plain Bitcoin payment never looks dispensers up.
 */
export function dispenserLookupRetryWarning(addresses: string[]): SecurityWarning | null {
  if (addresses.length === 0) return null;
  return {
    severity: 'block',
    code: 'dispenser_lookup_retry',
    title: 'Retry Required: Couldn’t Check the Dispenser',
    message:
      `The wallet couldn’t look up the dispenser at ${addresses.join(', ')}, so it can’t confirm ` +
      'what this payment buys or that the dispenser is one it signs for. Try again in a moment.',
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
