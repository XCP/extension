import { describe, expect, it } from 'vitest';
import {
  countUnreadable,
  type MempoolLedgerEvent,
  pendingByAsset,
  pendingByUtxo,
  summarize,
} from '../pending';

const MINE = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const THEIRS = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';

const debit = (
  quantity: number | string,
  overrides: Partial<MempoolLedgerEvent['params']> = {},
  tx_hash = 'tx1'
): MempoolLedgerEvent => ({
  tx_hash,
  event: 'DEBIT',
  params: { address: MINE, asset: 'XCP', quantity, action: 'issuance fee', ...overrides },
});

const credit = (
  quantity: number | string,
  overrides: Partial<MempoolLedgerEvent['params']> = {},
  tx_hash = 'tx1'
): MempoolLedgerEvent => ({
  tx_hash,
  event: 'CREDIT',
  params: { address: MINE, asset: 'XCP', quantity, calling_function: 'issuance', ...overrides },
});

describe('pendingByAsset', () => {
  it('totals pending debits for an asset', () => {
    const result = pendingByAsset([debit(100), debit(50, {}, 'tx2')], MINE);

    expect(result.get('XCP')?.debited).toBe(150n);
    expect(result.get('XCP')?.credited).toBe(0n);
  });

  it('keeps debits and credits apart rather than netting them', () => {
    const result = pendingByAsset([debit(100), credit(30)], MINE);

    expect(result.get('XCP')?.debited).toBe(100n);
    expect(result.get('XCP')?.credited).toBe(30n);
  });

  // The endpoint matches addresses with SQL LIKE against a joined column, so its results are a
  // superset. Without this filter a neighbour's debit would be subtracted from your balance.
  it('ignores events belonging to another address', () => {
    const result = pendingByAsset([debit(100), debit(999, { address: THEIRS })], MINE);

    expect(result.get('XCP')?.debited).toBe(100n);
  });

  it('separates assets', () => {
    const result = pendingByAsset([debit(100), debit(7, { asset: 'PEPECASH' })], MINE);

    expect(result.get('XCP')?.debited).toBe(100n);
    expect(result.get('PEPECASH')?.debited).toBe(7n);
  });

  // Counterparty quantities are unsigned 64-bit. Rounding one to a double is the exact failure this
  // module exists to prevent, so a large value has to survive as an integer.
  it('is exact for quantities beyond a double', () => {
    const huge = '99526925811111111';
    const result = pendingByAsset([debit(huge, { asset: 'PEPECASH' })], MINE);

    expect(result.get('PEPECASH')?.debited).toBe(99526925811111111n);
    expect(result.get('PEPECASH')?.debited.toString()).toBe(huge);
  });

  it('skips a quantity it cannot read exactly, rather than guessing', () => {
    const result = pendingByAsset([debit(1.5), debit('not a number', {}, 'tx2')], MINE);
    expect(result.size).toBe(0);
  });

  it('collects the reasons behind a figure', () => {
    const result = pendingByAsset(
      [debit(100, { action: 'issuance fee' }), debit(2, { action: 'fairmint payment' }, 'tx2')],
      MINE
    );

    expect(result.get('XCP')?.reasons).toEqual(['issuance fee', 'fairmint payment']);
  });

  it('does not repeat a reason or a transaction', () => {
    const result = pendingByAsset([debit(1), debit(2)], MINE);

    expect(result.get('XCP')?.reasons).toEqual(['issuance fee']);
    expect(result.get('XCP')?.txHashes).toEqual(['tx1']);
  });

  it('lists each contributing transaction for linking', () => {
    const result = pendingByAsset([debit(1), debit(2, {}, 'tx2')], MINE);
    expect(result.get('XCP')?.txHashes).toEqual(['tx1', 'tx2']);
  });

  it('ignores event types that are not ledger movements', () => {
    const result = pendingByAsset(
      [{ tx_hash: 'tx1', event: 'NEW_TRANSACTION', params: { address: MINE, asset: 'XCP', quantity: 5 } }],
      MINE
    );

    expect(result.size).toBe(0);
  });

  it('returns nothing for an empty mempool', () => {
    expect(pendingByAsset([], MINE).size).toBe(0);
  });
});

describe('pendingByUtxo ownership', () => {
  const utxoEvent = (overrides: Record<string, unknown>): MempoolLedgerEvent => ({
    tx_hash: 'tx1',
    event: 'DEBIT',
    params: {
      asset: 'XCP',
      quantity: 5,
      action: 'detach from utxo',
      utxo: 'aabb:0',
      ...overrides,
    } as MempoolLedgerEvent['params'],
  });

  it('counts a movement on a UTXO this address owns', () => {
    const result = pendingByUtxo([utxoEvent({ utxo_address: MINE })], MINE);
    expect(result.get('aabb:0')?.debited).toBe(5n);
  });

  // The endpoint matches addresses with SQL LIKE, so strangers arrive in the result set.
  it('ignores a movement on a stranger UTXO', () => {
    const result = pendingByUtxo([utxoEvent({ utxo_address: THEIRS })], MINE);
    expect(result.size).toBe(0);
  });

  // The regression: an event naming us in neither field used to pass the old exclude-on-mismatch
  // guard whenever utxo_address was simply absent.
  it('ignores an event that names this address in no field at all', () => {
    const result = pendingByUtxo([utxoEvent({ address: THEIRS })], MINE);
    expect(result.size).toBe(0);
  });

  it('accepts ownership via the address field when utxo_address is unset', () => {
    const result = pendingByUtxo([utxoEvent({ address: MINE })], MINE);
    expect(result.get('aabb:0')?.debited).toBe(5n);
  });
});

describe('countUnreadable', () => {
  // "Something is pending that I could not total" and "nothing is pending" are different claims,
  // and only one of them is safe to render as a balance.
  it('counts our own events that could not be folded in', () => {
    expect(countUnreadable([debit(1.5), debit('x', {}, 'tx2'), debit(10, {}, 'tx3')], MINE)).toBe(2);
  });

  it('does not count unreadable events belonging to another address', () => {
    expect(countUnreadable([debit(1.5, { address: THEIRS })], MINE)).toBe(0);
  });

  it('counts an event with no asset', () => {
    expect(countUnreadable([debit(10, { asset: undefined })], MINE)).toBe(1);
  });
});

describe('summarize', () => {
  it('leaves the confirmed balance alone and reports spendable separately', () => {
    const delta = pendingByAsset([debit(100)], MINE).get('XCP');
    const summary = summarize(400n, delta);

    expect(summary.confirmed).toBe(400n);
    expect(summary.spendable).toBe(300n);
    expect(summary.outgoing).toBe(100n);
  });

  it('reports nothing pending when the mempool is empty for that asset', () => {
    const summary = summarize(400n, undefined);

    expect(summary.confirmed).toBe(400n);
    expect(summary.spendable).toBe(400n);
    expect(summary.outgoing).toBe(0n);
    expect(summary.inconsistent).toBe(false);
  });

  // Pending debits above the confirmed balance are impossible per the ledger, so seeing them means
  // the two reads disagree — mid-reorg, or a stale balance. A negative "spendable" would be a
  // confident lie; falling back to the confirmed figure and flagging it is not.
  it('flags a disagreement instead of reporting a negative balance', () => {
    const delta = pendingByAsset([debit(500)], MINE).get('XCP');
    const summary = summarize(400n, delta);

    expect(summary.inconsistent).toBe(true);
    expect(summary.spendable).toBe(400n);
  });

  it('carries the reasons through for display', () => {
    const delta = pendingByAsset([debit(100, { action: 'fairmint payment' })], MINE).get('XCP');
    expect(summarize(400n, delta).reasons).toEqual(['fairmint payment']);
  });

  it('reports incoming separately, without adding it to spendable', () => {
    const delta = pendingByAsset([credit(50)], MINE).get('XCP');
    const summary = summarize(400n, delta);

    expect(summary.incoming).toBe(50n);
    // Unconfirmed money in is not money you can spend.
    expect(summary.spendable).toBe(400n);
  });
});
