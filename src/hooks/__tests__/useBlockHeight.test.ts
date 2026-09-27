import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { useBlockHeight } from '../useBlockHeight';

// Mock the block height fetching
vi.mock('@/core/bitcoin/blockHeight', () => ({
  getCurrentBlockHeight: vi.fn()
}));

describe('useBlockHeight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Spies first: restoring a spy on a faked timer after useRealTimers would reinstall the fake.
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should fetch block height on mount', async () => {
    const mockBlockHeight = 820000;
    (getCurrentBlockHeight as any).mockResolvedValue(mockBlockHeight);

    const { result } = renderHook(() => useBlockHeight());

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.blockHeight).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getCurrentBlockHeight).toHaveBeenCalled();
    expect(result.current.blockHeight).toBe(820000);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error with generic message', async () => {
    const error = new Error('Network error');
    (getCurrentBlockHeight as any).mockRejectedValue(error);

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.blockHeight).toBeNull();
    // Error should be generic to prevent leaking internal details
    expect(result.current.error).toBe('Unable to fetch current block height.');
  });

  it('refreshes on the interval without tearing the interval down each tick', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    let blockHeight = 820000;
    (getCurrentBlockHeight as any).mockImplementation(() => Promise.resolve(blockHeight++));

    const { result, unmount } = renderHook(() => useBlockHeight({ refreshInterval: 100 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.blockHeight).toBe(820000);

    for (let tick = 1; tick <= 3; tick++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(result.current.blockHeight).toBe(820000 + tick);
    }

    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(4);
    expect(getCurrentBlockHeight).toHaveBeenLastCalledWith(true);
    // One interval for the life of the hook, not one per height change.
    expect(setIntervalSpy.mock.calls.filter(([, ms]) => ms === 100)).toHaveLength(1);
    unmount();
  });

  // The popup renders under StrictMode, which mounts, unmounts and remounts every component once.
  describe('under StrictMode', () => {
    // renderHook's own option: a <StrictMode> wrapper does not double-invoke the hook's effects.
    const strict = { reactStrictMode: true };

    it('loads the height on mount', async () => {
      (getCurrentBlockHeight as any).mockResolvedValue(820000);

      const { result } = renderHook(() => useBlockHeight(), strict);

      await waitFor(() => expect(result.current.blockHeight).toBe(820000));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('reports a failed mount fetch instead of loading forever', async () => {
      (getCurrentBlockHeight as any).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useBlockHeight(), strict);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe('Unable to fetch current block height.');
    });

    it('settles a manual refresh', async () => {
      (getCurrentBlockHeight as any).mockResolvedValue(820000);
      const { result } = renderHook(() => useBlockHeight({ autoFetch: false }), strict);

      let returned: number | null = null;
      await act(async () => { returned = await result.current.refresh(); });

      expect(returned).toBe(820000);
      expect(result.current.blockHeight).toBe(820000);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('drops a response that arrives after unmount', async () => {
    let resolve: (height: number) => void = () => {};
    (getCurrentBlockHeight as any).mockImplementation(() => new Promise<number>((r) => { resolve = r; }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useBlockHeight());
    unmount();
    await act(async () => { resolve(820000); });

    expect(result.current.blockHeight).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
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

    expect(result.current.isLoading).toBe(false);
    expect(result.current.blockHeight).toBeNull();
    expect(getCurrentBlockHeight).not.toHaveBeenCalled();
  });

  it('should handle block height of 0', async () => {
    (getCurrentBlockHeight as any).mockResolvedValue(0);

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
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
      expect(result.current.isLoading).toBe(false);
    });

    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(1); // Initial call

    // The hook prevents overlapping requests with isFetchingRef guard
    // So rapid calls while one is in progress will be ignored
    // We need to wait for each to complete
    await act(async () => {
      await result.current.refresh();
    });
    
    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.refresh();
    });
    
    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(3);

    await act(async () => {
      await result.current.refresh();
    });

    expect(getCurrentBlockHeight).toHaveBeenCalledTimes(4);
  });

  it('should handle error messages without Error object', async () => {
    (getCurrentBlockHeight as any).mockRejectedValue('String error');

    const { result } = renderHook(() => useBlockHeight());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
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