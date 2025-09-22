import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAssetUtxos } from '../useAssetUtxos';
import { fetchTokenUtxos } from '@/utils/blockchain/counterparty/api';

// Mock the blockchain utilities
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchTokenUtxos: vi.fn()
}));

// Mock the wallet context
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeAddress: { address: 'bc1qtest123', label: 'Test Address' }
  })
}));

describe('useAssetUtxos', () => {
  const mockUtxosResponse = [
    {
      asset: 'XCP',
      utxo: 'txid1:0',
      quantity_normalized: '100.50000000'
    },
    {
      asset: 'XCP',
      utxo: 'txid2:1',
      quantity_normalized: '250.25000000'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array for BTC without making API call', () => {
    const { result } = renderHook(() => useAssetUtxos('BTC'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.utxos).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fetchTokenUtxos).not.toHaveBeenCalled();
  });

  it('should fetch UTXOs for Counterparty asset successfully', async () => {
    vi.mocked(fetchTokenUtxos).mockResolvedValue(mockUtxosResponse);

    const { result } = renderHook(() => useAssetUtxos('XCP'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.utxos).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchTokenUtxos).toHaveBeenCalledWith('bc1qtest123', 'XCP');
    expect(result.current.utxos).toEqual([
      { txid: 'txid1:0', amount: '100.50000000' },
      { txid: 'txid2:1', amount: '250.25000000' }
    ]);
    expect(result.current.error).toBeNull();
  });

  it('should handle empty UTXOs response', async () => {
    vi.mocked(fetchTokenUtxos).mockResolvedValue([]);

    const { result } = renderHook(() => useAssetUtxos('XCP'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.utxos).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error gracefully', async () => {
    const error = new Error('Network error');
    vi.mocked(fetchTokenUtxos).mockRejectedValue(error);

    const { result } = renderHook(() => useAssetUtxos('XCP'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.utxos).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('should handle empty asset name', () => {
    const { result } = renderHook(() => useAssetUtxos(''));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.utxos).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchTokenUtxos).not.toHaveBeenCalled();
  });

  it('should cleanup on unmount without errors', () => {
    const { unmount } = renderHook(() => useAssetUtxos('XCP'));

    // Should cleanup without throwing
    expect(() => unmount()).not.toThrow();
  });
});