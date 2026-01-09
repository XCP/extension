import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAssetBalance } from '../useAssetBalance';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { fetchAssetDetailsAndBalance } from '../utils/fetchAssetData';

// Mock the blockchain utilities
vi.mock('@/utils/blockchain/bitcoin/balance', () => ({
  fetchBTCBalance: vi.fn()
}));

vi.mock('../utils/fetchAssetData', () => ({
  fetchAssetDetailsAndBalance: vi.fn()
}));

// Mock the contexts with proper default implementations
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123', label: 'Test Address' },
    activeWallet: { id: 'wallet-1', name: 'Test Wallet' }
  })
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    subheadings: { balances: {} },
    setBalanceHeader: vi.fn(),
    clearBalances: vi.fn()
  })
}));

describe('useAssetBalance', () => {
  const mockXCPAssetInfo = {
    asset: 'XCP',
    asset_longname: null,
    description: 'Counterparty',
    divisible: true,
    locked: false,
    supply: '2648755.95200000',
    supply_normalized: '2648755.95200000',
    issuer: '',
    fair_minting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch BTC balance successfully', async () => {
    vi.mocked(fetchBTCBalance).mockResolvedValue(100000000); // 1 BTC in satoshis

    const { result } = renderHook(() => useAssetBalance('BTC'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.balance).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchBTCBalance).toHaveBeenCalledWith('bc1qtest123');
    expect(result.current.balance).toBe('1');
    expect(result.current.isDivisible).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should fetch Counterparty asset balance successfully', async () => {
    vi.mocked(fetchAssetDetailsAndBalance).mockResolvedValue({
      availableBalance: '1000.50000000',
      isDivisible: true,
      assetInfo: mockXCPAssetInfo
    });

    const { result } = renderHook(() => useAssetBalance('XCP'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchAssetDetailsAndBalance).toHaveBeenCalledWith('XCP', 'bc1qtest123');
    expect(result.current.balance).toBe('1000.50000000');
    expect(result.current.isDivisible).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should handle empty asset name', () => {
    const { result } = renderHook(() => useAssetBalance(''));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balance).toBeNull();
    expect(result.current.isDivisible).toBe(true);
    expect(result.current.error).toBeNull();

    expect(fetchBTCBalance).not.toHaveBeenCalled();
    expect(fetchAssetDetailsAndBalance).not.toHaveBeenCalled();
  });

  it('should handle BTC fetch error', async () => {
    const error = new Error('Network error');
    vi.mocked(fetchBTCBalance).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetBalance('BTC'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balance).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('should handle Counterparty asset fetch error', async () => {
    const error = new Error('Asset not found');
    vi.mocked(fetchAssetDetailsAndBalance).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetBalance('INVALID'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.balance).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('should cleanup on unmount without errors', () => {
    const { unmount } = renderHook(() => useAssetBalance('XCP'));

    // Should cleanup without throwing
    expect(() => unmount()).not.toThrow();
  });
});