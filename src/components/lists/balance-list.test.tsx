import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BalanceList } from './balance-list';
import type { TokenBalance } from '@/utils/blockchain/counterparty';

// Mock dependencies
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn()
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: vi.fn()
}));

vi.mock('@/utils/blockchain/bitcoin', () => ({
  fetchBTCBalance: vi.fn()
}));

vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchTokenBalance: vi.fn(),
  fetchTokenBalances: vi.fn()
}));

vi.mock('@/hooks/useSearchQuery', () => ({
  useSearchQuery: vi.fn()
}));

vi.mock('react-intersection-observer', () => ({
  useInView: vi.fn()
}));

vi.mock('@/utils/format', () => ({
  formatAmount: ({ value, maximumFractionDigits = 8, minimumFractionDigits = 0 }: any) => {
    return value.toFixed(maximumFractionDigits);
  }
}));

vi.mock('@/utils/numeric', () => ({
  fromSatoshis: (sats: number, btc: boolean) => sats / 100000000
}));

vi.mock('@/components/spinner', () => ({
  Spinner: ({ message, className }: { message?: string; className?: string }) => (
    <div data-testid="spinner" className={className}>{message || 'Loading...'}</div>
  )
}));

vi.mock('@/components/cards/balance-card', () => ({
  BalanceCard: ({ token }: { token: TokenBalance }) => (
    <div data-testid={`balance-card-${token.asset}`}>
      <span>{token.asset}</span>
      <span>{token.quantity_normalized}</span>
    </div>
  )
}));

vi.mock('@/components/cards/search-result-card', () => ({
  SearchResultCard: ({ symbol }: { symbol: string }) => (
    <div data-testid={`search-result-${symbol}`}>
      Search result for {symbol}
    </div>
  )
}));

// Import mocked modules
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin';
import { fetchTokenBalance, fetchTokenBalances } from '@/utils/blockchain/counterparty';
import { useSearchQuery } from '@/hooks/useSearchQuery';
import { useInView } from 'react-intersection-observer';

const mockUseWallet = useWallet as any;
const mockUseSettings = useSettings as any;
const mockFetchBTCBalance = fetchBTCBalance as any;
const mockFetchTokenBalance = fetchTokenBalance as any;
const mockFetchTokenBalances = fetchTokenBalances as any;
const mockUseSearchQuery = useSearchQuery as any;
const mockUseInView = useInView as any;

describe('BalanceList', () => {
  const mockActiveWallet = { id: 'wallet-1', name: 'Test Wallet', type: 'mnemonic' as const, addresses: [] };
  const mockActiveAddress = {
    name: 'Main Address',
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    derivationPath: "m/84'/0'/0'/0/0",
    publicKey: 'mockpublickey',
    type: 'native-segwit' as const
  };

  const mockTokenBalances: TokenBalance[] = [
    {
      asset: 'XCP',
      quantity_normalized: '100.50000000',
      asset_info: {
        asset_longname: null,
        description: 'Counterparty',
        divisible: true,
        issuer: 'bc1qissuer',
        locked: false,
        supply: '1000000'
      }
    },
    {
      asset: 'RAREPEPE',
      quantity_normalized: '5.00000000',
      asset_info: {
        asset_longname: 'RARE.PEPE.COLLECTION',
        description: 'Rare Pepe',
        divisible: false,
        issuer: 'bc1qissuer',
        locked: false,
        supply: '1000'
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    mockUseWallet.mockReturnValue({
      activeWallet: mockActiveWallet,
      activeAddress: mockActiveAddress
    });

    mockUseSettings.mockReturnValue({
      settings: {
        pinnedAssets: ['XCP']
      }
    });

    mockUseSearchQuery.mockReturnValue({
      searchQuery: '',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: false
    });

    mockUseInView.mockReturnValue({
      ref: vi.fn(),
      inView: false
    });

    mockFetchBTCBalance.mockResolvedValue(50000000); // 0.5 BTC in satoshis
    mockFetchTokenBalance.mockResolvedValue(mockTokenBalances[0]);
    mockFetchTokenBalances.mockResolvedValue(mockTokenBalances);
  });

  it('renders loading spinner during initial load', async () => {
    mockFetchBTCBalance.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<BalanceList />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading balances...')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<BalanceList />);

    expect(screen.getByPlaceholderText('Search balances...')).toBeInTheDocument();
  });

  it('loads BTC balance on mount', async () => {
    render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchBTCBalance).toHaveBeenCalledWith(mockActiveAddress.address);
    });

    await waitFor(() => {
      expect(screen.getByTestId('balance-card-BTC')).toBeInTheDocument();
    });
  });

  it('loads pinned asset balances', async () => {
    render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchTokenBalance).toHaveBeenCalledWith(mockActiveAddress.address, 'XCP');
    });

    await waitFor(() => {
      expect(screen.getByTestId('balance-card-XCP')).toBeInTheDocument();
    });
  });

  it('handles search query input', () => {
    const mockSetSearchQuery = vi.fn();
    mockUseSearchQuery.mockReturnValue({
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      searchResults: [],
      isSearching: false
    });

    render(<BalanceList />);

    const searchInput = screen.getByPlaceholderText('Search balances...');
    fireEvent.change(searchInput, { target: { value: 'XCP' } });

    expect(mockSetSearchQuery).toHaveBeenCalledWith('XCP');
  });

  it('shows clear button when search query exists', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'XCP',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: false
    });

    render(<BalanceList />);

    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeVisible();
  });

  it('clears search when clear button is clicked', () => {
    const mockSetSearchQuery = vi.fn();
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'XCP',
      setSearchQuery: mockSetSearchQuery,
      searchResults: [],
      isSearching: false
    });

    render(<BalanceList />);

    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    expect(mockSetSearchQuery).toHaveBeenCalledWith('');
  });

  it('shows searching spinner during search', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'XCP',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: true
    });

    render(<BalanceList />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Searching balances...')).toBeInTheDocument();
  });

  it('shows search results when available', () => {
    const mockSearchResults = [{ symbol: 'SEARCHTOKEN' }];
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'SEARCH',
      setSearchQuery: vi.fn(),
      searchResults: mockSearchResults,
      isSearching: false
    });

    render(<BalanceList />);

    expect(screen.getByTestId('search-result-SEARCHTOKEN')).toBeInTheDocument();
  });

  it('shows no results message when search is empty', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'NONEXISTENT',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: false
    });

    render(<BalanceList />);

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('loads more balances when scrolled into view', async () => {
    mockUseInView.mockReturnValue({
      ref: vi.fn(),
      inView: true // Simulate being in view
    });

    render(<BalanceList />);

    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.getByTestId('balance-card-BTC')).toBeInTheDocument();
    });

    // Should trigger loading more balances
    await waitFor(() => {
      expect(mockFetchTokenBalances).toHaveBeenCalledWith(
        mockActiveAddress.address,
        { limit: 10, offset: 0 }
      );
    });
  });

  it('shows loading spinner when fetching more balances', async () => {
    mockUseInView.mockReturnValue({
      ref: vi.fn(),
      inView: true
    });

    // Mock slow response
    mockFetchTokenBalances.mockImplementation(() => new Promise(() => {}));

    render(<BalanceList />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('balance-card-BTC')).toBeInTheDocument();
    });

    // Should show loading for more balances
    await waitFor(() => {
      expect(screen.getByText('Scroll to load more...')).toBeInTheDocument();
    });
  });

  it('handles no active address', () => {
    mockUseWallet.mockReturnValue({
      activeWallet: null,
      activeAddress: null
    });

    render(<BalanceList />);

    // Should not make API calls
    expect(mockFetchBTCBalance).not.toHaveBeenCalled();
    expect(mockFetchTokenBalance).not.toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchBTCBalance.mockRejectedValue(new Error('API Error'));

    render(<BalanceList />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in loadInitialBalances:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  it('has proper search input attributes', () => {
    render(<BalanceList />);

    const searchInput = screen.getByPlaceholderText('Search balances...');
    expect(searchInput).toHaveAttribute('type', 'text');
    expect(searchInput).toHaveAttribute('id', 'balance-search');
    expect(searchInput).toHaveAttribute('name', 'balance-search');
  });

  it('separates pinned and other balances', async () => {
    mockUseSettings.mockReturnValue({
      settings: {
        pinnedAssets: ['XCP']
      }
    });

    render(<BalanceList />);

    await waitFor(() => {
      expect(screen.getByTestId('balance-card-BTC')).toBeInTheDocument();
      expect(screen.getByTestId('balance-card-XCP')).toBeInTheDocument();
    });

    // BTC should be shown (it's always included in pinned)
    // XCP should be shown (it's in pinnedAssets)
  });

  it('reloads when pinned assets change', async () => {
    const { rerender } = render(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchBTCBalance).toHaveBeenCalledTimes(1);
    });

    // Change pinned assets
    mockUseSettings.mockReturnValue({
      settings: {
        pinnedAssets: ['XCP', 'RAREPEPE']
      }
    });

    rerender(<BalanceList />);

    await waitFor(() => {
      expect(mockFetchBTCBalance).toHaveBeenCalledTimes(2);
    });
  });
});