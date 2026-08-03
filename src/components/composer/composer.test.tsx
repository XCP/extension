import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

// Mock webext-bridge before any imports that might use it
vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
}));

import { Composer } from './composer';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

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

const mockActiveWallet = { id: 'wallet1', name: 'Test Wallet', addressFormat: AddressFormat.P2WPKH };
const mockActiveAddress = { address: 'bc1qtest123', name: 'Test Address' };
const mockSignTransaction = vi.fn();
const mockBroadcastTransaction = vi.fn();

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: mockActiveWallet,
    activeAddress: mockActiveAddress,
    signTransaction: mockSignTransaction,
    broadcastTransaction: mockBroadcastTransaction
  })
}));

// Mock Spinner component for loading states
vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ message }: any) => <div data-testid="loading-spinner" role="status">{message}</div>
}));

const mockSetHeaderProps = vi.fn();
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setHeaderProps: mockSetHeaderProps
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

vi.mock('@/components/screens/success-screen', () => ({
  SuccessScreen: ({ apiResponse, onReset }: any) => (
    <div data-testid="success-screen">
      <div>Success! TX: {apiResponse?.result?.tx_hash}</div>
      <button onClick={onReset}>Reset</button>
    </div>
  )
}));

// Mock React hooks
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useActionState: vi.fn((action: any, initialState: any) => {
      const [state, setState] = (actual as any).useState(initialState);
      const [isPending, setIsPending] = (actual as any).useState(false);
      
      const wrappedAction = async (formData: any) => {
        setIsPending(true);
        try {
          const result = await action(state, formData);
          setState(result);
          return result;
        } finally {
          setIsPending(false);
        }
      };
      
      return [state, wrappedAction, isPending];
    }),
    useTransition: () => [false, (fn: () => void) => fn()]
  };
});

describe('Composer', () => {
  const mockApiResponse = {
    result: {
      // A real, parseable BTC-only transaction so fee verification can decode it.
      rawtransaction: '020000000133997605bfe854fd8bdd784b47bd3b423488e64cc5fb5820e0f8d134670b0b670100000000ffffffff01b8730100000000001976a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac00000000',
      // Its single output is 95160 sats; fee verification needs the input value to
      // compute the fee rather than resolve it over the network.
      inputs_values: [96000],
      tx_hash: 'hash123',
      data: 'data123'
    },
    error: null,
    id: 1,
    jsonrpc: '2.0'
  };

  // Updated mock components to match new architecture
  const MockFormComponent = ({ formAction, initialFormData }: any): ReactElement => (
    <form data-testid="form-component" onSubmit={(e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      formAction(formData);
    }}>
      <input name="amount" defaultValue={initialFormData?.amount || ''} />
      <button type="submit">Compose</button>
    </form>
  );

  const MockReviewComponent = ({ apiResponse, onSign, onBack }: any): ReactElement => (
    <div data-testid="review-component">
      <div>Transaction: {apiResponse?.result?.rawtransaction}</div>
      <button onClick={onSign}>
        Sign
      </button>
      <button onClick={onBack}>Back</button>
    </div>
  );

  const mockComposeApi = vi.fn();

  const defaultProps = {
    composeType: 'send' as const,
    composeApiMethod: mockComposeApi,
    initialTitle: 'Test Transaction',
    FormComponent: MockFormComponent,
    ReviewComponent: MockReviewComponent
  };

  // Helper function to render - Composer includes its own provider
  const renderWithProvider = (props = {}) => {
    return render(
      <MemoryRouter>
        <Composer {...defaultProps} {...props} />
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignTransaction.mockResolvedValue('signed123');
    mockBroadcastTransaction.mockResolvedValue({ tx_hash: 'broadcast123' });
    mockComposeApi.mockResolvedValue(mockApiResponse);
  });

  it('should render form component initially', () => {
    renderWithProvider();
    
    expect(screen.getByTestId('form-component')).toBeInTheDocument();
  });

  it('should set header props on mount', () => {
    renderWithProvider();
    
    expect(mockSetHeaderProps).toHaveBeenCalled();
    const headerConfig = mockSetHeaderProps.mock.calls[0]![0];
    expect(headerConfig.title).toBe('Test Transaction');
  });

  it('should handle form submission', async () => {
    renderWithProvider();
    
    const form = screen.getByTestId('form-component');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(mockComposeApi).toHaveBeenCalled();
    });
  });

  it('should show loading when composing', async () => {
    // Make the API call take some time to see the loading state
    mockComposeApi.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockApiResponse), 100))
    );

    renderWithProvider();

    const form = screen.getByTestId('form-component');
    fireEvent.submit(form);

    // Check for the loading spinner to appear immediately
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Composing transaction…')).toBeInTheDocument();

    // Wait for it to disappear after API completes
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Should now show review component
    expect(screen.getByTestId('review-component')).toBeInTheDocument();
  });

  it('should render review component when step is review', async () => {
    // For this test, we need to simulate the compose flow
    renderWithProvider();
    
    // First submit the form to trigger compose
    const form = screen.getByTestId('form-component');
    fireEvent.submit(form);
    
    // Wait for the review screen to appear
    await waitFor(() => {
      expect(screen.queryByTestId('review-component')).toBeInTheDocument();
    });
  });

  it('should handle sign action', async () => {
    renderWithProvider();
    
    // First go to review by submitting form
    const form = screen.getByTestId('form-component');
    fireEvent.submit(form);
    
    // Wait for review screen and then sign
    await waitFor(() => {
      expect(screen.queryByTestId('review-component')).toBeInTheDocument();
    });
    
    const signButton = screen.getByText('Sign');
    fireEvent.click(signButton);
    
    await waitFor(() => {
      expect(mockSignTransaction).toHaveBeenCalled();
    });
  });

});