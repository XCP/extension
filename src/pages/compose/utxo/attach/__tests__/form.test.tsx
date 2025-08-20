import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UtxoAttachForm } from '../form';
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

vi.mock('@/hooks/useAssetDetails', () => ({
  useAssetDetails: () => ({
    data: {
      assetInfo: {
        asset_longname: null,
        description: 'Test Token',
        issuer: 'bc1qissuer',
        divisible: true,
        locked: false,
        supply: '1000000'
      },
      availableBalance: '100'
    }
  })
}));

describe('UtxoAttachForm', () => {
  const mockFormAction = vi.fn();
  const defaultProps = {
    formAction: mockFormAction,
    initialFormData: null,
    initialAsset: 'TESTTOKEN',
    error: null,
    showHelpText: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form elements correctly', () => {
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    // Check for balance header
    expect(screen.getByText('Test Token')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();

    // Check for form inputs
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fee Rate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();
  });

  it('should disable continue button when amount is empty', () => {
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    expect(continueButton).toBeDisabled();
  });

  it('should enable continue button when valid amount is entered', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const amountInput = screen.getByLabelText(/Amount/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(amountInput, '10');
    expect(continueButton).toBeEnabled();
  });

  it('should keep continue button disabled for zero amount', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const amountInput = screen.getByLabelText(/Amount/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(amountInput, '0');
    expect(continueButton).toBeDisabled();
  });

  it('should keep continue button disabled for negative amount', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const amountInput = screen.getByLabelText(/Amount/i);
    const continueButton = screen.getByRole('button', { name: /Continue/i });

    await user.type(amountInput, '-5');
    expect(continueButton).toBeDisabled();
  });

  it('should display error message when error prop is provided', () => {
    const errorMessage = 'Insufficient funds for transfer';
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should dismiss error when close button is clicked', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Test error';
    const { rerender } = render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    expect(screen.getByText(errorMessage)).toBeInTheDocument();

    const closeButton = screen.getByLabelText(/Close/i);
    await user.click(closeButton);

    // Error should be dismissed
    await waitFor(() => {
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
    });
  });

  it('should populate max amount when Max button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const maxButton = screen.getByRole('button', { name: /Max/i });
    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;

    await user.click(maxButton);
    
    await waitFor(() => {
      expect(amountInput.value).toBe('100');
    });
  });

  it('should submit form with correct data', async () => {
    const user = userEvent.setup();
    const formAction = vi.fn();
    
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} formAction={formAction} />
      </MemoryRouter>
    );

    const amountInput = screen.getByLabelText(/Amount/i);
    const feeRateInput = screen.getByLabelText(/Fee Rate/i);
    
    await user.type(amountInput, '25');
    await user.clear(feeRateInput);
    await user.type(feeRateInput, '2');

    const form = screen.getByRole('button', { name: /Continue/i }).closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(formAction).toHaveBeenCalled();
    });
  });

  it('should show help text when enabled', () => {
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} showHelpText={true} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Enter the amount to attach/i)).toBeInTheDocument();
  });

  it('should include hidden asset input with correct value', () => {
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const hiddenInput = document.querySelector('input[name="asset"][type="hidden"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe('TESTTOKEN');
  });
});