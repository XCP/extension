import { describe, expect, it } from 'vitest';
import type { OrderMatch } from '../api';
import { btcPayPayment } from '../btcpayPayment';

/**
 * Mirrors `messages/btcpay.py`: whichever side of the match is BTC is the side being paid, and the
 * other side's address receives it. Getting this backwards would pin the wrong payee and reject
 * every legitimate BTCPay — or worse, accept a redirected one.
 */
const match = (overrides: Partial<OrderMatch>): OrderMatch => ({
  id: 'a'.repeat(64) + '_' + 'b'.repeat(64),
  tx0_hash: 'a'.repeat(64),
  tx0_index: 0,
  tx0_address: 'bc1qmaker',
  tx1_hash: 'b'.repeat(64),
  tx1_index: 1,
  tx1_address: 'bc1qtaker',
  forward_asset: 'XCP',
  forward_quantity: 500,
  forward_quantity_normalized: '0.00000500' as OrderMatch['forward_quantity_normalized'],
  backward_asset: 'BTC',
  backward_quantity: 300_000,
  backward_quantity_normalized: '0.00300000' as OrderMatch['backward_quantity_normalized'],
  tx0_block_index: 1,
  tx1_block_index: 2,
  block_index: 2,
  block_time: 0,
  match_expire_index: 100,
  fee_paid: 0,
  fee_paid_normalized: '0.00000000' as OrderMatch['fee_paid_normalized'],
  status: 'pending',
  ...overrides,
});

describe('btcPayPayment', () => {
  it('pays tx0 when the backward side is BTC', () => {
    expect(btcPayPayment(match({}))).toEqual({ address: 'bc1qmaker', quantity: 300_000 });
  });

  it('pays tx1 when the forward side is BTC', () => {
    const forwardBtc = match({
      forward_asset: 'BTC',
      forward_quantity: 250_000,
      backward_asset: 'XCP',
      backward_quantity: 500,
    });

    expect(btcPayPayment(forwardBtc)).toEqual({ address: 'bc1qtaker', quantity: 250_000 });
  });

  it('declines a match with no BTC side rather than guessing a payee', () => {
    expect(btcPayPayment(match({ backward_asset: 'PEPECASH' }))).toBeNull();
  });
});
