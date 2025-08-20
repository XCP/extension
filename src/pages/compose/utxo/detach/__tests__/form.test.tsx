import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UtxoDetachForm } from '../form';
import { MemoryRouter } from 'react-router-dom';

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

// Mock API call
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchUtxoBalances: vi.fn().mockResolvedValue({
    result: [
      { asset: 'TESTTOKEN', quantity_normalized: '100' }
    ]
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
    expect(screen.getByText(/bc1qtest123/i)).toBeInTheDocument();

    // Check for Output display
    expect(screen.getByText('Output')).toBeInTheDocument();
    
    // Wait for balance count to load
    await waitFor(() => {
      expect(screen.getByText('1 Balance')).toBeInTheDocument();
    });

    // Check for form inputs
    expect(screen.getByLabelText(/Destination \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fee Rate/i)).toBeInTheDocument();
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

  it('should dismiss error when close button is clicked', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Test error';
    render(
      <MemoryRouter>
        <UtxoDetachForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    const closeButton = screen.getByLabelText(/Close/i);
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
    });
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

    const feeRateInput = screen.getByLabelText(/Fee Rate/i);
    
    await user.clear(feeRateInput);
    await user.type(feeRateInput, '2');

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
    const feeRateInput = screen.getByLabelText(/Fee Rate/i);
    
    await user.type(destinationInput, 'bc1qdestination123');
    await user.clear(feeRateInput);
    await user.type(feeRateInput, '3');

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