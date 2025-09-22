import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFeeRates } from '../useFeeRates';
import { getFeeRates } from '@/utils/blockchain/bitcoin/feeRate';

// Mock the fee rate fetching
vi.mock('@/utils/blockchain/bitcoin/feeRate', () => ({
  getFeeRates: vi.fn()
}));

describe('useFeeRates', () => {
  const mockFeeRates = {
    fastestFee: 50,
    halfHourFee: 30,
    hourFee: 20,
    economyFee: 10,
    minimumFee: 1
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getFeeRates as any).mockResolvedValue(mockFeeRates);
  });

  it('should fetch fee rates on mount', async () => {
    const { result } = renderHook(() => useFeeRates());

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.feeRates).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getFeeRates).toHaveBeenCalled();
    expect(result.current.feeRates).toEqual(mockFeeRates);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Network error');
    (getFeeRates as any).mockRejectedValue(error);

    const { result } = renderHook(() => useFeeRates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.feeRates).toBeNull();
    expect(result.current.error).toBe('Unable to fetch fee rates.');
  });

  it('should provide unique preset options', async () => {
    const { result } = renderHook(() => useFeeRates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.uniquePresetOptions).toHaveLength(3);
    expect(result.current.uniquePresetOptions[0]).toEqual({
      id: 'fast',
      name: 'Fastest',
      value: 50
    });
    expect(result.current.uniquePresetOptions[1]).toEqual({
      id: 'medium',
      name: '30 Min',
      value: 30
    });
    expect(result.current.uniquePresetOptions[2]).toEqual({
      id: 'slow',
      name: '1 Hour',
      value: 20
    });
  });

  it('should handle deduplicated preset options', async () => {
    const duplicateRates = {
      fastestFee: 30,  // Same as halfHourFee
      halfHourFee: 30,
      hourFee: 20,
      economyFee: 10,
      minimumFee: 1
    };
    (getFeeRates as any).mockResolvedValue(duplicateRates);

    const { result } = renderHook(() => useFeeRates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should only have 2 unique values (30 and 20)
    expect(result.current.uniquePresetOptions).toHaveLength(2);
  });

  it('should handle autoFetch false', async () => {
    const { result } = renderHook(() => useFeeRates(false));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.feeRates).toBeNull();
    expect(getFeeRates).not.toHaveBeenCalled();
  });
});