import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleTimer } from '../useIdleTimer';

// Mock timers
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useIdleTimer', () => {
  it('should trigger onIdle after timeout', () => {
    const onIdle = vi.fn();
    const timeout = 5000;

    renderHook(() =>
      useIdleTimer({
        timeout,
        onIdle,
        disabled: false,
      })
    );

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(timeout + 100);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on activity', () => {
    const onIdle = vi.fn();
    const timeout = 5000;

    renderHook(() =>
      useIdleTimer({
        timeout,
        onIdle,
        disabled: false,
      })
    );

    // Simulate activity halfway through
    act(() => {
      vi.advanceTimersByTime(timeout / 2);
      // Trigger mouse event
      window.dispatchEvent(new Event('mousemove'));
      vi.advanceTimersByTime(timeout / 2);
    });

    // Should not have triggered idle yet
    expect(onIdle).not.toHaveBeenCalled();

    // Now advance the full timeout again
    act(() => {
      vi.advanceTimersByTime(timeout + 100);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('should not trigger when disabled', () => {
    const onIdle = vi.fn();
    const timeout = 1000;

    renderHook(() =>
      useIdleTimer({
        timeout,
        onIdle,
        disabled: true,
      })
    );

    act(() => {
      vi.advanceTimersByTime(timeout + 100);
    });

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('should stop listening after idle when stopOnIdle is true', () => {
    const onIdle = vi.fn();
    const timeout = 1000;

    renderHook(() =>
      useIdleTimer({
        timeout,
        onIdle,
        disabled: false,
        stopOnIdle: true,
      })
    );

    // First idle trigger
    act(() => {
      vi.advanceTimersByTime(timeout + 100);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);

    // Try to trigger activity - should not reset timer due to stopOnIdle
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
      vi.advanceTimersByTime(timeout + 100);
    });

    // Should not trigger again because timer stopped after first idle
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('should call onActive when transitioning from idle to active', () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    const timeout = 1000;

    renderHook(() =>
      useIdleTimer({
        timeout,
        onIdle,
        onActive,
        disabled: false,
        stopOnIdle: false,
      })
    );

    // Go idle
    act(() => {
      vi.advanceTimersByTime(timeout + 100);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();

    // Become active again
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    expect(onActive).toHaveBeenCalledTimes(1);
  });

  // A burst of activity leaves a throttled trailing call pending. A hardware confirmation then
  // disables the timer; that trailing call must not start an idle timeout nothing clears.
  it('drops a throttled activity call pending when the timer is disabled', () => {
    const onIdle = vi.fn();
    const onAction = vi.fn();
    const { rerender } = renderHook(
      ({ disabled }) => useIdleTimer({ timeout: 1000, onIdle, onAction, disabled, eventsThrottle: 200 }),
      { initialProps: { disabled: false } },
    );

    act(() => {
      window.dispatchEvent(new Event('mousemove')); // runs at once
      vi.advanceTimersByTime(50);
      window.dispatchEvent(new Event('mousemove')); // trailing, due in 150ms
    });
    expect(onAction).toHaveBeenCalledTimes(1);

    rerender({ disabled: true });
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('drops a throttled activity call pending at unmount', () => {
    const onIdle = vi.fn();
    const onAction = vi.fn();
    const { unmount } = renderHook(() => useIdleTimer({ timeout: 1000, onIdle, onAction, eventsThrottle: 200 }));

    act(() => {
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(50);
      window.dispatchEvent(new Event('keydown'));
    });
    unmount();
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
