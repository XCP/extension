import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_REPORT_INTERVAL_MS, createActivityReporter, useIdleTimer } from '../useIdleTimer';

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

describe('createActivityReporter', () => {
  it('reports the first activity at once', () => {
    const report = vi.fn();
    const reporter = createActivityReporter(report);
    reporter.activity();
    expect(report).toHaveBeenCalledExactlyOnceWith(Date.now());
    reporter.dispose();
  });

  it('sends at most one report per interval however busy the user is', () => {
    const report = vi.fn();
    const reporter = createActivityReporter(report);
    // Five a second for two minutes: what the 200ms-throttled idle timer used to send.
    for (let i = 0; i < 600; i++) {
      reporter.activity();
      vi.advanceTimersByTime(200);
    }
    expect(report.mock.calls.length).toBeLessThanOrEqual(120_000 / ACTIVITY_REPORT_INTERVAL_MS + 1);
    expect(report.mock.calls.length).toBeGreaterThanOrEqual(120_000 / ACTIVITY_REPORT_INTERVAL_MS);
    reporter.dispose();
  });

  it('reports the time of the last activity, not the time of the report', () => {
    const report = vi.fn();
    const reporter = createActivityReporter(report);
    reporter.activity();
    vi.advanceTimersByTime(5_000);
    const lastActivity = Date.now();
    reporter.activity();
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS);
    expect(report).toHaveBeenLastCalledWith(lastActivity);
    reporter.dispose();
  });

  it('reports batched activity no later than one interval after the last report', () => {
    // The background deadline is at least a minute after the last reported activity, so the
    // batched report must land well inside it.
    const report = vi.fn();
    const reporter = createActivityReporter(report);
    reporter.activity();
    const first = Date.now();
    vi.advanceTimersByTime(1);
    reporter.activity();
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS - 2);
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(report).toHaveBeenCalledTimes(2);
    expect(Date.now() - first).toBeLessThanOrEqual(ACTIVITY_REPORT_INTERVAL_MS);
    reporter.dispose();
  });

  it('flushes batched activity when asked (popup closing), and only once', () => {
    const report = vi.fn();
    const reporter = createActivityReporter(report);
    reporter.activity();
    vi.advanceTimersByTime(1_000);
    const lastActivity = Date.now();
    reporter.activity();
    reporter.flush();
    reporter.flush();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith(lastActivity);
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('drops batched activity on dispose', () => {
    const report = vi.fn();
    const reporter = createActivityReporter(report);
    reporter.activity();
    reporter.activity();
    reporter.dispose();
    vi.advanceTimersByTime(ACTIVITY_REPORT_INTERVAL_MS);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
