import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { UtxoBalance } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';
import { configureLocale, t } from '@/i18n';
import { UtxoList } from './utxo-list';

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate
}));

const mockActiveWallet = { id: 'wallet1', name: 'Test Wallet' };
const mockActiveAddress = { address: 'bc1qtest123', name: 'Test Address' };
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: mockActiveWallet,
    activeAddress: mockActiveAddress
  })
}));

const mockFetchTokenBalances = vi.fn();
vi.mock('@/core/counterparty/api', () => ({
  fetchTokenBalances: (...args: any[]) => mockFetchTokenBalances(...args)
}));

vi.mock('@/core/format', () => ({
  normalizeAssetQuery: (query: string) => query.includes('.') ? query.trim() : query.trim().toUpperCase(),
  formatAmount: vi.fn(({ value }: { value: string | number }) => Number(value).toFixed(8)),
  formatAsset: vi.fn((asset: string) => asset),
  formatTxid: vi.fn((txid: string) => `${txid.slice(0, 8)}...`)
}));

vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ message, className }: { message?: string; className?: string }) => (
    <div data-testid="spinner" className={className}>{message || 'Loading…'}</div>
  )
}));

vi.mock('@/components/domain/utxo/utxo-menu', () => ({
  UtxoMenu: ({ utxo }: { utxo: string }) => (
    <div data-testid="utxo-menu" data-utxo={utxo}>Menu</div>
  )
}));

vi.mock('@/components/icons', () => ({
  FaSearch: () => <div data-testid="search-icon" />,
  FiX: () => <div data-testid="x-icon" />,
}));

vi.mock('@/components/domain/asset/asset-icon', () => ({
  AssetIcon: ({ asset }: any) => <img alt={asset} data-testid="asset-icon" />
}));

let mockInView = false;
const mockRef = vi.fn();
vi.mock('@/hooks/useInView', () => ({
  useInView: () => ({
    ref: mockRef,
    inView: mockInView
  })
}));

const mockUtxoBalances: UtxoBalance[] = [
  {
    asset: 'XCP',
    asset_info: {
      asset_longname: null,
      description: 'Counterparty',
      divisible: true,
      issuer: 'bc1qissuer',
      locked: false,
    },
    quantity_normalized: asDisplayUnits('100.00000000'),
    utxo: 'aaa111bbb222ccc333ddd444eee555fff666aaa111bbb222ccc333ddd444eee555:0',
    utxo_address: 'bc1qtest123',
  },
  {
    asset: 'RAREPEPE',
    asset_info: {
      asset_longname: null,
      description: 'Rare Pepe',
      divisible: false,
      issuer: 'bc1qissuer',
      locked: false,
    },
    quantity_normalized: asDisplayUnits('50'),
    utxo: 'fff666eee555ddd444ccc333bbb222aaa111fff666eee555ddd444ccc333bbb222:1',
    utxo_address: 'bc1qtest123',
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const fullPage = () => Array.from({ length: 20 }, (_, i) => ({
  ...mockUtxoBalances[0]!, utxo: `page-utxo-${i}:0`,
}));

describe('UtxoList', () => {
  beforeEach(() => {
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    vi.clearAllMocks();
    mockActiveAddress.address = 'bc1qtest123';
    mockInView = false;
    mockFetchTokenBalances.mockResolvedValue(mockUtxoBalances);
  });

  afterEach(() => {
    cleanup();
    configureLocale({ language: 'en', numberLocale: 'en-US' });
  });

  it('should show loading spinner initially', () => {
    mockFetchTokenBalances.mockReturnValue(new Promise(() => {})); // never resolves
    render(<UtxoList />);
    expect(screen.getByTestId('spinner')).toHaveTextContent('Loading UTXO balances…');
  });

  it('should fetch UTXO balances with type utxo on mount', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      expect(mockFetchTokenBalances).toHaveBeenCalledWith('bc1qtest123', {
        type: 'utxo',
        limit: 20,
        offset: 0,
      });
    });
  });

  it('should display UTXO balances after loading', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByText('XCP')).toBeInTheDocument();
      expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
    });
  });

  it('should show empty message when no UTXOs', async () => {
    mockFetchTokenBalances.mockResolvedValue([]);
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByText('No UTXO-attached balances')).toBeInTheDocument();
    });
  });

  it('should render search input after loading', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search utxos…')).toBeInTheDocument();
    });
  });

  it('should filter balances by asset name', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByText('XCP')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search utxos…');
    fireEvent.change(searchInput, { target: { value: 'XCP' } });

    expect(screen.getByText('XCP')).toBeInTheDocument();
    expect(screen.queryByText('RAREPEPE')).not.toBeInTheDocument();
  });

  it('should filter balances by txid', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByText('XCP')).toBeInTheDocument();
    });

    // Search for a substring unique to the second UTXO's txid
    const searchInput = screen.getByPlaceholderText('Search utxos…');
    fireEvent.change(searchInput, { target: { value: 'BBB222AAA111' } });

    expect(screen.queryByText('XCP')).not.toBeInTheDocument();
    expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
  });

  it('should show no matching message when filter has no results', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByText('XCP')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search utxos…');
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } });

    expect(screen.getByText('No matching UTXOs')).toBeInTheDocument();
  });

  it('should render utxo menu for each balance', async () => {
    render(<UtxoList />);

    await waitFor(() => {
      const menus = screen.getAllByTestId('utxo-menu');
      expect(menus).toHaveLength(2);
    });
  });

  it('should handle API errors gracefully', async () => {
    mockFetchTokenBalances.mockRejectedValue(new Error('API Error'));
    render(<UtxoList />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load UTXO balances.');
      expect(screen.queryByText('No UTXO-attached balances')).not.toBeInTheDocument();
    });
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByRole('alert')).toHaveTextContent(t('utxo_utxo_list_load_failed'));
      expect(mockFetchTokenBalances).toHaveBeenCalledTimes(1);
    }
  });

  it('finds a later-page UTXO with no loaded search match and finishes the spinner', async () => {
    const more = deferred<UtxoBalance[]>();
    mockFetchTokenBalances.mockResolvedValueOnce(fullPage()).mockReturnValueOnce(more.promise);
    render(<UtxoList />);
    await waitFor(() => expect(screen.getAllByText('XCP')).toHaveLength(20));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'RAREPEPE' } });
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('No matching UTXOs')).not.toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toHaveTextContent('Searching UTXO balances…');
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByTestId('spinner')).toHaveTextContent(t('utxo_utxo_list_searching_utxo_balances'));
      expect(screen.getByRole('textbox')).toHaveValue('RAREPEPE');
      expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2);
    }
    await act(async () => more.resolve([mockUtxoBalances[1]!]));
    expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(mockFetchTokenBalances).toHaveBeenLastCalledWith('bc1qtest123', { type: 'utxo', limit: 20, offset: 20 });
  });

  it.each(['address', 'refresh'])('ignores a late page across a %s change', async change => {
    const stale = deferred<UtxoBalance[]>();
    const current = deferred<UtxoBalance[]>();
    mockFetchTokenBalances.mockResolvedValueOnce(fullPage())
      .mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    const view = render(<UtxoList refreshNonce={0} />);
    await waitFor(() => expect(screen.getAllByText('XCP')).toHaveLength(20));
    mockInView = true;
    view.rerender(<UtxoList refreshNonce={0} />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2));
    mockInView = false;
    if (change === 'address') mockActiveAddress.address = 'other-address';
    view.rerender(<UtxoList refreshNonce={change === 'refresh' ? 1 : 0} />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(3));
    await act(async () => stale.resolve([mockUtxoBalances[1]!]));
    expect(screen.queryByText('RAREPEPE')).not.toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toHaveTextContent('Loading UTXO balances…');
    await act(async () => current.resolve([{ ...mockUtxoBalances[0]!, asset: 'CURRENT' }]));
    expect(screen.getByText('CURRENT')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('retains rows on page failure and retries the same offset', async () => {
    const failed = deferred<UtxoBalance[]>();
    mockFetchTokenBalances.mockResolvedValueOnce(fullPage()).mockReturnValueOnce(failed.promise)
      .mockResolvedValueOnce([mockUtxoBalances[1]!]);
    const view = render(<UtxoList />);
    await waitFor(() => expect(screen.getAllByText('XCP')).toHaveLength(20));
    mockInView = true;
    view.rerender(<UtxoList />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2));
    await act(async () => failed.reject(new Error('Rate limited')));
    expect(screen.getAllByText('XCP')).toHaveLength(20);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more UTXO balances.');
    expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2);
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
      act(() => { configureLocale({ language, numberLocale: 'en-US' }); });
      expect(screen.getByRole('alert')).toHaveTextContent(t('utxo_utxo_list_load_more_failed'));
      expect(screen.getAllByText('XCP')).toHaveLength(20);
      expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2);
    }
    fireEvent.click(screen.getByRole('button', { name: t('common_retry') }));
    await waitFor(() => expect(screen.getByText('RAREPEPE')).toBeInTheDocument());
    expect(mockFetchTokenBalances).toHaveBeenLastCalledWith('bc1qtest123', { type: 'utxo', limit: 20, offset: 20 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('an old initial load cannot finish a newer refresh', async () => {
    const old = deferred<UtxoBalance[]>();
    const current = deferred<UtxoBalance[]>();
    const onRefreshed = vi.fn();
    mockFetchTokenBalances.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const view = render(<UtxoList refreshNonce={0} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(1));
    view.rerender(<UtxoList refreshNonce={1} onRefreshed={onRefreshed} />);
    await waitFor(() => expect(mockFetchTokenBalances).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve([]));
    expect(onRefreshed).not.toHaveBeenCalled();
    await act(async () => current.resolve(mockUtxoBalances));
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });
});
