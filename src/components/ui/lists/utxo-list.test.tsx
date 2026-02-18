import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { UtxoList } from './utxo-list';
import type { UtxoBalance } from '@/utils/blockchain/counterparty/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
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
vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchTokenBalances: (...args: any[]) => mockFetchTokenBalances(...args)
}));

vi.mock('@/utils/format', () => ({
  formatAmount: vi.fn(({ value }: { value: number }) => value.toFixed(8)),
  formatAsset: vi.fn((asset: string) => asset),
  formatTxid: vi.fn((txid: string) => `${txid.slice(0, 8)}...`)
}));

vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ message, className }: { message?: string; className?: string }) => (
    <div data-testid="spinner" className={className}>{message || 'Loading…'}</div>
  )
}));

vi.mock('@/components/ui/menus/utxo-menu', () => ({
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
    quantity_normalized: '100.00000000',
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
    quantity_normalized: '50',
    utxo: 'fff666eee555ddd444ccc333bbb222aaa111fff666eee555ddd444ccc333bbb222:1',
    utxo_address: 'bc1qtest123',
  },
];

describe('UtxoList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInView = false;
    mockFetchTokenBalances.mockResolvedValue(mockUtxoBalances);
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
      expect(screen.getByText('No UTXO-attached balances')).toBeInTheDocument();
    });
  });
});
