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
