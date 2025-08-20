import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UtxoMoveForm } from '../form';
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
      { asset: 'TESTTOKEN', quantity_normalized: '100' },
      { asset: 'XCP', quantity_normalized: '50' }
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

describe('UtxoMoveForm', () => {
  const mockFormAction = vi.fn();
  const defaultProps = {
    formAction: mockFormAction,
    initialFormData: null,
    initialUtxo: 'abc123def456:0',
    error: null,
    showHelpText: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form elements correctly', async () => {
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    // Check for address header
    expect(screen.getByText('Test Wallet')).toBeInTheDocument();
    expect(screen.getByText(/bc1qte.*est123/i)).toBeInTheDocument();

    // Check for Output display
    expect(screen.getByText('Output')).toBeInTheDocument();
    
    // Wait for balance count to load
    await waitFor(() => {
      expect(screen.getByText('2 Balances')).toBeInTheDocument();
    });

    // Check for form inputs
    expect(screen.getByLabelText(/Destination/i)).toBeInTheDocument();
    expect(screen.getByText(/Fee Rate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
  });

  it('should display truncated UTXO', async () => {
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    // Should show truncated UTXO format
    expect(screen.getByText(/abc123de.*f456:0/)).toBeInTheDocument();
  });

  it('should navigate to UTXO details when Output is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    const outputDisplay = screen.getByRole('button', { name: /abc123/ });
    await user.click(outputDisplay);

    expect(mockNavigate).toHaveBeenCalledWith('/utxo/abc123def456:0');
  });

  it('should disable continue button when destination is empty', () => {
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    expect(continueButton).toBeDisabled();
  });

  it('should enable continue button when valid destination is entered', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByLabelText(/Destination/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(destinationInput, 'bc1qvalidaddress123');
    
    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });
  });

  it('should keep continue button disabled for invalid address', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByLabelText(/Destination/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(destinationInput, 'invalid-address');
    
    await waitFor(() => {
      expect(continueButton).toBeDisabled();
    });
  });

  it('should display error message when error prop is provided', () => {
    const errorMessage = 'Transaction failed';
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should handle single balance correctly', async () => {
    const { fetchUtxoBalances } = await import('@/utils/blockchain/counterparty');
    (fetchUtxoBalances as any).mockResolvedValueOnce({
      result: [{ asset: 'TESTTOKEN', quantity_normalized: '100' }]
    });

    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('1 Balance')).toBeInTheDocument();
    });
  });

  it('should handle empty balances', async () => {
    const { fetchUtxoBalances } = await import('@/utils/blockchain/counterparty');
    (fetchUtxoBalances as any).mockResolvedValueOnce({
      result: []
    });

    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('0 Balances')).toBeInTheDocument();
    });
  });

  it('should include hidden sourceUtxo input', () => {
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} />
      </MemoryRouter>
    );

    const hiddenInput = document.querySelector('input[name="sourceUtxo"][type="hidden"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe('abc123def456:0');
  });

  it('should submit form with correct data', async () => {
    const user = userEvent.setup();
    const formAction = vi.fn();
    
    render(
      <MemoryRouter>
        <UtxoMoveForm {...defaultProps} formAction={formAction} />
      </MemoryRouter>
    );

    const destinationInput = screen.getByLabelText(/Destination/i);
    
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
        <UtxoMoveForm {...defaultProps} showHelpText={true} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Enter the recipient's Bitcoin address/i)).toBeInTheDocument();
  });
});