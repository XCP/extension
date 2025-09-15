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
    if (disabled) return;

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
    if (disabled) {
      clearTimeout(timeoutRef.current);
      return;
    }

    // Start the timer
    reset();

    // Add event listeners
    eventsRef.current.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup
    return () => {
      clearTimeout(timeoutRef.current);
      eventsRef.current.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [handleActivity, reset, disabled]);

  // Update events if they change
  useEffect(() => {
    const oldEvents = eventsRef.current;
    const newEvents = events;

    // Remove old event listeners
    const eventsToRemove = oldEvents.filter(e => !newEvents.includes(e));
    eventsToRemove.forEach(event => {
      window.removeEventListener(event, handleActivity);
    });

    // Add new event listeners
    const eventsToAdd = newEvents.filter(e => !oldEvents.includes(e));
    eventsToAdd.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    eventsRef.current = newEvents;
  }, [events, handleActivity]);

  return {
    isIdle,
    reset,
  };
}