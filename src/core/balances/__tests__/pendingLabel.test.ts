import { describe, expect, it } from 'vitest';
import { GENERIC_PENDING_LABEL, pendingLabel } from '../pendingLabel';

describe('pendingLabel', () => {
  it('says nothing when nothing is pending', () => {
    expect(pendingLabel([])).toBeNull();
  });

  it.each([
    ['send', 'Sending'],
    ['sweep', 'Sweeping'],
    ['open order', 'Ordering'],
    ['issuance', 'Issuing'],
    ['dispense', 'Dispensing'],
    ['attach to utxo', 'Attaching'],
    ['detach from utxo', 'Detaching'],
    ['utxo move', 'Moving'],
    ['pool deposit', 'Depositing'],
    ['unescrowed fairmint payment', 'Minting'],
  ])('reads %s as %s', (action, expected) => {
    expect(pendingLabel([action])).toBe(expected);
  });

  // A single operation debits both the asset and its fee, producing two events. The label should
  // say the operation once rather than collapsing to a generic because two reasons differ.
  it('treats an operation and its fee as one thing', () => {
    expect(pendingLabel(['issuance', 'issuance fee'])).toBe('Issuing');
    expect(pendingLabel(['attach to utxo', 'attach to utxo fee'])).toBe('Attaching');
    expect(pendingLabel(['pool deposit', 'pool deposit fee'])).toBe('Depositing');
  });

  // Picking one would describe the wrong transaction.
  it('falls back to a generic when two different things are in flight', () => {
    expect(pendingLabel(['send', 'dividend'])).toBe(GENERIC_PENDING_LABEL);
  });

  // A protocol addition should appear as "Pending", not vanish from the screen.
  it('falls back to a generic for an action it does not know', () => {
    expect(pendingLabel(['some future action'])).toBe(GENERIC_PENDING_LABEL);
  });

  it('does not invent a word when an unknown action joins a known one', () => {
    expect(pendingLabel(['send', 'some future action'])).toBe(GENERIC_PENDING_LABEL);
  });

  // Deliberately absent: core reports a lock as plain `issuance`, so "Locking" would be us
  // guessing at intent the ledger never stated.
  it('does not claim to know a lock is happening', () => {
    expect(pendingLabel(['issuance'])).toBe('Issuing');
  });
});
