import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@/core/counterparty/api';
import { configureLocale, t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';
import { order } from './order';

type Params = Record<string, unknown>;
const txHash = 'a'.repeat(64);
const terms: Params = {
  give_asset: 'RAREPEPE', give_quantity: '100', give_asset_info: { divisible: false },
  get_asset: 'PEPECASH', get_quantity: '1000000000', get_asset_info: { divisible: true },
  expiration: 100, status: 'open',
};
function event(event_index: number, name: string, params: Params): NonNullable<Transaction['events']>[number] {
  return { event_index, event: name, params, tx_hash: txHash, block_index: 950000, block_time: 1 };
}
function transaction(params: Params = terms, events?: Transaction['events']): Transaction {
  return {
    tx_hash: txHash, block_index: 950000, block_time: 1, source: 'source', destination: '',
    data: {}, supported: true, unpacked_data: { message_type: 'order', message_data: params }, events,
  };
}
function snapshot(params: Params = {}, updates: Transaction['events'] = []): Transaction {
  return transaction(terms, [event(1, 'OPEN_ORDER', { ...terms, tx_hash: txHash, ...params }), ...updates]);
}
function Details({ tx }: { tx: Transaction }) {
  useLocaleRevision();
  // The transaction route preserves field identity by position during relocalization.
  return <dl>{order(tx).map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}
const expiration = (tx: Transaction) => order(tx).find(field => field.label === t('common_expiration'))?.value;

beforeEach(() => { configureLocale({ language: 'en', numberLocale: 'en-US' }); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  configureLocale({ language: 'en', numberLocale: 'auto' });
});

describe('historical order evidence', () => {
  it('reads Core message_data but never treats unpack successful/open as a current order state', () => {
    const tx = transaction();
    render(<Details tx={tx} />);
    expect(screen.getByText('100 RAREPEPE')).toBeTruthy();
    expect(screen.getByText('10.00000000 PEPECASH')).toBeTruthy();
    expect(screen.queryByText(t('messages_order_recorded_state'))).toBeNull();
    expect(screen.queryByText(t('messages_order_give_remaining'))).toBeNull();
    expect(expiration(tx)).toBe('100 blocks');
    expect(screen.queryByText(/100 remaining/)).toBeNull();
  });

  it('shows requested terms for an unconfirmed order without a synthetic mempool expiry or mined state', () => {
    const tx = snapshot({ expire_index: 10000099, block_index: 9999999 });
    tx.confirmed = false;
    tx.block_index = 9999999;
    render(<Details tx={tx} />);
    expect(screen.getByText('100 RAREPEPE')).toBeTruthy();
    expect(expiration(tx)).toBe('100 blocks');
    expect(screen.queryByText(t('messages_order_recorded_state'))).toBeNull();
    expect(screen.queryByText(/10,000,099/)).toBeNull();
  });

  it('preserves legacy params support and does not manufacture details without decoded terms or a matching event', () => {
    const legacy = transaction();
    legacy.unpacked_data = { message_type: 'order', params: terms };
    expect(order(legacy).find(field => field.label === t('common_give'))?.value).toBe('100 RAREPEPE');
    const empty = transaction();
    empty.unpacked_data = { message_type: 'order' };
    empty.events = [event(1, 'OPEN_ORDER', { ...terms, tx_hash: 'other' })];
    expect(order(empty)).toEqual([]);
  });

  it('uses effective opening quantities and only this order’s updates in event order, without mutating API data', () => {
    const tx = transaction({ ...terms, give_quantity: '100000', give_quantity_normalized: '100000' }, [
      event(8, 'ORDER_UPDATE', { tx_hash: txHash, status: 'filled', give_remaining: '0', get_remaining: '0' }),
      event(2, 'OPEN_ORDER', { ...terms, tx_hash: txHash, give_quantity: '50', give_remaining: '50', get_remaining: '1000000000' }),
      event(7, 'ORDER_UPDATE', { tx_hash: 'other-order', status: 'cancelled', give_remaining: '999999' }),
      event(5, 'ORDER_UPDATE', { tx_hash: txHash, give_remaining: '25', get_remaining: '500000000' }),
      event(1, 'OPEN_ORDER', { ...terms, tx_hash: 'other-order', give_quantity: '999999' }),
    ]);
    const before = JSON.stringify(tx);
    render(<Details tx={tx} />);
    expect(screen.getByText('50 RAREPEPE')).toBeTruthy();
    expect(screen.getByText('✅ Filled')).toBeTruthy();
    expect(screen.getByText(t('messages_order_snapshot_notice'))).toBeTruthy();
    expect(screen.getByText('0 RAREPEPE')).toBeTruthy();
    expect(screen.getByText('0.00000000 PEPECASH')).toBeTruthy();
    expect(screen.getByText('100.0%')).toBeTruthy();
    expect(screen.queryByText(/999999|Cancelled/)).toBeNull();
    expect(JSON.stringify(tx)).toBe(before);
  });

  it('never uses a stale normalized remaining after a newer raw-only update of an asset with unknown units', () => {
    const tx = snapshot({ give_asset_info: undefined, give_quantity_normalized: '100', give_remaining: '100', give_remaining_normalized: '100' }, [
      event(2, 'ORDER_UPDATE', { tx_hash: txHash, give_remaining: '50' }),
    ]);
    render(<Details tx={tx} />);
    expect(screen.getByText('50 (base units) RAREPEPE')).toBeTruthy();
    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(screen.queryByText(t('messages_order_get_remaining'))).toBeNull();
  });

  it('does not default missing remaining quantities to the original order', () => {
    render(<Details tx={snapshot()} />);
    expect(screen.getByText('🟢 Open')).toBeTruthy();
    expect(screen.queryByText(t('messages_order_give_remaining'))).toBeNull();
    expect(screen.queryByText(t('messages_order_fill_progress'))).toBeNull();
  });

  it('uses recorded expiry, including legacy zero-duration finite expiry, instead of an invented current countdown', () => {
    expect(expiration(snapshot({ expire_index: 950100 }))).toBe('After block 950,100');
    expect(expiration(snapshot({ expiration: 0, expire_index: 950000 }))).toBe('After block 950,000');
    expect(expiration(snapshot({ expiration: 0, expire_index: null }))).toBe(t('common_never_expires'));
    expect(expiration(transaction({ ...terms, expiration: 0 }))).toBe(t('tx_action_unavailable'));
    expect(expiration(transaction({ ...terms, expiration: 1 }))).toBe('1 block');
  });
});

describe('exact order units and price', () => {
  it('formats every slot using its own divisibility and preserves integer quantities beyond Number precision', () => {
    render(<Details tx={transaction({ ...terms,
      give_quantity: '18446744073709551615',
      get_quantity: '9999999999999999',
      give_quantity_normalized: 'incorrect enrichment',
      fee_required: '1', fee_provided: '1001',
    })} />);
    expect(screen.getByText('18,446,744,073,709,551,615 RAREPEPE')).toBeTruthy();
    expect(screen.getByText('99,999,999.99999999 PEPECASH')).toBeTruthy();
    expect(screen.getByText('0.00000001 BTC')).toBeTruthy();
    expect(screen.getByText('0.00001001 BTC')).toBeTruthy();
  });

  it('labels unknown raw units and withholds the price instead of treating them as divisible or whole assets', () => {
    render(<Details tx={transaction({ ...terms, give_asset_info: undefined })} />);
    expect(screen.getByText('100 (base units) RAREPEPE')).toBeTruthy();
    expect(screen.getByText(t('approval_order_card_price_unavailable'))).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('can use explicit normalized-only API quantities, including zero BTC fees, without inventing missing raw amounts', () => {
    render(<Details tx={transaction({ give_asset: 'RAREPEPE', give_quantity_normalized: '2',
      get_asset: 'PEPECASH', get_quantity_normalized: '3', fee_required_normalized: '0' })} />);
    expect(screen.getByText('2 RAREPEPE')).toBeTruthy();
    expect(screen.getByText('3 PEPECASH')).toBeTruthy();
    expect(screen.getByText('1 RAREPEPE = 1.50000000 PEPECASH')).toBeTruthy();
    expect(screen.queryByText(t('common_fee_required'))).toBeNull();
  });

  it.each([undefined, null, '', 'garbage', '-1', '1,000', '1e8', Number.MAX_SAFE_INTEGER + 1])(
    'withholds an unavailable or malformed quantity (%s) rather than rendering a made-up zero or ratio', value => {
      const { container } = render(<Details tx={transaction({ ...terms, get_quantity: value })} />);
      expect(screen.getByText(t('approval_order_card_price_unavailable'))).toBeTruthy();
      expect(screen.getByText(t('tx_action_unavailable') + ' PEPECASH')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      expect(container.textContent).not.toMatch(/NaN|Infinity|undefined|0\.00000000 PEPECASH/);
    },
  );

  it('does not round fractional normalized indivisible quantities into a different valid amount', () => {
    render(<Details tx={transaction({ ...terms, give_quantity: undefined, give_quantity_normalized: '1.5' })} />);
    expect(screen.getByText(t('tx_action_unavailable') + ' RAREPEPE')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('withholds a zero-denominator ratio and computes a flipped tiny price from exact original quantities', () => {
    const { rerender } = render(<Details tx={transaction({ ...terms, give_quantity: '0' })} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<Details tx={transaction({ ...terms, give_quantity: '100', get_quantity: '1' })} />);
    expect(screen.getByText('1 RAREPEPE = < 0.00000001 PEPECASH')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('common_flip_price_ratio') }));
    expect(screen.getByText('1 PEPECASH = 10,000,000,000.00000000 RAREPEPE')).toBeTruthy();
  });
});

describe('live historical presentation', () => {
  it.each(['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const)('translates known event status codes in %s while leaving an unknown diagnostic untouched', language => {
    configureLocale({ language, numberLocale: 'en-US' });
    const { rerender } = render(<Details tx={snapshot({ status: 'filled' })} />);
    for (const [value, key] of [
      ['filled', 'messages_order_status_filled'], ['cancelled', 'messages_order_status_cancelled'],
      ['expired', 'messages_order_status_expired'], [undefined, 'messages_order_status_unknown'],
    ] as const) {
      rerender(<Details tx={snapshot({ status: value })} />);
      expect(screen.getByText(text => text.includes(t(key)))).toBeTruthy();
      expect(t(key)).not.toMatch(/^(Filled|Cancelled|Expired|Unknown)$/);
    }
    rerender(<Details tx={snapshot({ status: 'invalid: API diagnostic $1' })} />);
    expect(screen.getByText('invalid: API diagnostic $1')).toBeTruthy();
  });

  it('relocalizes historical status and exact quantities while retaining the chosen price direction and making no reads', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const tx = snapshot({ give_quantity: '2000', get_quantity: '3000000000', give_remaining: '1000', get_remaining: '1500000000', expire_index: 950100 });
    const before = JSON.stringify(tx);
    render(<Details tx={tx} />);
    fireEvent.click(screen.getByRole('button', { name: t('common_flip_price_ratio') }));
    expect(screen.getByText('1 PEPECASH = 66.66666666 RAREPEPE')).toBeTruthy();
    const open = { ja: '有効', 'zh-CN': '挂单中', 'zh-TW': '委託中', 'zh-HK': '掛單中' };
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const) {
      act(() => { configureLocale({ language, numberLocale: 'de-DE' }); });
      expect(screen.getByText('🟢 ' + open[language])).toBeTruthy();
      expect(screen.getByText(t('messages_order_recorded_state'))).toBeTruthy();
      expect(screen.getByText(t('messages_order_snapshot_notice'))).toBeTruthy();
      expect(screen.getByText('2.000 RAREPEPE')).toBeTruthy();
      expect(screen.getByText('1 PEPECASH = 66,66666666 RAREPEPE')).toBeTruthy();
      expect(screen.getByRole('button', { name: t('common_flip_price_ratio') })).toBeTruthy();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(tx)).toBe(before);
  });
});
