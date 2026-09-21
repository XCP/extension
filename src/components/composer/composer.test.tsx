import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { AddressFormat, decodeAddressFromScript } from '@/core/bitcoin/address';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { packAddress } from '@/core/counterparty/unpack/address';
import { arc4 } from '@/core/counterparty/unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';

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

import { useComposer } from '@/contexts/composer-context-object';
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

// Fee verification always resolves input values independently of the compose response (ADR-019),
// so every compose consults this resolver. Stub it rather than reaching the network.
vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 100_000]))),
}));

// Mock fee rates to prevent network calls
vi.mock('@/core/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn().mockResolvedValue({
    fastestFee: 10,
    halfHourFee: 5,
    hourFee: 3,
    economyFee: 1,
    minimumFee: 1
  })
}));

// Both composed fixtures below pay their change to this P2PKH script, so the mock wallet must own
// that address — output accounting (ADR-019) rejects outputs it cannot attribute.
const OWN_ADDRESS = decodeAddressFromScript('76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac')!;

const mockActiveWallet = { id: 'wallet1', name: 'Test Wallet', addressFormat: AddressFormat.P2WPKH };
const mockActiveAddress = { address: OWN_ADDRESS, name: 'Test Address' };
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
      <button type="button" onClick={onReset}>Reset</button>
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
      <button type="button" onClick={onSign}>
        Sign
      </button>
      <button type="button" onClick={onBack}>Back</button>
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
     * A raw transaction carrying the given Counterparty message (type id + body) in an OP_RETURN,
     * ARC4-obfuscated with the first input's txid exactly as counterparty-core composes it. Core
     * always encrypts, and extraction always decrypts, so a fixture must be obfuscated to be read.
     */
    const FIRST_INPUT_TXID = '33'.repeat(32);
    function rawTxCarrying(message: number[]): string {
      const payload = arc4(
        hexToBytes(FIRST_INPUT_TXID),
        new Uint8Array([...hexToBytes(COUNTERPARTY_PREFIX_HEX), ...message])
      );

      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes(FIRST_INPUT_TXID),
        index: 0,
        witnessUtxo: { script: p2wpkh(getPublicKey(hexToBytes('11'.repeat(32)), true)).script, amount: 100_000n },
      });
      tx.addOutput({ script: new Uint8Array([0x6a, payload.length, ...payload]), amount: 0n });
      tx.addOutputAddress(OWN_ADDRESS, 98_000n); // change, back to the signer
      return bytesToHex(tx.unsignedTx);
    }

    /** A raw transaction carrying an enhanced send with the given memo. */
    function composedSendWithMemo(memo: string): string {
      return rawTxCarrying([
        0x02,
        ...encodeEnhancedSendCbor(1n, 100_000_000n, packAddress(DESTINATION), memo),
      ]);
    }

    it('blocks a send whose composed memo is not the one requested', async () => {
      // A send can be built locally, so verification is byte equality and any difference is fatal —
      // including a memo, which used to be classed informational and shown as a banner. There is no
      // benign reason for a composer to alter a message it was told to build.
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
        expect(screen.queryByTestId('review-component')).not.toBeInTheDocument();
      });
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

    it('shows an informational difference for a type it cannot build locally', async () => {
      // A binary memo is encoded differently by core, so packing declines and verification falls
      // back to comparing the fields it knows. That path keeps severity: a memo difference is
      // informational and belongs on the review screen rather than blocking. This is the banner's
      // remaining job now that predictable messages compare by bytes.
      const sweepBody = encodeCbor([
        packAddress(DESTINATION),
        3n,
        new TextEncoder().encode('composed memo'),
      ]);
      const rawtransaction = rawTxCarrying([0x04, ...sweepBody]);

      mockComposeApi.mockResolvedValue({
        result: { rawtransaction, inputs_values: [100_000], tx_hash: 'hash123' },
        error: null, id: 1, jsonrpc: '2.0',
      });

      const BinaryMemoSweepForm = ({ formAction }: any): ReactElement => (
        <form data-testid="form-component" onSubmit={(e) => {
          e.preventDefault();
          formAction(new FormData(e.currentTarget));
        }}>
          <input name="destination" defaultValue={DESTINATION} />
          <input name="flags" defaultValue="3" />
          <input name="memo" defaultValue="requested memo" />
          <input name="memo_is_hex" defaultValue="true" />
          <button type="submit">Compose</button>
        </form>
      );

      renderWithProvider({ FormComponent: BinaryMemoSweepForm, composeType: 'sweep' });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.getByTestId('review-component')).toBeInTheDocument();
      });
      expect(screen.getByText(/Composed transaction differs from your request/i)).toBeInTheDocument();
      expect(screen.getByText(/memo/i)).toBeInTheDocument();
    });

    it('renders the review screen from the transaction, not the API echo', async () => {
      // The echoed params claim a 999 PEPECASH send; the transaction encodes 1 XCP. The review
      // screen must show what the transaction says. Sweep-style types aside, this is the property
      // that keeps a verification gap visible instead of silent: even if a check missed, the user
      // is reading the bytes (ADR-019).
      const sweepBody = encodeCbor([
        packAddress(DESTINATION),
        3n,
        new TextEncoder().encode('requested memo'),
      ]);

      mockComposeApi.mockResolvedValue({
        result: {
          rawtransaction: rawTxCarrying([0x04, ...sweepBody]),
          inputs_values: [100_000],
          tx_hash: 'hash123',
          // A lie: the echo advertises a different destination than the message carries.
          params: { destination: '1LiedAboutThisAddressXXXXXXXXXXXXXX', flags: 3 },
        },
        error: null, id: 1, jsonrpc: '2.0',
      });

      const SweepForm = ({ formAction }: any): ReactElement => (
        <form data-testid="form-component" onSubmit={(e) => {
          e.preventDefault();
          formAction(new FormData(e.currentTarget));
        }}>
          <input name="destination" defaultValue={DESTINATION} />
          <input name="flags" defaultValue="3" />
          <input name="memo" defaultValue="requested memo" />
          <button type="submit">Compose</button>
        </form>
      );

      // A review component that renders what the real ones now read: the decoded message from
      // context. If the screen were still driven by result.params, the lie would appear here.
      const DecodedReview = (): ReactElement => {
        const { state } = useComposer();
        const decoded = state.decodedMessage?.data as { destination?: string } | undefined;
        return (
          <div data-testid="review-component">
            <div>Destination: {decoded?.destination ?? 'none'}</div>
          </div>
        );
      };

      renderWithProvider({
        FormComponent: SweepForm,
        ReviewComponent: DecodedReview,
        composeType: 'sweep',
      });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.getByTestId('review-component')).toBeInTheDocument();
      });
      expect(screen.getByText(`Destination: ${DESTINATION}`)).toBeInTheDocument();
      expect(screen.queryByText(/1LiedAboutThisAddress/)).not.toBeInTheDocument();
    });

    it('allows a burn, whose payee is a protocol constant the request never names', async () => {
      // Regression: output accounting rejects any output it cannot explain, and a burn pays the
      // protocol's unspendable address rather than anything the user typed — so deny-by-default
      // blocked every burn until that address was supplied as an intended destination.
      const BURN_ADDRESS = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes(FIRST_INPUT_TXID),
        index: 0,
        witnessUtxo: { script: p2wpkh(getPublicKey(hexToBytes('11'.repeat(32)), true)).script, amount: 200_000n },
      });
      tx.addOutputAddress(BURN_ADDRESS, 50_000n);
      tx.addOutputAddress(OWN_ADDRESS, 40_000n); // change; the stubbed resolver funds 100k

      mockComposeApi.mockResolvedValue({
        result: { rawtransaction: bytesToHex(tx.unsignedTx), inputs_values: [200_000], tx_hash: 'hash123' },
        error: null, id: 1, jsonrpc: '2.0',
      });

      const BurnForm = ({ formAction }: any): ReactElement => (
        <form data-testid="form-component" onSubmit={(e) => {
          e.preventDefault();
          formAction(new FormData(e.currentTarget));
        }}>
          <input name="quantity" defaultValue="50000" />
          <button type="submit">Compose</button>
        </form>
      );

      renderWithProvider({ FormComponent: BurnForm, composeType: 'burn' });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.getByTestId('review-component')).toBeInTheDocument();
      });
    });

    it('blocks a burn that sends a different amount than requested', async () => {
      // The burn address is the only output a burn may pay, and the amount is the only thing about
      // it the request pins — so a response burning more than asked must be rejected.
      const BURN_ADDRESS = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes(FIRST_INPUT_TXID),
        index: 0,
        witnessUtxo: { script: p2wpkh(getPublicKey(hexToBytes('11'.repeat(32)), true)).script, amount: 200_000n },
      });
      tx.addOutputAddress(BURN_ADDRESS, 80_000n); // more than was asked
      tx.addOutputAddress(OWN_ADDRESS, 10_000n);

      mockComposeApi.mockResolvedValue({
        result: { rawtransaction: bytesToHex(tx.unsignedTx), inputs_values: [200_000], tx_hash: 'hash123' },
        error: null, id: 1, jsonrpc: '2.0',
      });

      const BurnForm = ({ formAction }: any): ReactElement => (
        <form data-testid="form-component" onSubmit={(e) => {
          e.preventDefault();
          formAction(new FormData(e.currentTarget));
        }}>
          <input name="quantity" defaultValue="50000" />
          <button type="submit">Compose</button>
        </form>
      );

      renderWithProvider({ FormComponent: BurnForm, composeType: 'burn' });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.queryByTestId('review-component')).not.toBeInTheDocument();
      });
    });

    it('blocks a response that pays an address the request never named', async () => {
      // No field-level check covers this: the enhanced send's payload is exactly what was asked
      // for, and the extra payment rides along as a plain output. Output accounting (ADR-019) is
      // what catches it, because the address is neither ours nor named anywhere in the request.
      const tx = new Transaction({ allowUnknownOutputs: true, allowLegacyWitnessUtxo: true });
      tx.addInput({
        txid: hexToBytes('33'.repeat(32)),
        index: 0,
        witnessUtxo: { script: p2wpkh(getPublicKey(hexToBytes('11'.repeat(32)), true)).script, amount: 200_000n },
      });
      const payload = arc4(
        hexToBytes(FIRST_INPUT_TXID),
        new Uint8Array([
          ...hexToBytes(COUNTERPARTY_PREFIX_HEX),
          0x02,
          ...encodeEnhancedSendCbor(1n, 100_000_000n, packAddress(DESTINATION), 'requested memo'),
        ])
      );
      tx.addOutput({ script: new Uint8Array([0x6a, payload.length, ...payload]), amount: 0n });
      tx.addOutputAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 60_000n); // stranger
      tx.addOutputAddress(OWN_ADDRESS, 130_000n);

      mockComposeApi.mockResolvedValue({
        result: { rawtransaction: bytesToHex(tx.unsignedTx), inputs_values: [200_000], tx_hash: 'hash123' },
        error: null, id: 1, jsonrpc: '2.0',
      });

      renderWithProvider({ FormComponent: SendForm });
      fireEvent.submit(screen.getByTestId('form-component'));

      await waitFor(() => {
        expect(screen.queryByTestId('review-component')).not.toBeInTheDocument();
      });
    });

    it('claims no difference when the compose type has no field-level verifier', async () => {
      // A broadcast has no field verifier: only its message type is confirmed. That absence of
      // checking must not be announced as a detected difference — the banner is only credible on
      // types with field verification if it stays silent here.
      mockComposeApi.mockResolvedValue({
        result: {
          // Type id 13 (dispense), which has no field-level verifier of its own.
          rawtransaction: rawTxCarrying([0x0d, 0x00]),
          inputs_values: [100_000],
          tx_hash: 'hash123',
        },
        error: null, id: 1, jsonrpc: '2.0',
      });

      renderWithProvider({ composeType: 'dispense' });
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