import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ComposerProvider, useComposer } from '../composer-context';
import type { ApiResponse } from '@/utils/blockchain/counterparty';

// Mock wallet context to avoid webext-bridge dependency in tests
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'test-address' },
    activeWallet: { id: 'test-wallet' },
    authState: 'UNLOCKED',
    walletLocked: false,
  }),
}));

// Mock the API module
vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchAssetDetails: vi.fn().mockResolvedValue(null),
}));

describe('ComposerContext', () => {
  const mockComposeTransaction = vi.fn();
  const mockSignFunction = vi.fn();
  const mockHideLoading = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider', () => {
    it('should provide initial state', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      expect(result.current.state.step).toBe('form');
      expect(result.current.state.formData).toBeNull();
      expect(result.current.state.apiResponse).toBeNull();
      expect(result.current.state.error).toBeNull();
      expect(result.current.isPending).toBe(false);
    });

    it('should handle initial form data in provider', () => {
      // Test that the provider can be instantiated with initial form data
      // without errors, even if the data gets cleared by subsequent effects
      const initialData = { amount: 100, address: 'bc1qtest' };
      
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider initialFormData={initialData}>
            {children}
          </ComposerProvider>
        ),
      });

      // The provider should initialize properly
      expect(result.current.state.step).toBe('form');
      expect(result.current.state.apiResponse).toBeNull();
      expect(result.current.state.error).toBeNull();
      expect(result.current.isPending).toBe(false);
      
      // The context's useEffect clears formData when in 'form' state and not returning from 'review'
      // This is expected behavior - initial data is accepted but then cleared to ensure clean form state
      expect(result.current.state.formData).toBeNull();
    });
  });

  describe('Actions', () => {
    it('should compose transaction', async () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      const formData = new FormData();
      formData.append('amount', '100');
      formData.append('address', 'bc1qtest');

      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: '0x123abc',
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
            quantity: 1000,
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
            quantity_normalized: '0.00001000',
          },
          name: 'send',
        },
      };

      mockComposeTransaction.mockResolvedValue(apiResponse);

      await act(async () => {
        result.current.compose(
          formData,
          mockComposeTransaction,
          'bc1qsource',
          'loading-1',
          mockHideLoading
        );
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe('review');
        expect(result.current.state.apiResponse).toEqual(apiResponse);
      });

      // The context converts FormData to plain object before calling composeTransaction
      const expectedData = {
        amount: '100',
        address: 'bc1qtest',
        sourceAddress: 'bc1qsource'
      };
      expect(mockComposeTransaction).toHaveBeenCalledWith(expectedData);
      expect(mockHideLoading).toHaveBeenCalledWith('loading-1');
    });

    it('should handle compose errors', async () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      const formData = new FormData();
      const errorMessage = 'Composition failed';

      mockComposeTransaction.mockRejectedValue(new Error(errorMessage));

      await act(async () => {
        result.current.compose(
          formData,
          mockComposeTransaction,
          'bc1qsource',
          'loading-1',
          mockHideLoading
        );
      });

      await waitFor(() => {
        expect(result.current.state.error).toBe(errorMessage);
        expect(result.current.state.step).toBe('form');
      });

      expect(mockHideLoading).toHaveBeenCalledWith('loading-1');
    });

    it('should sign transaction', async () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: '0x123abc',
          btc_in: 100000,
          btc_out: 95000,
          btc_change: 0,
          btc_fee: 5000,
          data: '',
          lock_scripts: [],
          inputs_values: [100000],
          signed_tx_estimated_size: {
            vsize: 200,
            adjusted_vsize: 200,
            sigops_count: 1,
          },
          psbt: 'psbt_data',
          params: {
            source: 'bc1qsource',
            destination: 'bc1qdest',
            asset: 'BTC',
            quantity: 0,
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
            quantity_normalized: '0',
          },
          name: 'send',
        },
      };

      mockSignFunction.mockResolvedValue(undefined);

      await act(async () => {
        result.current.sign(apiResponse, mockSignFunction);
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe('success');
      });

      expect(mockSignFunction).toHaveBeenCalled();
    });

    it('should handle sign errors', async () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: '0x123abc',
          btc_in: 100000,
          btc_out: 95000,
          btc_change: 0,
          btc_fee: 5000,
          data: '',
          lock_scripts: [],
          inputs_values: [100000],
          signed_tx_estimated_size: {
            vsize: 200,
            adjusted_vsize: 200,
            sigops_count: 1,
          },
          psbt: 'psbt_data',
          params: {
            source: 'bc1qsource',
            destination: 'bc1qdest',
            asset: 'BTC',
            quantity: 0,
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
            quantity_normalized: '0',
          },
          name: 'send',
        },
      };

      const errorMessage = 'Signing failed';
      mockSignFunction.mockRejectedValue(new Error(errorMessage));

      await act(async () => {
        result.current.sign(apiResponse, mockSignFunction);
      });

      await waitFor(() => {
        expect(result.current.state.error).toBe(errorMessage);
        expect(result.current.state.step).not.toBe('success');
      });
    });

    it('should reset state', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider initialFormData={{ test: 'data' }}>
            {children}
          </ComposerProvider>
        ),
      });

      // Set some state
      act(() => {
        result.current.setError('Test error');
      });

      expect(result.current.state.error).toBe('Test error');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.state.step).toBe('form');
      expect(result.current.state.formData).toBeNull();
      expect(result.current.state.apiResponse).toBeNull();
      expect(result.current.state.error).toBeNull();
    });

    it('should revert to form', async () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      // Move to review step
      const formData = new FormData();
      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: '0x123',
          btc_in: 50000,
          btc_out: 49000,
          btc_change: 0,
          btc_fee: 1000,
          data: '',
          lock_scripts: [],
          inputs_values: [50000],
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
            quantity: 0,
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
            quantity_normalized: '0',
          },
          name: 'send',
        },
      };

      mockComposeTransaction.mockResolvedValue(apiResponse);

      await act(async () => {
        result.current.compose(formData, mockComposeTransaction);
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe('review');
      });

      // Revert to form
      act(() => {
        result.current.revertToForm();
      });

      expect(result.current.state.step).toBe('form');
      expect(result.current.state.apiResponse).toBeNull();
    });

    it('should set and clear errors', () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      // Set error
      act(() => {
        result.current.setError('Custom error message');
      });

      expect(result.current.state.error).toBe('Custom error message');

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.state.error).toBeNull();
    });
  });

  describe('Transitions', () => {
    it('should track pending state during compose', async () => {
      const { result } = renderHook(() => useComposer(), {
        wrapper: ({ children }) => (
          <ComposerProvider>{children}</ComposerProvider>
        ),
      });

      const formData = new FormData();
      const apiResponse: ApiResponse = {
        result: {
          rawtransaction: '0x123',
          btc_in: 50000,
          btc_out: 49000,
          btc_change: 0,
          btc_fee: 1000,
          data: '',
          lock_scripts: [],
          inputs_values: [50000],
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
            quantity: 0,
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
            quantity_normalized: '0',
          },
          name: 'send',
        },
      };

      // Add delay to mock async operation
      mockComposeTransaction.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(apiResponse), 100))
      );

      expect(result.current.isPending).toBe(false);

      act(() => {
        result.current.compose(formData, mockComposeTransaction);
      });

      // Should be pending during async operation
      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
        expect(result.current.state.step).toBe('review');
      });
    });
  });
});