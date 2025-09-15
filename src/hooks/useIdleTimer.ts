import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseIdleTimerOptions {
  timeout: number;
  onIdle?: () => void;
  onActive?: () => void;
  onAction?: () => void;
  events?: string[];
  disabled?: boolean;
  stopOnIdle?: boolean;
  eventsThrottle?: number;
}

const DEFAULT_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
  'touchmove',
  'scroll',
  'resize',
];

// Throttle function similar to react-idle-timer
function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastExecTime = 0;

  return ((...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  }) as T;
}

export function useIdleTimer(options: UseIdleTimerOptions) {
  const {
    timeout,
    onIdle,
    onActive,
    onAction,
    events = DEFAULT_EVENTS,
    disabled = false,
    stopOnIdle = false,
    eventsThrottle = 200,
  } = options;

  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isIdleRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);
  const onActionRef = useRef(onAction);
  const eventsListenersRef = useRef<Array<() => void>>([]);

  // Update refs when callbacks change
  useEffect(() => {
    onIdleRef.current = onIdle;
    onActiveRef.current = onActive;
    onActionRef.current = onAction;
  }, [onIdle, onActive, onAction]);

  const reset = useCallback(() => {
    if (disabled || timeout <= 0) {
      console.log('[useIdleTimer] Reset called but disabled or invalid timeout:', { disabled, timeout });
      return;
    }

    console.log('[useIdleTimer] Resetting timer with timeout:', timeout);
    clearTimeout(timeoutRef.current);

    // Only call onActive when transitioning from idle to active
    if (isIdleRef.current) {
      console.log('[useIdleTimer] Transitioning from idle to active');
      isIdleRef.current = false;
      setIsIdle(false);
      onActiveRef.current?.();
    }

    timeoutRef.current = setTimeout(() => {
      console.log('[useIdleTimer] Timeout expired, setting idle state');
      isIdleRef.current = true;
      setIsIdle(true);
      onIdleRef.current?.();
    }, timeout);
  }, [timeout, disabled]);

  const handleActivity = useCallback((event?: Event) => {
    if (disabled) {
      console.log('[useIdleTimer] Activity ignored - disabled');
      return;
    }
    if (stopOnIdle && isIdleRef.current) {
      console.log('[useIdleTimer] Activity ignored - stopOnIdle and currently idle');
      return;
    }

    console.log('[useIdleTimer] Activity detected:', event?.type || 'unknown');

    // Call onAction for all activity (for tracking last active time)
    onActionRef.current?.();

    // Reset timer
    reset();
  }, [reset, disabled, stopOnIdle]);

  // Create throttled activity handler
  const throttledActivity = useRef(
    eventsThrottle > 0 ? throttle(handleActivity, eventsThrottle) : handleActivity
  );

  // Update throttled handler when eventsThrottle changes
  useEffect(() => {
    throttledActivity.current = eventsThrottle > 0 ? throttle(handleActivity, eventsThrottle) : handleActivity;
  }, [handleActivity, eventsThrottle]);

  // Single effect for managing the idle timer and event listeners
  useEffect(() => {
    console.log('[useIdleTimer] Effect running with:', { disabled, timeout, eventsCount: events.length });

    // Cleanup previous event listeners
    eventsListenersRef.current.forEach(cleanup => cleanup());
    eventsListenersRef.current = [];

    clearTimeout(timeoutRef.current);

    if (disabled) {
      console.log('[useIdleTimer] Timer disabled, cleaning up');
      // If disabled, reset state and don't set up timer or events
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
      }
      return;
    }

    console.log('[useIdleTimer] Starting timer and adding event listeners');
    // Start the timer
    reset();

    // Add event listeners with proper cleanup tracking
    events.forEach(event => {
      const handler = throttledActivity.current;
      window.addEventListener(event, handler, { passive: true });
      console.log('[useIdleTimer] Added listener for:', event);

      // Store cleanup function
      eventsListenersRef.current.push(() => {
        window.removeEventListener(event, handler);
      });
    });

    // Cleanup function
    return () => {
      console.log('[useIdleTimer] Cleaning up timer and event listeners');
      clearTimeout(timeoutRef.current);
      eventsListenersRef.current.forEach(cleanup => cleanup());
      eventsListenersRef.current = [];
    };
  }, [disabled, timeout, events, reset]);

  return {
    isIdle,
    reset,
  };
}