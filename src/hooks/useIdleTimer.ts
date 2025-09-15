import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseIdleTimerOptions {
  timeout: number;
  onIdle?: () => void;
  onActive?: () => void;
  events?: string[];
  disabled?: boolean;
  stopOnIdle?: boolean;
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

export function useIdleTimer(options: UseIdleTimerOptions) {
  const {
    timeout,
    onIdle,
    onActive,
    events = DEFAULT_EVENTS,
    disabled = false,
    stopOnIdle = false,
  } = options;

  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isIdleRef = useRef(false);
  const eventsRef = useRef(events);
  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);

  // Update refs when callbacks change
  useEffect(() => {
    onIdleRef.current = onIdle;
    onActiveRef.current = onActive;
  }, [onIdle, onActive]);

  const reset = useCallback(() => {
    if (disabled || timeout <= 0) return;

    clearTimeout(timeoutRef.current);

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
    if (disabled) return;
    if (stopOnIdle && isIdleRef.current) return;
    reset();
  }, [reset, disabled, stopOnIdle]);

  useEffect(() => {
    // Clear any existing timeout
    clearTimeout(timeoutRef.current);

    // Remove all existing event listeners
    eventsRef.current.forEach(event => {
      window.removeEventListener(event, handleActivity);
    });

    if (disabled) {
      // If disabled, don't set up timer or events
      return;
    }

    // Start the timer
    reset();

    // Update events and add event listeners
    eventsRef.current = events;
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup
    return () => {
      clearTimeout(timeoutRef.current);
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [handleActivity, reset, disabled, events]);

  return {
    isIdle,
    reset,
  };
}