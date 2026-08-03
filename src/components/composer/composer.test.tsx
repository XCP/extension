import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { Transaction, p2wpkh } from '@scure/btc-signer';
import { getPublicKey } from '@noble/secp256k1';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { COUNTERPARTY_PREFIX_HEX } from '@/utils/blockchain/counterparty/unpack/messageTypes';
import { packAddress } from '@/utils/blockchain/counterparty/unpack/address';

/** Encode an enhanced send as counterparty-core does: CBOR [asset_id, quantity, address, memo]. */
function encodeEnhancedSendCbor(
  assetId: bigint,
  quantity: bigint,
  address: Uint8Array,
  memo: string
): number[] {
  const uint = (major: number, value: bigint): number[] => {
    const base = major << 5;
    if (value < 24n) return [base | Number(value)];
    if (value < 256n) return [base | 24, Number(value)];
    if (value < 65536n) return [base | 25, Number(value >> 8n), Number(value & 0xffn)];
    if (value < 4294967296n) {
      return [base | 26, ...[24n, 16n, 8n, 0n].map((s) => Number((value >> s) & 0xffn))];
    }
    return [base | 27, ...[56n, 48n, 40n, 32n, 24n, 16n, 8n, 0n].map((s) => Number((value >> s) & 0xffn))];
  };
  const memoBytes = new TextEncoder().encode(memo);
  return [
    0x84,
    ...uint(0, assetId),
    ...uint(0, quantity),
    ...uint(2, BigInt(address.length)), ...address,
    ...uint(2, BigInt(memoBytes.length)), ...memoBytes,
  ];
}

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

  describe('differences between the request and the composed transaction', () => {
    const DESTINATION = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

    /** A form submitting the fields a send is verified against. */
    const SendForm = ({ formAction }: any): ReactElement => (
      <form data-testid="form-component" onSubmit={(e) => {
        e.preventDefault();
        formAction(new FormData(e.currentTarget));
      }}>
        <input name="destination" defaultValue={DESTINATION} />
        <input name="asset" defaultValue="XCP" />
        <input name="quantity" defaultValue="1" />
        <input name="memo" defaultValue="requested memo" />
        <button type="submit">Compose</button>
      </form>
    );

    /**
     * A raw transaction carrying an enhanced send whose memo is not the one requested. The payload
     * is plaintext, which extraction accepts, so the test needs no ARC4 key.
     */
    function composedSendWithMemo(memo: string): string {
      const payload = new Uint8Array([
        ...hexToBytes(COUNTERPARTY_PREFIX_HEX),
        0x02,
        ...encodeEnhancedSendCbor(1n, 100_000_000n, packAddress(DESTINATION), memo),
      ]);

      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes('33'.repeat(32)),
        index: 0,
        witnessUtxo: { script: p2wpkh(getPublicKey(hexToBytes('11'.repeat(32)), true)).script, amount: 100_000n },
      });
      tx.addOutput({ script: new Uint8Array([0x6a, payload.length, ...payload]), amount: 0n });
      tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 98_000n);
      return bytesToHex(tx.unsignedTx);
    }

    it('shows an informational difference on the review screen', async () => {
      // A memo mismatch is informational: it does not block, and before this it went only to a
      // console.warn that production builds strip.
      mockComposeApi.mockResolvedValue({
        result: {
          rawtransaction: composedSendWithMemo('composed memo'),
          inputs_values: [100_000],
          tx_hash: 'hash123',
        },
        error: null, id: 1, jsonrpc: '2.0',
      });

      renderWithProvider({ FormComponent: SendForm });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.getByTestId('review-component')).toBeInTheDocument();
      });
      expect(screen.getByText(/Composed transaction differs from your request/i)).toBeInTheDocument();
      expect(screen.getByText(/memo/i)).toBeInTheDocument();
    });

    it('shows nothing when the composed transaction matches', async () => {
      mockComposeApi.mockResolvedValue({
        result: {
          rawtransaction: composedSendWithMemo('requested memo'),
          inputs_values: [100_000],
          tx_hash: 'hash123',
        },
        error: null, id: 1, jsonrpc: '2.0',
      });

      renderWithProvider({ FormComponent: SendForm });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.getByTestId('review-component')).toBeInTheDocument();
      });
      expect(
        screen.queryByText(/Composed transaction differs from your request/i)
      ).not.toBeInTheDocument();
    });
  });

});