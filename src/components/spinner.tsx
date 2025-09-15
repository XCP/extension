import { memo } from 'react';
import { FaSpinner } from 'react-icons/fa';

interface SpinnerProps {
  /** Additional CSS classes */
  className?: string;
  /** Optional loading message */
  message?: string;
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Color of the spinner */
  color?: 'blue' | 'gray' | 'white';
}

const SIZES = {
  sm: 'text-2xl',
  md: 'text-3xl',
  lg: 'text-4xl',
  xl: 'text-5xl',
} as const;

const COLORS = {
  blue: 'text-blue-500',
  gray: 'text-gray-500',
  white: 'text-white',
} as const;

/**
 * Spinner Component - Optimized for React 19
 * 
 * Improvements:
 * - Removed unnecessary ReactElement type (React 19 handles this)
 * - Added size and color props for flexibility
 * - Memoized component to prevent unnecessary re-renders
 * - Better accessibility with role and aria-label
 */
export const Spinner = memo<SpinnerProps>(({ 
  className = '', 
  message,
  size = 'lg',
  color = 'blue'
}) => {
  return (
    <div 
      className={`flex flex-col items-center justify-center h-full ${className}`}
      role="status"
      aria-label={message || 'Loading'}
    >
      <FaSpinner 
        className={`animate-spin ${SIZES[size]} ${COLORS[color]}`}
        aria-hidden="true"
      />
      {message ? (
        <p className="mt-4 text-gray-600 text-center font-medium">
          {message}
        </p>
      ) : (
        <span className="sr-only">Loading...</span>
      )}
    </div>
  );
});

Spinner.displayName = 'Spinner';