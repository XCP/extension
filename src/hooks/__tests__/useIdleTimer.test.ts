import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
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
});