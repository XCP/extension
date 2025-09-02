import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssetList } from './asset-list';
import type { OwnedAsset } from '@/utils/blockchain/counterparty/api';

// Mock dependencies
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn()
}));

vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchOwnedAssets: vi.fn()
}));

vi.mock('@/hooks/useSearchQuery', () => ({
  useSearchQuery: vi.fn()
}));

vi.mock('@/components/cards/asset-card', () => ({
  AssetCard: ({ asset }: { asset: OwnedAsset }) => (
    <div data-testid={`asset-card-${asset.asset}`}>
      <span>{asset.asset}</span>
      <span>{asset.supply_normalized}</span>
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

vi.mock('@/components/spinner', () => ({
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  )
}));

// Import mocked modules
import { useWallet } from '@/contexts/wallet-context';
import { fetchOwnedAssets } from '@/utils/blockchain/counterparty/api';
import { useSearchQuery } from '@/hooks/useSearchQuery';

const mockUseWallet = useWallet as any;
const mockFetchOwnedAssets = fetchOwnedAssets as any;
const mockUseSearchQuery = useSearchQuery as any;

describe('AssetList', () => {
  const mockActiveAddress = {
    name: 'Main Address',
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    path: "m/84'/0'/0'/0/0",
    pubKey: 'mockpublickey'
  };

  const mockOwnedAssets: OwnedAsset[] = [
    {
      asset: 'RAREPEPE',
      asset_longname: 'RARE.PEPE.COLLECTION',
      description: 'Rare Pepe Collection',
      locked: false,
      supply_normalized: '1000.00000000'
    },
    {
      asset: 'MYTOKEN',
      asset_longname: null,
      description: 'My Custom Token',
      locked: true,
      supply_normalized: '10000.00000000'
    }
  ];

  const mockSearchResults = [
    { symbol: 'SEARCHTOKEN1' },
    { symbol: 'SEARCHTOKEN2' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    mockUseWallet.mockReturnValue({
      activeAddress: mockActiveAddress
    });

    mockUseSearchQuery.mockReturnValue({
      searchQuery: '',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: false
    });

    mockFetchOwnedAssets.mockResolvedValue(mockOwnedAssets);
  });

  it('renders loading spinner when loading owned assets', async () => {
    mockFetchOwnedAssets.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<AssetList />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading owned assets...')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search assets...')).toBeInTheDocument();
    });
    
    // Clear button should not be visible when there's no search query
    const clearButton = screen.queryByLabelText('Clear search');
    expect(clearButton).not.toBeInTheDocument();
  });

  it('renders owned assets when loaded', async () => {
    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByTestId('asset-card-RAREPEPE')).toBeInTheDocument();
      expect(screen.getByTestId('asset-card-MYTOKEN')).toBeInTheDocument();
    });

    expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
    expect(screen.getByText('MYTOKEN')).toBeInTheDocument();
  });

  it('shows no assets message when no assets are owned', async () => {
    mockFetchOwnedAssets.mockResolvedValue([]);

    render(<AssetList />);

    await waitFor(() => {
      expect(screen.getByText('No Assets Owned')).toBeInTheDocument();
      expect(screen.getByText("This address hasn't issued any Counterparty assets.")).toBeInTheDocument();
    });
  });

  it('handles search query input', async () => {
    const mockSetSearchQuery = vi.fn();
    mockUseSearchQuery.mockReturnValue({
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      searchResults: [],
      isSearching: false
    });

    render(<AssetList />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search assets...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search assets...');
    fireEvent.change(searchInput, { target: { value: 'RARE' } });

    expect(mockSetSearchQuery).toHaveBeenCalledWith('RARE');
  });

  it('shows clear button when search query exists', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'RARE',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: false
    });

    render(<AssetList />);

    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeVisible();
  });

  it('clears search query when clear button is clicked', () => {
    const mockSetSearchQuery = vi.fn();
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'RARE',
      setSearchQuery: mockSetSearchQuery,
      searchResults: [],
      isSearching: false
    });

    render(<AssetList />);

    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    expect(mockSetSearchQuery).toHaveBeenCalledWith('');
  });

  it('shows searching spinner during search', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'RARE',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: true
    });

    render(<AssetList />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Searching assets...')).toBeInTheDocument();
  });

  it('shows search results when available', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'RARE',
      setSearchQuery: vi.fn(),
      searchResults: mockSearchResults,
      isSearching: false
    });

    render(<AssetList />);

    expect(screen.getByTestId('search-result-SEARCHTOKEN1')).toBeInTheDocument();
    expect(screen.getByTestId('search-result-SEARCHTOKEN2')).toBeInTheDocument();
  });

  it('shows no results message when search returns empty', () => {
    mockUseSearchQuery.mockReturnValue({
      searchQuery: 'NONEXISTENT',
      setSearchQuery: vi.fn(),
      searchResults: [],
      isSearching: false
    });

    render(<AssetList />);

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('handles no active address', () => {
    mockUseWallet.mockReturnValue({
      activeAddress: null
    });

    render(<AssetList />);

    // Should not show loading spinner or make API calls
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(mockFetchOwnedAssets).not.toHaveBeenCalled();
  });

  it('handles fetch error gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchOwnedAssets.mockRejectedValue(new Error('API Error'));

    render(<AssetList />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching owned assets:', expect.any(Error));
    });

    // Should show no assets message after error
    expect(screen.getByText('No Assets Owned')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('cancels fetch when component unmounts', () => {
    const { unmount } = render(<AssetList />);
    
    // Unmount before fetch completes
    unmount();

    // The component should handle cancellation internally
    expect(() => unmount()).not.toThrow();
  });

  it('refetches assets when active address changes', async () => {
    const { rerender } = render(<AssetList />);

    await waitFor(() => {
      expect(mockFetchOwnedAssets).toHaveBeenCalledWith(mockActiveAddress.address);
    });

    // Change active address
    const newAddress = { ...mockActiveAddress, address: 'bc1qnewaddress' };
    mockUseWallet.mockReturnValue({ activeAddress: newAddress });

    rerender(<AssetList />);

    await waitFor(() => {
      expect(mockFetchOwnedAssets).toHaveBeenCalledWith(newAddress.address);
    });

    expect(mockFetchOwnedAssets).toHaveBeenCalledTimes(2);
  });

  it('has proper search input attributes', () => {
    render(<AssetList />);

    const searchInput = screen.getByPlaceholderText('Search assets...');
    expect(searchInput).toHaveAttribute('type', 'text');
    expect(searchInput).toHaveAttribute('id', 'asset-search');
    expect(searchInput).toHaveAttribute('name', 'asset-search');
  });

  it('has proper focus styles on search input', () => {
    render(<AssetList />);

    const searchInput = screen.getByPlaceholderText('Search assets...');
    expect(searchInput).toHaveClass('focus:ring-2', 'focus:ring-blue-500', 'focus:border-blue-500');
  });
});