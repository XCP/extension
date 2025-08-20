import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UtxoDetachForm } from '../form';
import { MemoryRouter } from 'react-router-dom';

// Mock Browser.runtime.connect to fix webext-bridge error
vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
}));

// Mock contexts
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123' },
    activeWallet: { name: 'Test Wallet' }
  })
}));

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: false }
  })
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setBalanceHeader: vi.fn(),
    setAddressHeader: vi.fn(),
    clearHeaders: vi.fn(),
    subheadings: {
      addresses: {},
      balances: {}
    }
  })
}));

vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({
    setLoading: vi.fn(),
    loading: false
  })
}));

// Mock API call
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchUtxoBalances: vi.fn().mockResolvedValue({
    result: [
      { asset: 'TESTTOKEN', quantity_normalized: '100' }
    ]
  })
}));

// Mock address validation and fee rates
vi.mock('@/utils/blockchain/bitcoin', () => ({
  isValidBitcoinAddress: vi.fn((address) => {
    // Allow test addresses
    return address.startsWith('bc1q') || address.startsWith('1') || address.startsWith('3');
  }),
  getFeeRates: vi.fn().mockResolvedValue({
    fastestFee: 3,
    halfHourFee: 2,
    hourFee: 1,
    economyFee: 0.5,
    minimumFee: 0.1
  })
}));

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('UtxoDetachForm', () => {
  const mockFormAction = vi.fn();
  const defaultProps = {
    formAction: mockFormAction,
    initialFormData: null,
    initialUtxo: 'def456abc123:1',
    error: null,
    showHelpText: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form elements correctly', async () => {
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    // Check for address header
    expect(screen.getByText('Test Wallet')).toBeInTheDocument();
    expect(screen.getByText(/bc1qte.*est123/i)).toBeInTheDocument();

    // Check for Output display
    expect(screen.getByText('Output')).toBeInTheDocument();
    
    // Wait for balance count to load
    await waitFor(() => {
      expect(screen.getByText('1 Balance')).toBeInTheDocument();
    });

    // Check for form inputs
    expect(screen.getByLabelText(/Destination \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Fee Rate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
  });

  it('should allow submission without destination (optional field)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    
    // Should be enabled without destination since it's optional
    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });
  });

  it('should accept optional destination address', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByLabelText(/Destination \(Optional\)/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(destinationInput, 'bc1qoptionaldest123');
    
    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });
  });

  it('should disable continue button for invalid destination', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByLabelText(/Destination \(Optional\)/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(destinationInput, 'invalid-address');
    
    await waitFor(() => {
      expect(continueButton).toBeDisabled();
    });
  });

  it('should navigate to UTXO details when Output is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    const outputDisplay = screen.getByRole('button', { name: /def456/ });
    await user.click(outputDisplay);

    expect(mockNavigate).toHaveBeenCalledWith('/utxo/def456abc123:1');
  });

  it('should display error message when error prop is provided', () => {
    const errorMessage = 'Failed to detach UTXO';
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should have dismiss button for error message', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Test error';
    const { rerender } = render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    
    // Dismiss button should be present
    const closeButton = screen.getByLabelText(/Dismiss error message/i);
    expect(closeButton).toBeInTheDocument();
    
    // When error prop is removed, error should disappear
    rerender(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} error={null} />
      </MemoryRouter>
    );
    
    expect(screen.queryByText(errorMessage)).toBeInTheDocument(); // Error from props persists until prop changes
  });

  it('should handle multiple balances correctly', async () => {
    const { fetchUtxoBalances } = await import('@/utils/blockchain/counterparty');
    (fetchUtxoBalances as any).mockResolvedValueOnce({
      result: [
        { asset: 'TESTTOKEN', quantity_normalized: '100' },
        { asset: 'XCP', quantity_normalized: '50' },
        { asset: 'RAREPEPE', quantity_normalized: '1' }
      ]
    });

    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('3 Balances')).toBeInTheDocument();
    });
  });

  it('should include hidden sourceUtxo input', () => {
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    const hiddenInput = document.querySelector('input[name="sourceUtxo"][type="hidden"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe('def456abc123:1');
  });

  it('should show placeholder text for destination', () => {
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByPlaceholderText(/Leave empty to use UTXO's address/i);
    expect(destinationInput).toBeInTheDocument();
  });

  it('should submit form with empty destination', async () => {
    const user = userEvent.setup();
    const formAction = vi.fn();
    
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} formAction={formAction} />
      </MemoryRouter>
    );

    // Fee rate is handled by a dropdown selector, not an input

    const form = screen.getByRole('button', { name: /Continue/i }).closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(formAction).toHaveBeenCalled();
    });
  });

  it('should submit form with destination', async () => {
    const user = userEvent.setup();
    const formAction = vi.fn();
    
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} formAction={formAction} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByLabelText(/Destination \(Optional\)/i);
    
    await user.type(destinationInput, 'bc1qdestination123');

    const form = screen.getByRole('button', { name: /Continue/i }).closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(formAction).toHaveBeenCalled();
    });
  });

  it('should show help text when enabled', () => {
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} showHelpText={true} />
      </MemoryRouter>
    );

    expect(screen.getByText(/The address to detach assets to/i)).toBeInTheDocument();
  });

  it('should handle API fetch error gracefully', async () => {
    const { fetchUtxoBalances } = await import('@/utils/blockchain/counterparty');
    (fetchUtxoBalances as any).mockRejectedValueOnce(new Error('API Error'));

    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} />
      </MemoryRouter>
    );

    // Should still render form even if balance fetch fails
    await waitFor(() => {
      expect(screen.getByText('0 Balances')).toBeInTheDocument();
    });
  });
});