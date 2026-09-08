import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asBaseUnits } from '@/core/numeric';
import { configureLocale } from '@/i18n';
import { useSearchQuery } from "../useSearchQuery";

// Mock fetch
global.fetch = vi.fn();

describe("useSearchQuery", () => {
  beforeEach(() => {
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockReset();
  });

  afterEach(() => {
    configureLocale({});
    vi.useRealTimers();
  });

  it("should return empty results when no search query", () => {
    const { result } = renderHook(() => useSearchQuery());

    expect(result.current.searchQuery).toBe("");
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it("should search when query is set", async () => {
    const mockResults = {
      assets: [
        { symbol: "XCP", supply: asBaseUnits(2600000) },
        { symbol: "PEPECASH", supply: asBaseUnits(700000000) },
      ],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery("test");
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
      "https://api.xcp.io/v2/assets?query=test",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.current.searchResults).toEqual(mockResults.assets);
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it("should debounce search requests", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { result } = renderHook(() => useSearchQuery());

    // Make rapid changes
    act(() => {
      result.current.setSearchQuery("a");
    });
    act(() => {
      result.current.setSearchQuery("ab");
    });
    act(() => {
      result.current.setSearchQuery("abc");
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
      "https://api.xcp.io/v2/assets?query=abc",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it("should handle search error", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery("error");
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
    expect(result.current.error).toBe(
      "Failed to load search results: Network error",
    );
    expect(result.current.isSearching).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3); // Original request plus the two default retries.
  }, 10000);

  it("should handle non-ok response", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery("bad");
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
    expect(result.current.error).toBe("Search failed. Please try again.");
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it("should clear results when query is cleared", async () => {
    const mockResults = {
      assets: [{ symbol: "XCP", supply: asBaseUnits(2600000) }],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    });

    const { result } = renderHook(() => useSearchQuery());

    // Set query and wait for results
    act(() => {
      result.current.setSearchQuery("test");
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
      result.current.setSearchQuery("");
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBeNull();
  }, 10000);

  it("should cancel previous search when new query is set", async () => {
    let resolveFunctions: Array<(value: any) => void> = [];

    (global.fetch as any).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFunctions.push(resolve);
      });
    });

    const { result } = renderHook(() => useSearchQuery());

    // Start first search
    act(() => {
      result.current.setSearchQuery("first");
    });

    // Advance time to start the debounced search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Start second search before first completes
    act(() => {
      result.current.setSearchQuery("second");
    });

    // Advance time to start the second debounced search
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // At this point we should have 2 pending requests
    expect(resolveFunctions).toHaveLength(2);

    // Resolve the second search first (this should be the one that sets results)
    resolveFunctions[1]!({
      ok: true,
      json: async () => ({ assets: [{ symbol: "SECOND" }] }),
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Now resolve the first search (this should be ignored due to cancellation)
    resolveFunctions[0]!({
      ok: true,
      json: async () => ({ assets: [{ symbol: "FIRST" }] }),
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should only have results from second search
    expect(result.current.searchResults).toEqual([{ symbol: "SECOND" }]);
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it("should handle empty assets array in response", async () => {
    // Clear any previous mock implementations and set fresh one
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { result } = renderHook(() => useSearchQuery());

    // Ensure we start fresh
    expect(result.current.searchResults).toEqual([]);

    act(() => {
      result.current.setSearchQuery("empty");
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

  it("should report a malformed response instead of claiming there are no matches", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery("missing");
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toContain("Invalid search response");
  }, 10000);

  it("should encode search query properly", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { result } = renderHook(() => useSearchQuery());

    act(() => {
      result.current.setSearchQuery("test & special=chars");
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.xcp.io/v2/assets?query=test%20%26%20special%3Dchars",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.current.isSearching).toBe(false);
  }, 10000);

  it("should clear error when new search starts", async () => {
    const { result } = renderHook(() => useSearchQuery("", { maxRetries: 0 }));

    // Setup mock to fail first, then succeed
    let callCount = 0;
    (global.fetch as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ assets: [{ symbol: "TEST" }] }),
      });
    });

    // First search fails
    act(() => {
      result.current.setSearchQuery("error");
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Verify error is set
    expect(result.current.error).toContain("Failed to load search results");
    expect(result.current.isSearching).toBe(false);

    // Second search succeeds
    act(() => {
      result.current.setSearchQuery("success");
    });

    // A previous query's error must not appear under the new query during debounce.
    expect(result.current.error).toBeNull();
    expect(result.current.isSearching).toBe(true);

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

  it("reports pending throughout debounce and immediately hides the previous query's rows", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ assets: [{ symbol: "OLD" }] }) } as Response);
    const { result } = renderHook(() => useSearchQuery("OLD", { maxRetries: 0 }));
    expect.soft(result.current.isSearching).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.searchResults).toEqual([{ symbol: "OLD" }]);

    act(() => { result.current.setSearchQuery("NEW"); });
    expect(result.current.isSearching).toBe(true);
    expect(result.current.searchResults).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cancels retry backoff when the query is cleared without issuing another request", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useSearchQuery("OLD"));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => { result.current.setSearchQuery(""); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it.each(["fetch", "body"])("times out a never-settling %s and ignores its late result", async (stage) => {
    let finish!: (value: any) => void;
    const pending = new Promise<any>((resolve) => { finish = resolve; });
    vi.mocked(fetch).mockReturnValue(stage === "fetch" ? pending : Promise.resolve({ ok: true, json: () => pending } as Response));
    const { result } = renderHook(() => useSearchQuery("SLOW", { maxRetries: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect.soft(result.current.isSearching).toBe(false);
    expect.soft(result.current.error).toMatch(/timed out/i);
    expect.soft(signal.aborted).toBe(true);
    await act(async () => {
      finish(stage === "fetch" ? { ok: true, json: async () => ({ assets: [{ symbol: "LATE" }] }) } : { assets: [{ symbol: "LATE" }] });
      await pending;
    });
    expect(result.current.searchResults).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries the current failed query and ignores retry while pending or after clearing", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: [{ asset: "XCP", supply_normalized: "2.6" }] }) } as Response);
    const { result } = renderHook(() => useSearchQuery("XCP", { maxRetries: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.error).toContain("Offline");
    act(() => { result.current.retry(); });
    expect(result.current.isSearching).toBe(true);
    expect(result.current.error).toBeNull();
    act(() => { result.current.retry(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.searchResults).toEqual([{ symbol: "XCP", supply: "2.6" }]);
    act(() => { result.current.setSearchQuery(""); });
    act(() => { result.current.retry(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats revisiting a previous query as pending instead of reusing stale completed state", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ assets: [{ symbol: "OLD" }] }) } as Response);
    const { result } = renderHook(() => useSearchQuery("OLD"));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    act(() => { result.current.setSearchQuery("NEW"); });
    act(() => { result.current.setSearchQuery("OLD"); });
    expect(result.current.isSearching).toBe(true);
    expect(result.current.searchResults).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts retry backoff on unmount", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    const { unmount } = renderHook(() => useSearchQuery("OLD"));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves custom endpoint and retry timing options with a fresh timeout signal per attempt", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ assets: [{ symbol: "CUSTOM", supply: "12" }] }) } as Response);
    const { result } = renderHook(() => useSearchQuery("CUSTOM", {
      apiEndpoint: "https://example.test/assets", debounceMs: 25, maxRetries: 1, retryDelayMs: 10, requestTimeoutMs: 50,
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(25); });
    const firstSignal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(firstSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.isSearching).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith("https://example.test/assets?query=CUSTOM", expect.anything());
    const secondSignal = vi.mocked(fetch).mock.calls[1]![1]!.signal!;
    expect(secondSignal).not.toBe(firstSignal);
    expect(secondSignal.aborted).toBe(false);
    expect(result.current.searchResults).toEqual([{ symbol: "CUSTOM", supply: "12" }]);
    expect(result.current.isSearching).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["seconds", "date"])("respects Retry-After %s and surfaces rate limiting after the configured retry", async (format) => {
    vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
    const headers = new Headers({ "Retry-After": format === "seconds" ? "5" : new Date(Date.now() + 5_500).toUTCString() });
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429, headers } as Response);
    const { result } = renderHook(() => useSearchQuery("RATE", { maxRetries: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    // HTTP dates are rounded to whole seconds, leaving 4.5 seconds after debounce.
    const delay = format === "seconds" ? 5_000 : 4_500;
    await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.isSearching).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBe("Search is temporarily rate limited. Please try again.");
  });

  it("surfaces long rate-limit windows without retrying early or keeping search pending", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429, headers: new Headers({ "Retry-After": "120" }) } as Response);
    const { result } = renderHook(() => useSearchQuery("RATE"));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toMatch(/rate limited/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['rate_limit', 'http', 'timeout', 'invalid_response', 'other'] as const)(
    'retranslates a retained %s without changing query, request, retry or raw evidence', async kind => {
      const detail = 'Node says ASSET.child / 123456789';
      if (kind === 'rate_limit' || kind === 'http') vi.mocked(fetch).mockResolvedValue({ ok: false, status: kind === 'rate_limit' ? 429 : 503, headers: new Headers() } as Response);
      else if (kind === 'timeout') vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}));
      else if (kind === 'invalid_response') vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) } as Response);
      else vi.mocked(fetch).mockRejectedValue(new Error(detail));
      const { result } = renderHook(() => useSearchQuery('PARENT.child', { debounceMs: 10, requestTimeoutMs: 20, maxRetries: 0 }));
      await act(async () => { await vi.advanceTimersByTimeAsync(30); });
      const english = result.current.error;
      expect(english).toBeTruthy();
      for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
        act(() => configureLocale({ language, numberLocale: 'de-DE' }));
        expect(result.current.error).not.toBe(english);
        expect(result.current.error).toMatch(/[\u3000-\u9fff]/);
        if (kind === 'other') expect(result.current.error).toContain(detail);
        expect(result.current.searchQuery).toBe('PARENT.child');
        expect(result.current.isSearching).toBe(false);
        expect(result.current.searchResults).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('https://api.xcp.io/v2/assets?query=PARENT.child', expect.anything());
      }
      act(() => result.current.setError('Caller diagnostic: ' + detail));
      act(() => configureLocale({ language: 'en' }));
      expect(result.current.error).toBe('Caller diagnostic: ' + detail);
      act(() => result.current.setError(null));
      expect(result.current.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
