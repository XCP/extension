import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DispenseForm } from '../form';
import { ComposerProvider } from '@/contexts/composer-context';
import { DEFAULT_KEYCHAIN_SETTINGS } from '@/utils/storage/settingsStorage';
import * as counterpartyApi from '@/utils/blockchain/counterparty/api';
import * as feeRateUtils from '@/utils/blockchain/bitcoin/feeRate';

// Mock the API module
vi.mock('@/utils/blockchain/counterparty/api');

// Mock fee rates to prevent network calls
vi.mock('@/utils/blockchain/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn().mockResolvedValue({
    fastestFee: 10,
    halfHourFee: 5,
    hourFee: 3,
    economyFee: 1,
    minimumFee: 1
  })
}));

// Mock contexts
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'test-wallet', name: 'Test Wallet' },
    activeAddress: { address: 'bc1qtest', walletId: 'test-wallet' },
    authState: 'unlocked',
    signTransaction: vi.fn(),
    broadcastTransaction: vi.fn(),
    unlockWallet: vi.fn(),
    isWalletLocked: vi.fn().mockResolvedValue(false)
  })
}));

// Mock settings context
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false },
    updateSettings: vi.fn(),
    isLoading: false
  })
}))

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setHeaderProps: vi.fn(),
    setTitle: vi.fn(),
    setAddressHeader: vi.fn(),
    subheadings: {
      addresses: {}
    }
  })
}))

vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({
    showLoading: vi.fn(() => 'loading-id'),
    hideLoading: vi.fn(),
    loading: false,
    setLoading: vi.fn()
  })
}));

describe('DispenseForm', () => {
  const mockFormAction = vi.fn();
  const mockFetchAddressDispensers = vi.mocked(counterpartyApi.fetchAddressDispensers);
  const mockFetchAssetDetailsAndBalance = vi.mocked(counterpartyApi.fetchAssetDetailsAndBalance);

  // Helper function to render with provider
  const renderWithProvider = (initialFormData: any = null) => {
    const mockComposeApi = vi.fn().mockResolvedValue({ result: { tx_hash: 'test' } });
    
    return render(
      <MemoryRouter>
        <ComposerProvider composeApi={mockComposeApi} initialTitle="Dispense">
          <DispenseForm formAction={mockFormAction} initialFormData={initialFormData} />
        </ComposerProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for BTC balance
    mockFetchAssetDetailsAndBalance.mockResolvedValue({
      isDivisible: true,
      availableBalance: '0.1',
      assetInfo: {
        asset: 'BTC',
        asset_longname: null,
        description: 'Bitcoin',
        issuer: undefined,
        divisible: true,
        locked: false,
        supply_normalized: '21000000',
      },
    });
  });

  it('should render the form with initial fields', () => {
    renderWithProvider();
    
    expect(screen.getByLabelText(/Dispenser Address/i)).toBeInTheDocument();
    // Help text is only shown when showHelpText is true
    // expect(screen.getByText(/Enter the dispenser address to send BTC to/i)).toBeInTheDocument();
  });

  it('should fetch dispensers when address is entered', async () => {
    const mockDispensers = [
      {
        asset: 'PEPECASH',
        source: 'bc1qsource',
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
      total: 1,
    });

    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    // Use the Counterparty burn address which is a valid Bitcoin address
    await userEvent.type(addressInput, '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    
    await waitFor(() => {
      expect(mockFetchAddressDispensers).toHaveBeenCalledWith(
        '1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
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

  it('should not fetch dispensers for invalid addresses', async () => {
    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    await userEvent.type(addressInput, 'invalid-address');
    
    // Wait a bit to ensure no fetch is triggered
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should not call fetchAddressDispensers for invalid addresses
    expect(mockFetchAddressDispensers).not.toHaveBeenCalled();
  });

  it('should show error when no dispensers found', async () => {
    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: [],
      total: 0,
    });

    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    // Use Counterparty burn address for testing
    await userEvent.type(addressInput, '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    
    await waitFor(() => {
      // There might be multiple error messages, use getAllByText
      const errors = screen.getAllByText(/No open dispenser found at this address/i);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  it('should allow selecting different dispensers', async () => {
    const mockDispensers = [
      {
        asset: 'PEPECASH',
        source: 'bc1qsource',
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
      {
        asset: 'RAREPEPE',
        source: 'bc1qsource',
        tx_hash: 'def456',
        status: 0,
        give_remaining: 500000,
        give_remaining_normalized: '5',
        give_quantity: 50000,
        give_quantity_normalized: '0.5',
        satoshirate: 10000,
        asset_info: {
          asset_longname: null,
          description: 'Rare Pepe',
          issuer: 'test-issuer',
          divisible: true,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
      total: 2,
    });

    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    // Use Counterparty burn address for testing
    await userEvent.type(addressInput, '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    
    await waitFor(() => {
      expect(screen.getByText('PEPECASH')).toBeInTheDocument();
      expect(screen.getByText('RAREPEPE')).toBeInTheDocument();
    }, { timeout: 10000 });

    // Find and click the second dispenser's radio button input directly
    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons).toHaveLength(2);
    
    // Click the second radio button
    await userEvent.click(radioButtons[1]);

    // Check that the second radio is selected
    await waitFor(() => {
      expect(radioButtons[1]).toBeChecked();
      expect(radioButtons[0]).not.toBeChecked();
    });
  }, 15000);

  it('should handle max dispenses calculation', async () => {
    const mockDispensers = [
      {
        asset: 'PEPECASH',
        source: 'bc1qsource',
        tx_hash: 'abc123',
        status: 0,
        give_remaining: 1000000,
        give_remaining_normalized: '10',
        give_quantity: 100000,
        give_quantity_normalized: '1',
        satoshirate: 1000,
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
      total: 1,
    });

    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    // Use Counterparty burn address for testing  
    await userEvent.type(addressInput, '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    
    await waitFor(() => {
      expect(screen.getByText('PEPECASH')).toBeInTheDocument();
    }, { timeout: 10000 });

    // Select the first dispenser
    const radioButton = screen.getByRole('radio');
    await userEvent.click(radioButton);
    
    // Wait for the radio button to be checked
    await waitFor(() => {
      expect(radioButton).toBeChecked();
    });

    // Click the max button
    const maxButton = screen.getByText('Max');
    await userEvent.click(maxButton);

    // Check that the input has been populated with max value
    await waitFor(() => {
      const timesInput = screen.getByLabelText(/Times to Dispense/i) as HTMLInputElement;
      expect(timesInput.value).toBe('10'); // Based on give_remaining_normalized / give_quantity_normalized
    });
  }, 15000);

  it('should show insufficient balance error', async () => {
    const mockDispensers = [
      {
        asset: 'EXPENSIVE',
        source: 'bc1qsource',
        tx_hash: 'abc123',
        status: 0,
        give_remaining: 1000000,
        give_remaining_normalized: '10',
        give_quantity: 100000,
        give_quantity_normalized: '1',
        satoshirate: 100000000, // 1 BTC per dispense (more than our 0.1 BTC balance)
        asset_info: {
          asset_longname: null,
          description: 'Expensive Asset',
          issuer: 'test-issuer',
          divisible: true,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
      total: 1,
    });

    // Mock lower BTC balance
    mockFetchAssetDetailsAndBalance.mockResolvedValue({
      isDivisible: true,
      availableBalance: '0.001',
      assetInfo: {
        asset: 'BTC',
        asset_longname: null,
        description: 'Bitcoin',
        issuer: undefined,
        divisible: true,
        locked: false,
        supply_normalized: '21000000',
      },
    });

    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    // Use Counterparty burn address for testing
    await userEvent.type(addressInput, '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    
    await waitFor(() => {
      expect(screen.getByText('EXPENSIVE')).toBeInTheDocument();
    });

    // Click the max button
    const maxButton = screen.getByText('Max');
    await userEvent.click(maxButton);

    // Should show insufficient balance error
    await waitFor(() => {
      expect(screen.getByText(/Insufficient BTC balance/i)).toBeInTheDocument();
    });
  });

  it('should handle empty dispenser', async () => {
    const mockDispensers = [
      {
        asset: 'EMPTY',
        source: 'bc1qsource',
        tx_hash: 'abc123',
        status: 0,
        give_remaining: 0,
        give_remaining_normalized: '0',
        give_quantity: 100000,
        give_quantity_normalized: '1',
        satoshirate: 1000,
        asset_info: {
          asset_longname: null,
          description: 'Empty Asset',
          issuer: 'test-issuer',
          divisible: true,
          locked: true,
        },
      },
    ];

    mockFetchAddressDispensers.mockResolvedValue({
      dispensers: mockDispensers,
      total: 1,
    });

    mockFetchAssetDetailsAndBalance.mockResolvedValue({
      isDivisible: true,
      availableBalance: '0.1',
      assetInfo: {
        asset: 'BTC',
        asset_longname: null,
        description: 'Bitcoin',
        issuer: undefined,
        divisible: true,
        locked: false,
        supply_normalized: '21000000',
      },
    });

    renderWithProvider();
    
    const addressInput = screen.getByLabelText(/Dispenser Address/i);
    // Use Counterparty burn address for testing
    await userEvent.type(addressInput, '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    
    await waitFor(() => {
      expect(screen.getByText('EMPTY')).toBeInTheDocument();
      expect(screen.getByText(/0 Remaining/i)).toBeInTheDocument();
    }, { timeout: 10000 });

    // Select the empty dispenser
    const radioButton = screen.getByRole('radio');
    await userEvent.click(radioButton);
    
    // Wait for the radio button to be checked
    await waitFor(() => {
      expect(radioButton).toBeChecked();
    });

    // Click the max button
    const maxButton = screen.getByText('Max');
    await userEvent.click(maxButton);

    // Should show empty dispenser error
    await waitFor(() => {
      expect(screen.getByText(/This dispenser is empty and cannot be triggered/i)).toBeInTheDocument();
    });
  }, 15000);
});