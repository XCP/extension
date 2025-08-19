import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TimeoutIndicator } from '../timeout-indicator';

// Mock React Icons
vi.mock('react-icons/fi', () => ({
  FiClock: ({ className, ...props }: any) => <div data-testid="clock-icon" className={className} {...props} />,
  FiAlertCircle: ({ className, ...props }: any) => <div data-testid="alert-icon" className={className} {...props} />
}));

describe('TimeoutIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not render anything when timeout is far away', () => {
    const createdAt = Date.now() - 1000; // 1 second ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    const { container } = render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should show warning when less than 1 minute remaining', () => {
    const createdAt = Date.now() - (4.5 * 60 * 1000); // 4.5 minutes ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    expect(screen.getByText('Expires soon')).toBeInTheDocument();
  });

  it('should show expired state when timeout reached', async () => {
    const createdAt = Date.now() - (5 * 60 * 1000); // 5 minutes ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    // Fast-forward to trigger the interval
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
    expect(screen.getByText('Request expired')).toBeInTheDocument();
  });

  it('should call onTimeout callback when expired', () => {
    const onTimeoutMock = vi.fn();
    const createdAt = Date.now() - (5 * 60 * 1000); // 5 minutes ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
        onTimeout={onTimeoutMock}
      />
    );

    // Fast-forward to trigger the interval
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onTimeoutMock).toHaveBeenCalledTimes(1);
  });

  it('should update warning state as time progresses', () => {
    const createdAt = Date.now() - (3 * 60 * 1000); // 3 minutes ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    const { rerender } = render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    // Initially no warning (2 minutes remaining)
    expect(screen.queryByTestId('clock-icon')).not.toBeInTheDocument();

    // Advance time to less than 1 minute remaining
    act(() => {
      vi.advanceTimersByTime(70 * 1000); // 70 seconds
    });

    // Should now show warning
    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    expect(screen.getByText('Expires soon')).toBeInTheDocument();
  });

  it('should handle edge case of exactly 1 minute remaining', () => {
    const createdAt = Date.now() - (4 * 60 * 1000); // 4 minutes ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes (exactly 1 minute remaining)
    
    render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    // Should not show warning at exactly 1 minute (60000ms)
    expect(screen.queryByTestId('clock-icon')).not.toBeInTheDocument();

    // Advance by 1 second to go under 1 minute
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
  });

  it('should clean up interval on unmount', () => {
    const createdAt = Date.now();
    const timeoutMs = 5 * 60 * 1000;
    
    const { unmount } = render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    // Spy on clearInterval
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should not call onTimeout multiple times', () => {
    const onTimeoutMock = vi.fn();
    const createdAt = Date.now() - (6 * 60 * 1000); // 6 minutes ago (already expired)
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
        onTimeout={onTimeoutMock}
      />
    );

    // Advance time multiple times
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should only be called once
    expect(onTimeoutMock).toHaveBeenCalledTimes(1);
  });

  it('should handle very short timeouts', () => {
    const createdAt = Date.now() - 500; // 0.5 seconds ago
    const timeoutMs = 1000; // 1 second timeout
    
    render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    // Should show expires soon immediately (< 1 minute remaining)
    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    expect(screen.getByText('Expires soon')).toBeInTheDocument();

    // Advance to expiration
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
    expect(screen.getByText('Request expired')).toBeInTheDocument();
  });

  it('should apply correct CSS classes for different states', () => {
    const createdAt = Date.now() - (4.5 * 60 * 1000); // 4.5 minutes ago
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    
    const { container } = render(
      <TimeoutIndicator 
        createdAt={createdAt}
        timeoutMs={timeoutMs}
      />
    );

    // Should have warning classes (orange)
    const warningDiv = container.querySelector('.text-orange-600');
    expect(warningDiv).toBeInTheDocument();
    expect(warningDiv).toHaveClass('bg-orange-50');

    // Advance to expiration
    act(() => {
      vi.advanceTimersByTime(60 * 1000); // 1 minute
    });

    // Should now have error classes (red)
    const errorDiv = container.querySelector('.text-red-600');
    expect(errorDiv).toBeInTheDocument();
    expect(errorDiv).toHaveClass('bg-red-50');
  });
});