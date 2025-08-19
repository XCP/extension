import { useState, useEffect } from 'react';
import { FiClock, FiAlertCircle } from 'react-icons/fi';

interface TimeoutIndicatorProps {
  createdAt: number;
  timeoutMs: number;
  onTimeout?: () => void;
}

export function TimeoutIndicator({ createdAt, timeoutMs, onTimeout }: TimeoutIndicatorProps) {
  // Calculate initial time remaining
  const calculateTimeRemaining = () => {
    const elapsed = Date.now() - createdAt;
    return Math.max(0, timeoutMs - elapsed);
  };
  
  const [timeRemaining, setTimeRemaining] = useState(calculateTimeRemaining);
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - createdAt;
      const remaining = Math.max(0, timeoutMs - elapsed);
      
      setTimeRemaining(remaining);
      
      if (remaining === 0 && !hasExpired) {
        setHasExpired(true);
        onTimeout?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt, timeoutMs, onTimeout, hasExpired]);

  if (hasExpired) {
    return (
      <div className="flex items-center space-x-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg">
        <FiAlertCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Request expired</span>
      </div>
    );
  }

  // Show warning when less than 1 minute remaining
  if (timeRemaining < 60000) {
    return (
      <div className="flex items-center space-x-2 text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
        <FiClock className="w-4 h-4" />
        <span className="text-sm">Expires soon</span>
      </div>
    );
  }

  return null; // Don't show anything for most of the timeout period
}