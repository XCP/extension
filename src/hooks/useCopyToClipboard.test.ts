import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from './useCopyToClipboard';

vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));

describe('clipboard copying through the supported browser API', () => {
  const writeText = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports a successful copy and retains the existing timed cleanup', async () => {
    const { result, unmount } = renderHook(() => useCopyToClipboard());
    await act(async () => { expect(await result.current.copy('public test text')).toBe(true); });
    expect(writeText).toHaveBeenCalledWith('public test text');
    expect(result.current.isCopied('public test text')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(writeText).toHaveBeenLastCalledWith('');
    unmount();
  });

  it('reports denied writes as failure without claiming a copy', async () => {
    writeText.mockRejectedValueOnce(new Error('Denied'));
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { expect(await result.current.copy('public test text')).toBe(false); });
    expect(result.current.copiedText).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails safely when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { expect(await result.current.copy('public test text')).toBe(false); });
    expect(result.current.copiedText).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });
});
