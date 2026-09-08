import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTransaction, type Transaction } from '@/core/counterparty/api';
import { configureLocale, type MessageKey, t } from '@/i18n';
import TransactionPage from './[txHash]';

const fixture = vi.hoisted(() => ({
  txHash: 'a'.repeat(64) as string | undefined,
  navigate: vi.fn(),
  setHeaderProps: vi.fn(),
}));
vi.mock('react-router', () => ({
  useParams: () => ({ txHash: fixture.txHash }),
  useNavigate: () => fixture.navigate,
  useLocation: () => ({ state: { page: 3 } }),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.setHeaderProps }) }));
vi.mock('@/core/counterparty/api', () => ({ fetchTransaction: vi.fn() }));

const LANGUAGES = ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
function tx(type = 'order', confirmed = true): Transaction {
  return {
    tx_hash: 'a'.repeat(64), block_index: confirmed ? 950000 : 9999999,
    block_time: 1700000000, source: 'bc1qFULLsourceAddress', destination: '',
    supported: true, confirmed, data: {}, unpacked_data: { message_type: type },
  };
}

beforeEach(() => {
  fixture.txHash = 'a'.repeat(64);
  vi.clearAllMocks();
  configureLocale({ language: 'en', numberLocale: 'en-US' });
});
afterEach(() => {
  cleanup();
  configureLocale({ language: 'en', numberLocale: 'en-US' });
});

describe('actual transaction page localization', () => {
  it.each([
    ['order', 'tx_action_order'],
    ['enhanced_send', 'tx_action_send'],
    ['mpma', 'tx_action_multi_send'],
    ['move_utxo', 'tx_action_utxo_move'],
    ['open_order', 'tx_action_order'],
    ['open_dispenser', 'tx_action_dispenser'],
    ['fairmint', 'fairminter_fairmint_fairmint'],
    ['fairminter', 'compose_fairminter_fairminter'],
    ['pooldeposit', 'tx_action_pool_deposit'],
    ['lr_subasset', 'tx_action_subasset_issuance'],
    ['unknown', 'messages_order_status_unknown'],
  ] as const)('translates the %s heading as a historical type without another read', async (type, key) => {
    const transaction = tx(type);
    vi.mocked(fetchTransaction).mockResolvedValue(transaction);
    render(<TransactionPage />);
    const heading = await screen.findByRole('heading', { level: 2, name: t(key) });
    for (const language of LANGUAGES) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByRole('heading', { level: 2, name: t(key) })).toBe(heading);
      expect(screen.getByText(t('consolidate_history_confirmed'))).toBeInTheDocument();
      expect(fetchTransaction).toHaveBeenCalledExactlyOnceWith(transaction.tx_hash, { verbose: true });
      expect(fixture.navigate).not.toHaveBeenCalled();
    }
  });

  it('keeps an unsupported future type identifiable instead of inventing a known action', async () => {
    vi.mocked(fetchTransaction).mockResolvedValue(tx('future_protocol_type'));
    const { container } = render(<TransactionPage />);
    const heading = await screen.findByRole('heading', { level: 2, name: 'Future Protocol Type' });
    const raw = container.querySelector('pre')?.textContent;
    for (const language of LANGUAGES) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(heading).toHaveTextContent('Future Protocol Type');
      expect(container.querySelector('pre')?.textContent).toBe(raw);
    }
    expect(fetchTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('localizes confirmation=%s from the same recorded boolean', async confirmed => {
    const transaction = tx('order', confirmed);
    vi.mocked(fetchTransaction).mockResolvedValue(transaction);
    render(<TransactionPage />);
    const key = confirmed ? 'consolidate_history_confirmed' : 'transaction_unconfirmed';
    await screen.findByText(t(key));
    for (const language of LANGUAGES) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByText(t(key))).toBeInTheDocument();
      expect(screen.queryByText(t(confirmed ? 'transaction_unconfirmed' : 'consolidate_history_confirmed'))).not.toBeInTheDocument();
      expect(transaction.confirmed).toBe(confirmed);
      expect(fetchTransaction).toHaveBeenCalledExactlyOnceWith(transaction.tx_hash, { verbose: true });
    }
  });

  it('preserves the chosen price direction, open raw data, full identifiers and events across locale changes', async () => {
    const transaction = tx();
    const terms = {
      tx_hash: transaction.tx_hash, give_asset: 'FAIRASSET', give_quantity: '2', give_asset_info: { divisible: false },
      get_asset: 'PEPECASH', get_quantity: '300000000', get_asset_info: { divisible: true },
      give_remaining: '1', get_remaining: '150000000', status: 'open', expiration: 100, expire_index: 950099,
    };
    transaction.unpacked_data.message_data = terms;
    transaction.events = [{ event_index: 1, event: 'OPEN_ORDER', params: terms, tx_hash: transaction.tx_hash, block_index: 950000, block_time: 1700000000 }];
    transaction.fee = 1001;
    const before = JSON.stringify(transaction);
    vi.mocked(fetchTransaction).mockResolvedValue(transaction);
    const { container } = render(<TransactionPage />);
    await screen.findByRole('heading', { level: 2, name: t('tx_action_order') });
    fireEvent.click(screen.getByRole('button', { name: t('common_flip_price_ratio') }));
    expect(screen.getByText('1 PEPECASH = 0.66666666 FAIRASSET')).toBeInTheDocument();
    const raw = container.querySelector('details')!;
    raw.open = true;
    const rawText = container.querySelector('pre')?.textContent;

    for (const language of LANGUAGES) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByText('1 PEPECASH = 0.66666666 FAIRASSET')).toBeInTheDocument();
      expect(screen.getByText('2 FAIRASSET')).toBeInTheDocument();
      expect(screen.getByText('3.00000000 PEPECASH')).toBeInTheDocument();
      expect(screen.getByText('0.00001001 BTC')).toBeInTheDocument();
      expect(screen.getByText(transaction.tx_hash)).toBeInTheDocument();
      expect(screen.getByText(transaction.source)).toBeInTheDocument();
      expect(container.querySelector('details')).toBe(raw);
      expect(raw.open).toBe(true);
      expect(container.querySelector('pre')?.textContent).toBe(rawText);
      expect(fixture.setHeaderProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({
        title: t('common_transaction'),
        rightButton: expect.objectContaining({ ariaLabel: t('transactions_txhash_view_on_xchain') }),
      }));
      expect(JSON.stringify(transaction)).toBe(before);
      expect(fetchTransaction).toHaveBeenCalledExactlyOnceWith(transaction.tx_hash, { verbose: true });
    }
    fireEvent.click(screen.getByRole('button', { name: t('transactions_txhash_back_to_history') }));
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/addresses/history?page=3');
  });

  it.each([
    ['missing_hash', 'transactions_txhash_no_transaction_hash_provided'],
    ['not_found', 'transactions_txhash_transaction_not_found'],
    ['fetch_failed', 'transactions_txhash_failed_to_fetch_transaction'],
  ] satisfies [string, MessageKey][])('translates a retained %s error without retrying', async (failure, key) => {
    if (failure === 'missing_hash') fixture.txHash = undefined;
    else if (failure === 'not_found') vi.mocked(fetchTransaction).mockResolvedValue(null);
    else vi.mocked(fetchTransaction).mockRejectedValue('unexpected non-Error rejection');
    render(<TransactionPage />);
    await screen.findByText(t(key));
    for (const language of LANGUAGES) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByText(t(key))).toBeInTheDocument();
      expect(fetchTransaction).toHaveBeenCalledTimes(failure === 'missing_hash' ? 0 : 1);
    }
  });

  it('keeps an unknown API Error message intact rather than treating its English as a local code', async () => {
    const failure = new Error('Gateway rejected NODE_A: height 950000 / code 429');
    vi.mocked(fetchTransaction).mockRejectedValue(failure);
    render(<TransactionPage />);
    await screen.findByText(failure.message);
    for (const language of LANGUAGES) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByText(failure.message)).toBeInTheDocument();
      expect(fetchTransaction).toHaveBeenCalledTimes(1);
    }
    expect(failure.message).toBe('Gateway rejected NODE_A: height 950000 / code 429');
  });
});
