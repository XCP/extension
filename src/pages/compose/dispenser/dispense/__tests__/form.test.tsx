import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DispenseForm } from '../form';
import * as counterpartyApi from '@/utils/blockchain/counterparty/api';

// Mock the API module
vi.mock('@/utils/blockchain/counterparty/api');

// Mock contexts
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'test-wallet', name: 'Test Wallet' },
    activeAddress: { address: 'bc1qtest', walletId: 'test-wallet' },
    unlockWallet: vi.fn(),
  })
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { shouldShowHelpText: true },
  })
}));

vi.mock('@/contexts/composer-context', () => ({
  useComposer: () => ({
    composerError: null,
    setFormData: vi.fn(),
  })
}));

describe('DispenseForm', () => {
  const mockFormAction = vi.fn();
  const mockFetchAddressDispensers = vi.mocked(counterpartyApi.fetchAddressDispensers);
  const mockFetchAssetDetailsAndBalance = vi.mocked(counterpartyApi.fetchAssetDetailsAndBalance);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for BTC balance
    mockFetchAssetDetailsAndBalance.mockResolvedValue({
      asset: 'BTC',
      availableBalance: '0.1',
      isDivisible: true,
      assetInfo: null,
      utxoBalances: [],
    });
  });

  it('should render the form with initial fields', () => {
    render(<DispenseForm formAction={mockFormAction} />);
    
    expect(screen.getByLabelText(/Dispenser Address/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter the dispenser address/i)).toBeInTheDocument();
  });

  it('should fetch dispensers when address is entered', async () => {
    const mockDispensers = [
      {
        asset: 'PEPECASH',
        tx_hash: 'abc123',
        status: 0,
        give_remaining: 1000000,
        give_remaining_normalized: '10',
        give_quantity: 100000,
        give_quantity_normalized: '1',
        satoshirate: 5000,
        asset_info: {
          asset_longname: null,
          description: 'Rare Pepe Cash',
          issuer: 'test-issuer',
          divisible: true,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
    });

    render(<DispenseForm formAction={mockFormAction} />);
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'bc1qdispenser');
    
    await waitFor(() => {
      expect(mockFetchAddressDispensers).toHaveBeenCalledWith(
        'bc1qdispenser',
        { status: 'open', verbose: true }
      );
    });

    // Check that dispenser is displayed
    await waitFor(() => {
      expect(screen.getByText('PEPECASH')).toBeInTheDocument();
      expect(screen.getByText(/0.00005000 BTC/)).toBeInTheDocument();
      expect(screen.getByText(/1 Per Dispense/)).toBeInTheDocument();
      expect(screen.getByText(/10 Remaining/)).toBeInTheDocument();
    });
  });

  it('should show error when no dispensers found', async () => {
    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: [],
    });

    render(<DispenseForm formAction={mockFormAction} />);
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'bc1qnodispenser');
    
    await waitFor(() => {
      expect(screen.getByText(/No open dispenser found at this address/i)).toBeInTheDocument();
    });
  });

  it('should handle multiple dispensers at same address', async () => {
    const mockDispensers = [
      {
        asset: 'TOKENB',
        tx_hash: 'def456',
        status: 0,
        give_remaining: 5000,
        give_remaining_normalized: '5000',
        give_quantity: 100,
        give_quantity_normalized: '100',
        satoshirate: 3000,
        asset_info: {
          asset_longname: null,
          description: 'Token B',
          issuer: 'issuer2',
          divisible: false,
          locked: true,
        },
      },
      {
        asset: 'TOKENA',
        tx_hash: 'ghi789',
        status: 0,
        give_remaining: 2000,
        give_remaining_normalized: '2000',
        give_quantity: 50,
        give_quantity_normalized: '50',
        satoshirate: 3000,
        asset_info: {
          asset_longname: null,
          description: 'Token A',
          issuer: 'issuer1',
          divisible: false,
          locked: true,
        },
      },
      {
        asset: 'TOKENC',
        tx_hash: 'jkl012',
        status: 0,
        give_remaining: 10000,
        give_remaining_normalized: '10000',
        give_quantity: 1000,
        give_quantity_normalized: '1000',
        satoshirate: 5000,
        asset_info: {
          asset_longname: null,
          description: 'Token C',
          issuer: 'issuer3',
          divisible: false,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
    });

    render(<DispenseForm formAction={mockFormAction} />);
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'bc1qmultiple');
    
    await waitFor(() => {
      // Should show all dispensers sorted by price
      const dispenserElements = screen.getAllByRole('radio');
      expect(dispenserElements).toHaveLength(3);
      
      // Verify they're sorted by price (3000, 3000, 5000)
      expect(screen.getByText('TOKENA')).toBeInTheDocument();
      expect(screen.getByText('TOKENB')).toBeInTheDocument();
      expect(screen.getByText('TOKENC')).toBeInTheDocument();
    });
  });

  it('should allow selecting a dispenser', async () => {
    const mockDispensers = [
      {
        asset: 'XCP',
        tx_hash: 'xyz999',
        status: 0,
        give_remaining: 1000000000,
        give_remaining_normalized: '10',
        give_quantity: 100000000,
        give_quantity_normalized: '1',
        satoshirate: 4000,
        asset_info: {
          asset_longname: null,
          description: 'Counterparty',
          issuer: null,
          divisible: true,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
    });

    render(<DispenseForm formAction={mockFormAction} />);
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'bc1qxcp');
    
    await waitFor(() => {
      expect(screen.getByText('XCP')).toBeInTheDocument();
    });

    // Select the dispenser
    const radio = screen.getByRole('radio');
    await userEvent.click(radio);
    
    // Should show the amount input
    await waitFor(() => {
      expect(screen.getByLabelText(/Times to Dispense/i)).toBeInTheDocument();
    });
  });

  it('should calculate max dispenses based on BTC balance', async () => {
    const mockDispensers = [
      {
        asset: 'TESTTOKEN',
        tx_hash: 'test123',
        status: 0,
        give_remaining: 100000,
        give_remaining_normalized: '100000',
        give_quantity: 100,
        give_quantity_normalized: '100',
        satoshirate: 10000, // 0.0001 BTC per dispense
        asset_info: {
          asset_longname: null,
          description: 'Test Token',
          issuer: 'test',
          divisible: false,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
    });

    // Mock BTC balance of 0.01 BTC
    mockFetchAssetDetailsAndBalance.mockResolvedValue({
      asset: 'BTC',
      availableBalance: '0.01',
      isDivisible: true,
      assetInfo: null,
      utxoBalances: [],
    });

    render(<DispenseForm formAction={mockFormAction} />);
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'bc1qtest');
    
    await waitFor(() => {
      expect(screen.getByText('TESTTOKEN')).toBeInTheDocument();
    });

    // Select dispenser
    const radio = screen.getByRole('radio');
    await userEvent.click(radio);
    
    await waitFor(() => {
      const amountInput = screen.getByLabelText(/Times to Dispense/i);
      expect(amountInput).toBeInTheDocument();
    });

    // Click Max button
    const maxButton = screen.getByRole('button', { name: /Use maximum available amount/i });
    await userEvent.click(maxButton);
    
    // With 0.01 BTC and 0.0001 BTC per dispense, max should be ~99 (accounting for fees)
    await waitFor(() => {
      const amountInput = screen.getByLabelText(/Times to Dispense/i) as HTMLInputElement;
      const maxDispenses = parseInt(amountInput.value);
      expect(maxDispenses).toBeLessThanOrEqual(100);
      expect(maxDispenses).toBeGreaterThan(90); // Should be around 99 after fee adjustment
    });
  });

  it('should show error for insufficient BTC balance', async () => {
    const mockDispensers = [
      {
        asset: 'EXPENSIVE',
        tx_hash: 'exp123',
        status: 0,
        give_remaining: 10,
        give_remaining_normalized: '10',
        give_quantity: 1,
        give_quantity_normalized: '1',
        satoshirate: 100000000, // 1 BTC per dispense
        asset_info: {
          asset_longname: null,
          description: 'Expensive Token',
          issuer: 'rich',
          divisible: false,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
    });

    // Mock small BTC balance
    mockFetchAssetDetailsAndBalance.mockResolvedValue({
      asset: 'BTC',
      availableBalance: '0.001',
      isDivisible: true,
      assetInfo: null,
      utxoBalances: [],
    });

    render(<DispenseForm formAction={mockFormAction} />);
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'bc1qexpensive');
    
    await waitFor(() => {
      expect(screen.getByText('EXPENSIVE')).toBeInTheDocument();
    });

    // Select dispenser
    const radio = screen.getByRole('radio');
    await userEvent.click(radio);
    
    // Click Max button
    const maxButton = screen.getByRole('button', { name: /Use maximum available amount/i });
    await userEvent.click(maxButton);
    
    // Should show insufficient balance error
    await waitFor(() => {
      expect(screen.getByText(/Insufficient BTC balance/i)).toBeInTheDocument();
    });
  });
});