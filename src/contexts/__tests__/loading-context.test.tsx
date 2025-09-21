import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { LoadingProvider, useLoading } from '../loading-context';
import { Spinner } from '../../components/spinner';

describe('LoadingContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock requestAnimationFrame to work with fake timers
    global.requestAnimationFrame = vi.fn((cb) => {
      return setTimeout(cb, 16) as any; // ~60fps
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // Reset requestAnimationFrame
    global.requestAnimationFrame = undefined as any;
  });

  describe('LoadingProvider', () => {
    it('should provide loading context to children', () => {
      const TestComponent = () => {
        const { isLoading } = useLoading();
        return <div>Loading: {isLoading.toString()}</div>;
      };

      render(
        <LoadingProvider>
          <TestComponent />
        </LoadingProvider>
      );

      expect(screen.getByText('Loading: false')).toBeInTheDocument();
    });

    it('should throw error when useLoading is used outside provider', () => {
      const TestComponent = () => {
        useLoading();
        return null;
      };

      // Suppress console.error for this test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => render(<TestComponent />)).toThrow(
        'useLoading must be used within a LoadingProvider'
      );
      
      spy.mockRestore();
    });

    it('should disable scroll when loading and disableScroll is true', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: ({ children }) => (
          <LoadingProvider disableScroll={true}>{children}</LoadingProvider>
        ),
      });

      let loadingId: string;
      act(() => {
        loadingId = result.current.showLoading('Test loading');
      });

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });
      
      expect(document.body.style.overflow).toBe('hidden');

      act(() => {
        result.current.hideLoading(loadingId!);
      });
      
      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });
      
      expect(document.body.style.overflow).toBe('');
    });

    it('should not disable scroll when disableScroll is false', () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: ({ children }) => (
          <LoadingProvider disableScroll={false}>{children}</LoadingProvider>
        ),
      });

      act(() => {
        result.current.showLoading('Test loading');
      });

      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });

  describe('showLoading', () => {
    it('should show loading with message', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      let loadingId: string;
      act(() => {
        loadingId = result.current.showLoading('Processing...');
      });

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });
      
      expect(result.current.isLoading).toBe(true);
      expect(result.current.currentMessage).toBe('Processing...');
      expect(loadingId!).toBeTruthy();
    });

    it('should show loading without message', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      act(() => {
        result.current.showLoading();
      });

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });
      
      expect(result.current.isLoading).toBe(true);
      // Default message when no message is provided
      expect(result.current.currentMessage).toBe('Loading...');
    });

    it('should handle multiple concurrent loading states', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      let id1: string, id2: string;
      act(() => {
        id1 = result.current.showLoading('Loading 1');
        id2 = result.current.showLoading('Loading 2');
      });

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.currentMessage).toBe('Loading 1'); // Shows first message

      act(() => {
        result.current.hideLoading(id2);
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.currentMessage).toBe('Loading 1'); // Falls back to first

      act(() => {
        result.current.hideLoading(id1);
      });

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.currentMessage).toBeUndefined();
    });

    it('should auto-hide loading after timeout', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      const onError = vi.fn();

      act(() => {
        result.current.showLoading('Long operation', { onError });
      });

      // Advance requestAnimationFrame timer for initial state update
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(true);

      // Fast-forward time by 30 seconds to trigger auto-hide
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Advance requestAnimationFrame timer for the hide operation
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should generate unique IDs for each loading instance', () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      const ids = new Set<string>();
      
      act(() => {
        for (let i = 0; i < 5; i++) {
          ids.add(result.current.showLoading(`Loading ${i}`));
        }
      });

      expect(ids.size).toBe(5); // All IDs should be unique
    });
  });

  describe('hideLoading', () => {
    it('should hide specific loading state', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      let loadingId: string;
      act(() => {
        loadingId = result.current.showLoading('Test');
      });

      // Advance requestAnimationFrame timer for initial state update
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.hideLoading(loadingId);
      });

      // Advance requestAnimationFrame timer for hide operation
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should clear timeout when hiding loading', () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      const onError = vi.fn();
      let loadingId: string;
      
      act(() => {
        loadingId = result.current.showLoading('Test', { onError });
      });

      act(() => {
        result.current.hideLoading(loadingId);
      });

      // Fast-forward time - timeout should not trigger
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(onError).not.toHaveBeenCalled();
    });

    it('should handle hiding non-existent loading ID gracefully', () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      expect(() => {
        act(() => {
          result.current.hideLoading('non-existent-id');
        });
      }).not.toThrow();
    });

    it('should maintain other loading states when hiding one', async () => {
      const { result } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      let id2: string;
      act(() => {
        result.current.showLoading('Loading 1');
        id2 = result.current.showLoading('Loading 2');
        result.current.showLoading('Loading 3');
      });

      // Advance requestAnimationFrame timer for initial state update
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.currentMessage).toBe('Loading 1'); // First message

      act(() => {
        result.current.hideLoading(id2);
      });

      // Advance requestAnimationFrame timer for hide operation
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.currentMessage).toBe('Loading 1'); // First remaining message
    });
  });

  describe('Loading UI', () => {
    it('should render loading spinner when loading', async () => {
      const TestComponent = () => {
        const { showLoading, isLoading, currentMessage } = useLoading();
        React.useEffect(() => {
          showLoading('Testing');
        }, [showLoading]);
        return (
          <div>
            <div>Content</div>
            {isLoading && <Spinner message={currentMessage} />}
          </div>
        );
      };

      render(
        <LoadingProvider>
          <TestComponent />
        </LoadingProvider>
      );

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });

      // Look for spinner element - it's an SVG with animate-spin class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show loading message in UI', async () => {
      const TestComponent = () => {
        const { showLoading, isLoading, currentMessage } = useLoading();
        React.useEffect(() => {
          showLoading('Processing transaction...');
        }, [showLoading]);
        return isLoading ? <Spinner message={currentMessage} /> : null;
      };

      render(
        <LoadingProvider>
          <div>Content</div>
          <TestComponent />
        </LoadingProvider>
      );

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });

      // Look for loading message - spinner shows currentMessage from context
      expect(screen.getByText('Processing transaction...')).toBeInTheDocument();
    });
  });

  describe('Cleanup', () => {
    it('should clean up all timeouts on unmount', () => {
      const { result, unmount } = renderHook(() => useLoading(), {
        wrapper: LoadingProvider,
      });

      const onError = vi.fn();
      
      act(() => {
        result.current.showLoading('Test 1', { onError });
        result.current.showLoading('Test 2', { onError });
        result.current.showLoading('Test 3', { onError });
      });

      unmount();

      // Fast-forward time - no timeouts should trigger
      act(() => {
        vi.advanceTimersByTime(60000);
      });

      expect(onError).not.toHaveBeenCalled();
    });

    it('should restore body overflow on unmount', async () => {
      const { result, unmount } = renderHook(() => useLoading(), {
        wrapper: ({ children }) => (
          <LoadingProvider disableScroll={true}>{children}</LoadingProvider>
        ),
      });

      act(() => {
        result.current.showLoading('Test');
      });

      // Advance timers to trigger requestAnimationFrame
      act(() => {
        vi.advanceTimersByTime(16);
      });

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('');
    });
  });
});