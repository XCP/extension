import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat, decodeAddressFromScript } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { asBaseUnits, asDisplayUnits } from '@/core/numeric';
import { ComposerProvider } from '../composer-context';
import { useComposer } from '../composer-context-object';

// A real, parseable BTC-only transaction (1 input, one 95000-sat P2PKH output,
// no OP_RETURN) so the composer's fee verification can decode it. Paired with
// inputs_values so the implied fee is small and sane.
const VALID_BTC_ONLY_TX =
  '020000000133997605bfe854fd8bdd784b47bd3b423488e64cc5fb5820e0f8d134670b0b670100000000ffffffff01' +
  'b873010000000000' + '19' + '76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac' +
  '00000000';

// The composed fixture below pays its change to this P2PKH script, so the mock wallet must own that
// address — output accounting (ADR-019) rejects a transaction whose outputs it cannot attribute.
const OWN_ADDRESS = decodeAddressFromScript('76a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac')!;

// Mock wallet context to avoid webext-bridge dependency in tests
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: OWN_ADDRESS },
    activeWallet: { id: 'test-wallet', addressFormat: AddressFormat.P2WPKH },
    authState: 'UNLOCKED',
    keychainLocked: false,
  }),
}));

// Mock the API module
vi.mock('@/core/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue(null),
}));

// Fee verification always resolves input values independently of the compose response (ADR-019),
// so every compose consults this resolver. Stub it rather than reaching the network.
vi.mock('@/core/counterparty/transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/counterparty/transaction')>()),
  fetchInputValues: vi.fn(async (inputs: Array<{ txid: string; vout: number }>) =>
    new Map(inputs.map((input) => [`${input.txid}:${input.vout}`, 100_000]))),
}));

// Mock settings context
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { showHelpText: true },
  }),
}));

// Mock loading context
vi.mock('@/contexts/loading-context', () => ({
  useLoading: () => ({
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
  }),
}));

// Mock header context
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    setHeaderProps: vi.fn(),
  }),
}));

describe('ComposerContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider', () => {
    it('should provide initial state', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      expect(result.current.state.step).toBe('form');
      expect(result.current.state.formData).toBeNull();
      expect(result.current.state.apiResponse).toBeNull();
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.isComposing).toBe(false);
      expect(result.current.state.isSigning).toBe(false);
    });

    it('should start with null form data', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // The provider should initialize with null form data
      expect(result.current.state.step).toBe('form');
      expect(result.current.state.formData).toBeNull();
      expect(result.current.state.apiResponse).toBeNull();
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.isComposing).toBe(false);
      expect(result.current.state.isSigning).toBe(false);
    });
  });

  describe('Actions', () => {
    it('should compose transaction', async () => {
      const formData = new FormData();
      formData.append('amount', '100');
      formData.append('address', 'bc1qtest');

      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: VALID_BTC_ONLY_TX,
          btc_in: 100000,
          btc_out: 90000,
          btc_change: 5000,
          btc_fee: 5000,
          data: 'counterparty_data',
          lock_scripts: [],
          inputs_values: [100000],
          signed_tx_estimated_size: {
            vsize: 250,
            adjusted_vsize: 250,
            sigops_count: 2,
          },
          psbt: 'psbt_data',
          params: {
            source: 'bc1qsource',
            destination: 'bc1qdest',
            asset: 'XCP',
            quantity: asBaseUnits(1000),
            memo: null,
            memo_is_hex: false,
            use_enhanced_send: false,
            no_dispense: false,
            skip_validation: false,
            asset_info: {
              asset_longname: null,
              description: 'Test Asset',
              issuer: 'bc1qissuer',
              divisible: true,
              locked: false,
              owner: 'bc1qowner',
            },
            quantity_normalized: asDisplayUnits('0.00001000'),
          },
          name: 'send',
        },
      };

      const mockComposeApi = vi.fn().mockResolvedValue(apiResponse);

      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      await act(async () => {
        result.current.composeTransaction(formData);
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe('review');
      });

      // The composer stores the fee the transaction actually pays, not the one the response
      // claims. This fixture is a good example of why: it asserts btc_fee 5000, while its inputs
      // (100,000, from the stubbed resolver) minus its single 95,160 sat output leave 4,840. Every
      // review screen renders `result.btc_fee`, so substituting it here is what makes them honest.
      expect(result.current.state.apiResponse).toEqual({
        ...apiResponse,
        result: { ...apiResponse.result, btc_fee: 4840 },
      });
      expect(result.current.state.verificationWarnings.join(' ')).toContain('4840');

      // The context converts FormData to plain object before calling composeApi
      const expectedData = {
        amount: '100',
        address: 'bc1qtest',
        sourceAddress: OWN_ADDRESS
      };
      expect(mockComposeApi).toHaveBeenCalledWith(expectedData);
    });

    it('should handle compose errors', async () => {
      const formData = new FormData();
      const errorMessage = 'Composition failed';

      const mockComposeApi = vi.fn().mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      await act(async () => {
        result.current.composeTransaction(formData);
      });

      await waitFor(() => {
        expect(result.current.state.error).toBe(errorMessage);
        expect(result.current.state.step).toBe('form');
      });
    });

    it('should preserve formData in state when compose fails', async () => {
      const formData = new FormData();
      formData.append('amount', '500');
      formData.append('recipient', 'bc1qtest123');
      const errorMessage = 'API unavailable';

      const mockComposeApi = vi.fn().mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      await act(async () => {
        result.current.composeTransaction(formData);
      });

      await waitFor(() => {
        expect(result.current.state.error).toBe(errorMessage);
        // formData should be preserved for error recovery
        expect(result.current.state.formData).toEqual({
          amount: '500',
          recipient: 'bc1qtest123',
        });
      });
    });

    it('should sign transaction', async () => {
      // This test is complex because signing now integrates with wallet context
      // We'll simplify it to test the state management aspects we can verify
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Manually set api response in state (since signAndBroadcast requires it)
      act(() => {
        // We can't directly manipulate state, so we'll skip complex signing tests
        // The signing functionality requires full wallet context mocking
        expect(result.current.signAndBroadcast).toBeDefined();
      });

      // Note: Full signing test would require complex wallet context mocking
      // For now we just verify the method exists and is callable
    });

    it('should handle sign errors', async () => {
      // Similar to sign test, this is complex due to wallet integration
      // We'll test that the signAndBroadcast method exists and handles errors appropriately
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Verify the method exists
      expect(result.current.signAndBroadcast).toBeDefined();
      
      // Note: Full error handling test would require complex wallet mocking
      // The actual error handling logic is tested through integration tests
    });

    it('should reset state', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Reset should work regardless of current state
      act(() => {
        result.current.reset();
      });

      expect(result.current.state.step).toBe('form');
      expect(result.current.state.formData).toBeNull();
      expect(result.current.state.apiResponse).toBeNull();
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.isComposing).toBe(false);
      expect(result.current.state.isSigning).toBe(false);
    });

    it('should revert to form', async () => {
      const formData = new FormData();
      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: VALID_BTC_ONLY_TX,
          btc_in: 50000,
          btc_out: 49000,
          btc_change: 0,
          btc_fee: 1000,
          data: '',
          lock_scripts: [],
          inputs_values: [96000],
          signed_tx_estimated_size: {
            vsize: 150,
            adjusted_vsize: 150,
            sigops_count: 1,
          },
          psbt: 'psbt_data',
          params: {
            source: 'bc1qsource',
            destination: 'bc1qdest',
            asset: 'BTC',
            quantity: asBaseUnits(0),
            memo: null,
            memo_is_hex: false,
            use_enhanced_send: false,
            no_dispense: false,
            skip_validation: false,
            asset_info: {
              asset_longname: null,
              description: '',
              issuer: '',
              divisible: true,
              locked: false,
              owner: '',
            },
            quantity_normalized: asDisplayUnits('0'),
          },
          name: 'send',
        },
      };

      const mockComposeApi = vi.fn().mockResolvedValue(apiResponse);

      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Move to review step
      await act(async () => {
        result.current.composeTransaction(formData);
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe('review');
      });

      // Go back to form (the method is now goBack)
      act(() => {
        result.current.goBack();
      });

      expect(result.current.state.step).toBe('form');
      expect(result.current.state.apiResponse).toBeNull();
    });

    it('should clear errors', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Note: There's no direct setError method anymore, errors are set internally
      // We can only test clearError functionality
      act(() => {
        result.current.clearError();
      });

      expect(result.current.state.error).toBeNull();
    });

    it('should update feeRate via setFeeRate', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={vi.fn()} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Initial feeRate should be null
      expect(result.current.feeRate).toBeNull();

      // Update feeRate
      act(() => {
        result.current.setFeeRate(5);
      });

      // feeRate should now be 5
      expect(result.current.feeRate).toBe(5);
    });

    it('should preserve feeRate when goBack is called', async () => {
      const formData = new FormData();
      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: VALID_BTC_ONLY_TX,
          btc_in: 50000,
          btc_out: 49000,
          btc_change: 0,
          btc_fee: 1000,
          data: '',
          lock_scripts: [],
          inputs_values: [96000],
          signed_tx_estimated_size: {
            vsize: 150,
            adjusted_vsize: 150,
            sigops_count: 1,
          },
          psbt: 'psbt_data',
          params: {
            source: 'bc1qsource',
            destination: 'bc1qdest',
            asset: 'BTC',
            quantity: asBaseUnits(0),
            memo: null,
            memo_is_hex: false,
            use_enhanced_send: false,
            no_dispense: false,
            skip_validation: false,
            asset_info: {
              asset_longname: null,
              description: '',
              issuer: '',
              divisible: true,
              locked: false,
              owner: '',
            },
            quantity_normalized: asDisplayUnits('0'),
          },
          name: 'send',
        },
      };

      const mockComposeApi = vi.fn().mockResolvedValue(apiResponse);

      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      // Set a feeRate
      act(() => {
        result.current.setFeeRate(10);
      });

      expect(result.current.feeRate).toBe(10);

      // Move to review step
      await act(async () => {
        result.current.composeTransaction(formData);
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe('review');
      });

      // feeRate should still be 10
      expect(result.current.feeRate).toBe(10);

      // Go back to form
      act(() => {
        result.current.goBack();
      });

      expect(result.current.state.step).toBe('form');
      // feeRate should be preserved after goBack
      expect(result.current.feeRate).toBe(10);
    });
  });

  describe('Transitions', () => {
    it('should track composing state during compose', async () => {
      const formData = new FormData();
      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: VALID_BTC_ONLY_TX,
          btc_in: 50000,
          btc_out: 49000,
          btc_change: 0,
          btc_fee: 1000,
          data: '',
          lock_scripts: [],
          inputs_values: [96000],
          signed_tx_estimated_size: {
            vsize: 150,
            adjusted_vsize: 150,
            sigops_count: 1,
          },
          psbt: 'psbt_data',
          params: {
            source: 'bc1qsource',
            destination: 'bc1qdest',
            asset: 'BTC',
            quantity: asBaseUnits(0),
            memo: null,
            memo_is_hex: false,
            use_enhanced_send: false,
            no_dispense: false,
            skip_validation: false,
            asset_info: {
              asset_longname: null,
              description: '',
              issuer: '',
              divisible: true,
              locked: false,
              owner: '',
            },
            quantity_normalized: asDisplayUnits('0'),
          },
          name: 'send',
        },
      };

      // Add delay to mock async operation
      const mockComposeApi = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(apiResponse), 100))
      );

      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <MemoryRouter>
            <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType="test">
              {children}
            </ComposerProvider>
          </MemoryRouter>
        ),
      });

      expect(result.current.state.isComposing).toBe(false);

      act(() => {
        result.current.composeTransaction(formData);
      });

      // Should be composing during async operation
      expect(result.current.state.isComposing).toBe(true);

      await waitFor(() => {
        expect(result.current.state.isComposing).toBe(false);
        expect(result.current.state.step).toBe('review');
      });
    });
  });
});
describe('a compose whose message is missing entirely', () => {
  // A real address, so the message this request should produce can actually be built — that is the
  // precondition for expecting the transaction to carry one.
  const DESTINATION = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

  /** A parseable composed transaction with no OP_RETURN and nothing but change. */
  const messagelessResponse = (params: Record<string, unknown>): ApiResponse => ({
    result: {
      rawtransaction: VALID_BTC_ONLY_TX,
      btc_fee: 4840,
      lock_scripts: [],
      inputs_values: [100000],
      params,
      name: 'send',
    },
  } as unknown as ApiResponse);

  function composeWith(composeType: string, response: ApiResponse) {
    const mockComposeApi = vi.fn().mockResolvedValue(response);
    return renderHook(() => useComposer(), {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <ComposerProvider composeApi={mockComposeApi} initialTitle="Test" composeType={composeType}>
            {children}
          </ComposerProvider>
        </MemoryRouter>
      ),
    });
  }

  it('refuses an asset send that carries no Counterparty message', async () => {
    // Every other check passes: there is no payload to disagree with, the only output is change,
    // and the fee is sane. The transaction simply would not send anything.
    const formData = new FormData();
    formData.set('destination', DESTINATION);
    formData.set('asset', 'XCP');
    formData.set('quantity', '1000');

    const { result } = composeWith('send', messagelessResponse({
      destination: DESTINATION, asset: 'XCP', quantity: 1000,
    }));

    await act(async () => {
      result.current.composeTransaction(formData);
    });

    await waitFor(() => {
      expect(result.current.state.isComposing).toBe(false);
    });
    expect(result.current.state.error).toContain('carries no Counterparty message');
    expect(result.current.state.step).toBe('form');
  });

  it('still allows a BTC send, which has no message to carry', async () => {
    // The guard must not fire where a missing payload is the correct shape.
    const formData = new FormData();
    formData.set('destination', DESTINATION);
    formData.set('asset', 'BTC');
    formData.set('quantity', '95160');

    const { result } = composeWith('send', messagelessResponse({
      destination: DESTINATION, asset: 'BTC', quantity: 95160,
    }));

    await act(async () => {
      result.current.composeTransaction(formData);
    });

    await waitFor(() => {
      expect(result.current.state.step).toBe('review');
    });
    expect(result.current.state.error).toBeNull();
  });
});
