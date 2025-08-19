import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBlockHeight } from '../useBlockHeight';
import { getCurrentBlockHeight } from '@/utils/blockchain/bitcoin';

// Mock the block height fetching
vi.mock('@/utils/blockchain/bitcoin', () => ({
  getCurrentBlockHeight: vi.fn()
}));

describe('useBlockHeight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fetch block height on mount', async () => {
    const mockBlockHeight = 820000;
    (getCurrentBlockHeight as any).mockResolvedValue(mockBlockHeight);

    const { result } = renderHook(() => useBlockHeight());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.blockHeight).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getCurrentBlockHeight).toHaveBeenCalled();
    expect(result.current.blockHeight).toBe(820000);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Network error');
    (getCurrentBlockHeight as any).mockRejectedValue(error);

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.blockHeight).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('should auto-refresh block height when interval is set', async () => {
    let blockHeight = 820000;
    (getCurrentBlockHeight as any).mockImplementation(() => 
      Promise.resolve(blockHeight++)
    );

    // Use a shorter interval for testing
    const { result } = renderHook(() => useBlockHeight({ refreshInterval: 100 }));

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.blockHeight).toBe(820000);
    });

    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(1);

    // Wait for the interval to trigger (using real timers for simplicity)
    await waitFor(() => {
      expect(getCurrentBlockHeight).toHaveBeenCalledTimes(2);
    }, { timeout: 200 });

    // Check that the block height was updated
    await waitFor(() => {
      expect(result.current.blockHeight).toBe(820001);
    });
  });

  it('should provide manual refresh function', async () => {
    let blockHeight = 820000;
    (getCurrentBlockHeight as any).mockImplementation(() => 
      Promise.resolve(blockHeight++)
    );

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.blockHeight).toBe(820000);
    });

    // Manually refresh
    await result.current.refresh();

    await waitFor(() => {
      expect(result.current.blockHeight).toBe(820001);
    });

    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(2);
    expect(getCurrentBlockHeight).toHaveBeenLastCalledWith(true);
  }, 10000);

  it('should not fetch on mount when autoFetch is false', async () => {
    const { result } = renderHook(() => useBlockHeight({ autoFetch: false }));

    expect(result.current.loading).toBe(false);
    expect(result.current.blockHeight).toBeNull();
    expect(getCurrentBlockHeight).not.toHaveBeenCalled();
  });

  it('should handle block height of 0', async () => {
    (getCurrentBlockHeight as any).mockResolvedValue(0);

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.blockHeight).toBe(0);
    expect(result.current.error).toBeNull();
  }, 10000);

  it('should cleanup interval on unmount', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    
    const { unmount } = renderHook(() => useBlockHeight({ refreshInterval: 10000 }));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should handle rapid refresh calls', async () => {
    let blockHeight = 820000;
    (getCurrentBlockHeight as any).mockImplementation(() => 
      Promise.resolve(blockHeight++)
    );

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Rapid refresh calls
    result.current.refresh();
    result.current.refresh();
    result.current.refresh();

    // All refresh calls should work
    await waitFor(() => {
      expect(getCurrentBlockHeight).toHaveBeenCalledTimes(4); // Initial + 3 refreshes
    });
  });

  it('should handle error messages without Error object', async () => {
    (getCurrentBlockHeight as any).mockRejectedValue('String error');

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Unable to fetch current block height.');
  });

  it('should not set up interval when refreshInterval is null', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    
    renderHook(() => useBlockHeight({ refreshInterval: null }));

    expect(setIntervalSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should not set up interval when refreshInterval is 0', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    
    renderHook(() => useBlockHeight({ refreshInterval: 0 }));

    expect(setIntervalSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});