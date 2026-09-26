import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/core/counterparty/api';
import AddressHistoryPage from '../history';

const mocks = vi.hoisted(() => ({
  setHeaderProps: vi.fn(), navigate: vi.fn(),
  // Stable, like the real context: a new object per render would refetch on every render.
  searchParams: [new URLSearchParams(), () => {}] as const,
  wallet: { activeAddress: { address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty' } },
}));
const ADDRESS = mocks.wallet.activeAddress.address;

vi.mock('@/core/counterparty/api', () => ({ fetchTransactions: vi.fn(), clearApiCacheMatching: vi.fn() }));
vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: mocks.setHeaderProps }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => mocks.wallet }));
vi.mock('@/components/ui/cards/transaction-card', () => ({
  TransactionCard: ({ transaction }: { transaction: api.Transaction }) => <div data-testid="tx">{transaction.tx_hash}</div>,
}));

function page(hashes: string[], confirmed = true) {
  return { result: hashes.map((tx_hash) => ({ tx_hash, confirmed })) as unknown as api.Transaction[], result_count: hashes.length };
}

function refreshButton() {
  return mocks.setHeaderProps.mock.calls.findLast(([props]) => props?.rightButton)?.[0].rightButton;
}

const TRANSACTIONS_PATH = `/v2/addresses/${ADDRESS}/transactions`;

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('address history refresh', () => {
  it('reads through the cache on first load', async () => {
    vi.mocked(api.fetchTransactions).mockResolvedValue(page(['a']));
    render(<AddressHistoryPage />);
    await screen.findByText('a');
    expect(api.clearApiCacheMatching).not.toHaveBeenCalled();
  });

  it('drops this address\u2019s cached pages before an explicit refresh, so it shows what changed', async () => {
    vi.mocked(api.fetchTransactions).mockResolvedValueOnce(page(['a'])).mockResolvedValueOnce(page(['b', 'a']));
    render(<AddressHistoryPage />);
    await screen.findByText('a');
    await waitFor(() => expect(refreshButton()?.disabled).toBe(false));

    await act(async () => { refreshButton().onClick(); });

    expect(api.clearApiCacheMatching).toHaveBeenCalledWith(TRANSACTIONS_PATH);
    expect(vi.mocked(api.clearApiCacheMatching).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.fetchTransactions).mock.invocationCallOrder[1]!);
    await screen.findByText('b');
  });

  it('polls fresh while a transaction is unconfirmed', async () => {
    vi.useFakeTimers();
    vi.mocked(api.fetchTransactions).mockResolvedValueOnce(page(['pending'], false)).mockResolvedValue(page(['pending']));
    render(<AddressHistoryPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.clearApiCacheMatching).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    expect(api.clearApiCacheMatching).toHaveBeenCalledWith(TRANSACTIONS_PATH);
    expect(api.fetchTransactions).toHaveBeenCalledTimes(2);
  });
});
