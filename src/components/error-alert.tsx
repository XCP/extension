import React from 'react';
import { IoClose } from 'react-icons/io5';
import { Button } from '@/components/button';

interface ErrorAlertProps {
  /** The error message to display */
  message: string;
  /** Optional callback when the alert is closed */
  onClose?: () => void;
  /** Type of error for different styling */
  severity?: 'error' | 'warning' | 'info';
  /** Optional title for the alert */
  title?: string;
  /** Additional CSS classes */
  className?: string;
}

const SEVERITY_STYLES = {
  error: {
    container: 'bg-red-100 border-red-400 text-red-700',
    icon: 'text-red-700',
    title: 'Error',
  },
  warning: {
    container: 'bg-yellow-100 border-yellow-400 text-yellow-700',
    icon: 'text-yellow-700',
    title: 'Warning',
  },
  info: {
    container: 'bg-blue-100 border-blue-400 text-blue-700',
    icon: 'text-blue-700',
    title: 'Info',
  },
} as const;

/**
 * ErrorAlert Component - Optimized for React 19
 * 
 * Improvements:
 * - Memoized to prevent unnecessary re-renders
 * - Added severity levels for different alert types
 * - Better accessibility with proper ARIA attributes
 * - Optional custom title
 * - More flexible styling options
 */
export const ErrorAlert = React.memo<ErrorAlertProps>(({ 
  message, 
  onClose,
  severity = 'error',
  title,
  className = ''
}) => {
  const styles = SEVERITY_STYLES[severity];
  const displayTitle = title || styles.title;
  
  return (
    <div 
      className={`${styles.container} border px-4 py-3 rounded mb-4 relative ${className}`}
      role="alert"
      aria-live={severity === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {onClose && (
        <Button
          variant="menu"
          onClick={onClose}
          className="absolute top-2 right-2 z-10"
          aria-label={`Dismiss ${displayTitle.toLowerCase()} message`}
        >
          <IoClose className={`h-4 w-4 ${styles.icon}`} aria-hidden="true" />
        </Button>
      )}
      <div className="pr-8">
        <strong className="font-bold mr-2">{displayTitle}:</strong>
        <span className="block sm:inline break-words">{message}</span>
      </div>
    </div>
  );
});

ErrorAlert.displayName = 'ErrorAlert';

/**
 * InlineError Component - For form field errors
 * 
 * A lighter-weight error display for inline form validation
 */
export const InlineError = React.memo<{ message: string; className?: string }>(({ 
  message, 
  className = '' 
}) => {
  return (
    <p 
      className={`text-red-500 text-sm mt-1 ${className}`}
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
});

InlineError.displayName = 'InlineError';