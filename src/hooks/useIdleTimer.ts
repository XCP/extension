import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

type Throttled<A extends unknown[]> = ((...args: A) => void) & { cancel: () => void };

/**
 * Throttle function similar to react-idle-timer's: at most one call per `delay`, with a trailing
 * call for activity inside the window. `cancel` drops a pending trailing call, which would
 * otherwise run after its listener is gone.
 */
function throttle<A extends unknown[]>(func: (...args: A) => void, delay: number): Throttled<A> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastExecTime = 0;

  const throttled = (...args: A) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        func(...args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
  throttled.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = undefined;
  };
  return throttled;
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
      return;
    }

    clearTimeout(timeoutRef.current);

    // Only call onActive when transitioning from idle to active
    if (isIdleRef.current) {
      isIdleRef.current = false;
      setIsIdle(false);
      onActiveRef.current?.();
    }

    timeoutRef.current = setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
      onIdleRef.current?.();
    }, timeout);
  }, [timeout, disabled]);

  const handleActivity = useCallback(() => {
    if (disabled) {
      return;
    }
    if (stopOnIdle && isIdleRef.current) {
      return;
    }

    // Call onAction for all activity (for tracking last active time)
    onActionRef.current?.();

    // Reset timer
    reset();
  }, [reset, disabled, stopOnIdle]);

  // Listeners call whatever handler is current, so a call that lands after `disabled` flips (a
  // hardware operation starting) sees the new value rather than a closure from before it. Updated
  // in a layout effect so no timer can run between the render and the update.
  const handleActivityRef = useRef(handleActivity);
  useLayoutEffect(() => {
    handleActivityRef.current = handleActivity;
  }, [handleActivity]);

  // Single effect for managing the idle timer and event listeners
  useEffect(() => {

    // Cleanup previous event listeners
    eventsListenersRef.current.forEach(cleanup => { cleanup(); });
    eventsListenersRef.current = [];

    clearTimeout(timeoutRef.current);

    if (disabled) {
      // If disabled, reset state and don't set up timer or events
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
      }
      return;
    }

    // Start the timer
    reset();

    // Add event listeners with proper cleanup tracking. The throttle is this effect's own, so its
    // pending trailing call is cancelled with the listeners: left to run, it would start an idle
    // timeout that nothing clears, and lock the wallet in the middle of a device confirmation.
    const activity = () => { handleActivityRef.current(); };
    const handler: Throttled<[]> = eventsThrottle > 0
      ? throttle(activity, eventsThrottle)
      : Object.assign(activity, { cancel: () => {} });
    eventsListenersRef.current.push(() => { handler.cancel(); });
    events.forEach(event => {
      window.addEventListener(event, handler, { passive: true });

      // Store cleanup function
      eventsListenersRef.current.push(() => {
        window.removeEventListener(event, handler);
      });
    });

    // Cleanup function
    return () => {
      clearTimeout(timeoutRef.current);
      eventsListenersRef.current.forEach(cleanup => { cleanup(); });
      eventsListenersRef.current = [];
    };
  }, [disabled, timeout, events, reset, eventsThrottle]);

  return {
    isIdle,
    reset,
  };
}
