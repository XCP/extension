import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/core/counterparty/api';
import { getMessageHandler } from './index';
import { issuance } from './issuance';

/**
 * Transaction details for the types the history can hold but the handler map did not cover.
 * Shapes are Core's `/v2/transactions/{hash}?verbose=true`: facts in `unpacked_data.message_data`
 * or, for a UTXO move (which carries no message), in its UTXO_MOVE events.
 */

function tx(partial: Partial<Transaction>): Transaction {
  return {
    tx_hash: 'aa'.repeat(32), block_index: 1, block_time: 0, source: 'bc1qsource', destination: '',
    data: {}, supported: true, unpacked_data: { message_type: '' }, ...partial,
  } as Transaction;
}

function shown(messageType: string, transaction: Transaction): string {
  const handler = getMessageHandler(messageType);
  expect(handler, `handler for ${messageType}`).toBeDefined();
  const { container } = render(
    <div>{handler!(transaction).map((field, i) => <p key={i}>{field.label}: {field.value}</p>)}</div>
  );
  return container.textContent ?? '';
}

describe('transaction detail handlers', () => {
  it('says what a destroy destroyed, and its tag as text', () => {
    const text = shown('destroy', tx({
      unpacked_data: {
        message_type: 'destroy',
        message_data: {
          asset: 'GRYPEPEXPRSS', quantity: 1947, tag: '4f5343415254484547524559',
          asset_info: { divisible: false }, quantity_normalized: '1947',
        },
      },
    }));
    expect(text).toContain('1947 GRYPEPEXPRSS');
    expect(text).toContain('Tag: OSCARTHEGREY');
  });

  it('shows a binary destroy tag as hex', () => {
    const text = shown('destroy', tx({
      unpacked_data: { message_type: 'destroy', message_data: { asset: 'XCP', quantity: 100000000, tag: '00ff', quantity_normalized: '1.00000000' } },
    }));
    expect(text).toContain('Tag (hex): 00ff');
  });

  it('shows a UTXO move from its UTXO_MOVE events', () => {
    const text = shown('utxomove', tx({
      unpacked_data: null as unknown as Transaction['unpacked_data'],
      transaction_type: 'utxomove',
      events: [{
        event_index: 1, event: 'UTXO_MOVE', tx_hash: 'aa'.repeat(32), block_index: 1, block_time: 0,
        params: {
          asset: 'PEPECASH', quantity: 2, quantity_normalized: '2',
          source: `${'bb'.repeat(32)}:0`, destination: `${'aa'.repeat(32)}:0`, destination_address: 'bc1qdest',
        },
      }],
    }));
    expect(text).toContain('2 PEPECASH');
    expect(text).toContain(`${'bb'.repeat(32)}:0`);
    expect(text).toContain('bc1qdest');
  });

  it('maps the legacy utxo message type to the move handler', () => {
    const text = shown('utxo', tx({
      unpacked_data: {
        message_type: 'utxo',
        message_data: { source: `${'cc'.repeat(32)}:1`, destination: 'bc1qdest', asset: 'XCP', quantity: 100000000, quantity_normalized: '1.00000000' },
      },
    }));
    expect(text).toContain('1.00000000 XCP');
    expect(text).toContain('bc1qdest');
  });

  it('shows both legs of a pool deposit', () => {
    const text = shown('pooldeposit', tx({
      unpacked_data: {
        message_type: 'pooldeposit',
        message_data: {
          asset_a: 'XCP', quantity_a: 100000000, asset_b: 'PEPECASH', quantity_b: 5,
          asset_b_info: { divisible: false }, min_lp_quantity: 50000000,
        },
      },
    }));
    expect(text).toContain('1.00000000 XCP');
    expect(text).toContain('5 PEPECASH');
    expect(text).toContain('0.50000000 LP');
  });

  it('shows what a pool withdrawal burns and from which pool', () => {
    const text = shown('poolwithdraw', tx({
      unpacked_data: {
        message_type: 'poolwithdraw',
        message_data: { asset_a: 'XCP', asset_b: 'PEPECASH', quantity: 100000000 },
      },
    }));
    expect(text).toContain('Destroy 1.00000000 LP Tokens');
    expect(text).toContain('XCP / PEPECASH');
  });

  it.each(['lr_issuance', 'lr_subasset', 'subasset_issuance'])('handles %s as an issuance', (type) => {
    expect(getMessageHandler(type)).toBe(issuance);
  });
});
