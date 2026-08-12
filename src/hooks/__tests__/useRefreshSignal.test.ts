import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRefreshSignal } from '../useRefreshSignal';

describe('useRefreshSignal', () => {
  // The lists already load when they mount. Treating the counter's initial value as a request
  // would load everything twice on every visit to the home screen.
  it('does not fire on the first render', () => {
    const onRefresh = vi.fn();
    renderHook(() => useRefreshSignal(0, onRefresh));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('fires when the nonce changes', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(({ nonce }) => useRefreshSignal(nonce, onRefresh), {
      initialProps: { nonce: 0 },
    });

    rerender({ nonce: 1 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // Pressing refresh twice must be two refreshes; this is the reason the signal is a counter
  // rather than a boolean.
  it('fires again for each further change', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(({ nonce }) => useRefreshSignal(nonce, onRefresh), {
      initialProps: { nonce: 0 },
    });

    rerender({ nonce: 1 });
    rerender({ nonce: 2 });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not fire when the parent re-renders without a new nonce', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(({ nonce }) => useRefreshSignal(nonce, onRefresh), {
      initialProps: { nonce: 3 },
    });

    rerender({ nonce: 3 });
    rerender({ nonce: 3 });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // Callers pass an inline arrow, so the callback is a different function every render. Depending
  // on it would re-run the effect constantly — for a callback that reloads a list, endlessly.
  it('uses the latest callback without re-firing when only the callback changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ nonce, cb }) => useRefreshSignal(nonce, cb),
      { initialProps: { nonce: 0, cb: first } }
    );

    rerender({ nonce: 0, cb: second });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    rerender({ nonce: 1, cb: second });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // A list the caller never refreshes passes undefined; it must simply never fire.
  it('never fires when no nonce is supplied', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(() => useRefreshSignal(undefined, onRefresh));

    rerender();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
