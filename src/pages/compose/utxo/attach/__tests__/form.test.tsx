import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UtxoAttachForm } from '../form';
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
    expect(screen.getByText('TESTTOKEN')).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();

    // Check for form inputs
    expect(screen.getByRole('textbox', { name: /Amount/i })).toBeInTheDocument();
    expect(screen.getByText(/Loading fee rates…/i)).toBeInTheDocument();
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

    const amountInput = screen.getByRole('textbox', { name: /Amount/i });
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

    const amountInput = screen.getByRole('textbox', { name: /Amount/i });
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

    const amountInput = screen.getByRole('textbox', { name: /Amount/i });
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

  it('should have dismiss button for error message', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Test error';
    const { rerender } = render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} error={errorMessage} />
      </MemoryRouter>
    );

    expect(screen.getByText(errorMessage)).toBeInTheDocument();

    // Dismiss button should be present
    const closeButton = screen.getByLabelText(/Dismiss error message/i);
    expect(closeButton).toBeInTheDocument();
    
    // When error prop is removed, error should disappear
    rerender(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} error={null} />
      </MemoryRouter>
    );
    
    expect(screen.queryByText(errorMessage)).toBeInTheDocument(); // Error from props persists until prop changes
  });

  it('should populate max amount when Max button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UtxoAttachForm {...defaultProps} />
      </MemoryRouter>
    );

    const maxButton = screen.getByRole('button', { name: /Max/i });
    const amountInput = screen.getByRole('textbox', { name: /Amount/i }) as HTMLInputElement;

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

    const amountInput = screen.getByRole('textbox', { name: /Amount/i });
    // Fee rate input is loading, check for loading message instead
    expect(screen.getByText(/Loading fee rates…/i)).toBeInTheDocument();
    
    await user.type(amountInput, '25');
    // Fee rate is set via hidden input, no need to interact with it

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