import { describe, expect, it } from 'vitest';
import { spendableBalance, tracksPendingLedgerDebits } from '../spendable';

describe('spendableBalance', () => {
  // The case that started this: hold 10, one committed in the mempool, Max should offer 9.
  it('subtracts what the mempool has committed', () => {
    const result = spendableBalance('10', '1');

    expect(result.spendable).toBe('9');
    expect(result.pendingOutgoing).toBe('1');
    expect(result.unknownPending).toBe(false);
  });

  it('offers the whole balance when nothing is pending', () => {
    expect(spendableBalance('10', '0').spendable).toBe('10');
    expect(spendableBalance('10', undefined).spendable).toBe('10');
  });

  it('is exact with fractional amounts', () => {
    expect(spendableBalance('1.5', '0.25').spendable).toBe('1.25');
  });

  // Eight decimal places is the divisible-asset floor; binary floating point would lose it.
  it('does not lose the eighth decimal place', () => {
    expect(spendableBalance('0.00000003', '0.00000001').spendable).toBe('0.00000002');
  });

  it('handles a balance far above the safe integer range', () => {
    expect(spendableBalance('99526925811111111', '11111111').spendable).toBe('99526925800000000');
  });

  // The whole point of the null: a total missing one of its terms is unknown, not smaller.
  // Subtracting a partial figure would understate what is committed and let the overspend through
  // while looking as though it had been handled.
  it('subtracts nothing when the pending total cannot be stated', () => {
    const result = spendableBalance('10', null);

    expect(result.spendable).toBe('10');
    expect(result.unknownPending).toBe(true);
  });

  it('distinguishes an unknown total from an absent one', () => {
    expect(spendableBalance('10', null).unknownPending).toBe(true);
    expect(spendableBalance('10', undefined).unknownPending).toBe(false);
  });

  // Impossible per the ledger, so it means the two reads disagree. Zero cannot cause an overspend;
  // a negative Max would be nonsense.
  it('offers zero rather than a negative when pending exceeds the balance', () => {
    expect(spendableBalance('1', '5').spendable).toBe('0');
  });

  it('treats a missing balance as nothing spendable', () => {
    expect(spendableBalance(null, '1').spendable).toBe('0');
    expect(spendableBalance(undefined, undefined).spendable).toBe('0');
  });
});

describe('tracksPendingLedgerDebits', () => {
  // BTC's balance comes from the UTXO set, and a pending BTC send produces no Counterparty DEBIT.
  // Subtracting one from the other would be arithmetic across two unrelated systems.
  it('excludes BTC', () => {
    expect(tracksPendingLedgerDebits('BTC')).toBe(false);
    expect(tracksPendingLedgerDebits('btc')).toBe(false);
  });

  // Callers reach here before an asset has been chosen.
  it('answers false for an absent asset rather than throwing', () => {
    expect(tracksPendingLedgerDebits(null)).toBe(false);
    expect(tracksPendingLedgerDebits(undefined)).toBe(false);
    expect(tracksPendingLedgerDebits('')).toBe(false);
  });

  it('includes Counterparty assets', () => {
    expect(tracksPendingLedgerDebits('XCP')).toBe(true);
    expect(tracksPendingLedgerDebits('PEPECASH')).toBe(true);
    expect(tracksPendingLedgerDebits('A95428956661682177')).toBe(true);
  });
});
