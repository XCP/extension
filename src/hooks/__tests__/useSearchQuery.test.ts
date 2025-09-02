import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearchQuery } from '../useSearchQuery';

// Mock fetch
global.fetch = vi.fn();

describe('useSearchQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return empty results when no search query', () => {
    const { result } = renderHook(() => useSearchQuery());

    expect(result.current.searchQuery).toBe('');
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('should return initial query', () => {
    const { result } = renderHook(() => useSearchQuery('bitcoin'));

    expect(result.current.searchQuery).toBe('bitcoin');
  });

  it('should search when query is set', async () => {
    const mockResults = {
      assets: [
        { symbol: 'XCP', supply: 2600000 },
        { symbol: 'PEPECASH', supply: 700000000 }
      ]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResults
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery('test');
    });

    // Advance timers to trigger the debounced search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Run all pending timers and promises
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://app.xcp.io/api/v1/simple-search?query=test',
      expect.objectContaining({
        headers: { 'Accept': 'application/json' },
        signal: expect.any(AbortSignal)
      })
    );
    expect(result.current.searchResults).toEqual(mockResults.assets);
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should debounce search requests', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [] })
    });

    const { result } = renderHook(() => useSearchQuery());

    // Make rapid changes
    act(() => {
      result.current.setSearchQuery('a');
    });
    act(() => {
      result.current.setSearchQuery('ab');
    });
    act(() => {
      result.current.setSearchQuery('abc');
    });

    // Advance timers to trigger debounced search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Run all pending promises
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should only call once with final value
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://app.xcp.io/api/v1/simple-search?query=abc',
      expect.objectContaining({
        headers: { 'Accept': 'application/json' },
        signal: expect.any(AbortSignal)
      })
    );
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should handle search error', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery('error');
    });

    // Advance timers to trigger search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Run all pending promises
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.error).toBe('Failed to load search results: Network error');
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should handle non-ok response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery('bad');
    });

    // Advance timers to trigger search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Run all pending promises
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.error).toBe('Search failed. Please try again.');
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should clear results when query is cleared', async () => {
    const mockResults = {
      assets: [{ symbol: 'XCP', supply: 2600000 }]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResults
    });

    const { result } = renderHook(() => useSearchQuery());

    // Set query and wait for results
    act(() => {
      result.current.setSearchQuery('test');
    });

    // Advance timers and run promises
    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.searchResults).toHaveLength(1);

    // Clear query
    act(() => {
      result.current.setSearchQuery('');
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should cancel previous search when new query is set', async () => {
    let resolveFunctions: Array<(value: any) => void> = [];
    
    (global.fetch as any).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFunctions.push(resolve);
      });
    });

    const { result } = renderHook(() => useSearchQuery());

    // Start first search
    act(() => {
      result.current.setSearchQuery('first');
    });

    // Advance time to start the debounced search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Start second search before first completes
    act(() => {
      result.current.setSearchQuery('second');
    });

    // Advance time to start the second debounced search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // At this point we should have 2 pending requests
    expect(resolveFunctions).toHaveLength(2);

    // Resolve the second search first (this should be the one that sets results)
    resolveFunctions[1]({
      ok: true,
      json: async () => ({ assets: [{ symbol: 'SECOND' }] })
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Now resolve the first search (this should be ignored due to cancellation)
    resolveFunctions[0]({
      ok: true,
      json: async () => ({ assets: [{ symbol: 'FIRST' }] })
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should only have results from second search
    expect(result.current.searchResults).toEqual([{ symbol: 'SECOND' }]);
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should handle empty assets array in response', async () => {
    // Clear any previous mock implementations and set fresh one
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [] })
    });

    const { result } = renderHook(() => useSearchQuery());

    // Ensure we start fresh
    expect(result.current.searchResults).toEqual([]);

    act(() => {
      result.current.setSearchQuery('empty');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should handle missing assets field in response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery('missing');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should encode search query properly', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [] })
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery('test & special=chars');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://app.xcp.io/api/v1/simple-search?query=test%20%26%20special%3Dchars',
      expect.objectContaining({
        headers: { 'Accept': 'application/json' },
        signal: expect.any(AbortSignal)
      })
    );
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it('should clear error when new search starts', async () => {
    const { result } = renderHook(() => useSearchQuery('', { maxRetries: 0 }));

    // Setup mock to fail first, then succeed
    let callCount = 0;
    (global.fetch as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ assets: [{ symbol: 'TEST' }] })
      });
    });

    // First search fails
    act(() => {
      result.current.setSearchQuery('error');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Verify error is set
    expect(result.current.error).toContain('Failed to load search results');
    expect(result.current.isSearching).toBe(false);

    // Second search succeeds
    act(() => {
      result.current.setSearchQuery('success');
    });

    // Error should still be present before debounce timeout
    expect(result.current.error).toContain('Failed to load search results');

    // Advance time to trigger second search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Error should be cleared when new search starts
    expect(result.current.error).toBeNull();
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Verify successful search
    expect(result.current.error).toBeNull();
    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.isSearching).toBe(false);
  });

  it('should allow setting error manually', () => {
    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setError('Custom error message');
    });

    expect(result.current.error).toBe('Custom error message');
  });
});