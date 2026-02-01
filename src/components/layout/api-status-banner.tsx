import { type ReactElement } from 'react';
import { FaTimes } from '@/components/icons';
import { useApiStatus } from '@/contexts/api-status-context';

/**
 * Displays a thin banner below the header when API errors occur.
 * Yellow for rate limiting (429), red for server errors (5xx).
 */
export function ApiStatusBanner(): ReactElement | null {
  const { status, message, dismiss } = useApiStatus();

  if (!status) return null;

  const isRateLimited = status === 'rate-limited';
  const bgColor = isRateLimited ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = isRateLimited ? 'text-yellow-900' : 'text-white';

  const displayMessage = message || (
    isRateLimited
      ? 'API rate limited. Requests may be slow.'
      : 'API error. Some features may be unavailable.'
  );

  return (
    <div
      className={`${bgColor} ${textColor} px-4 py-1.5 text-xs font-medium flex items-center justify-between`}
      role="alert"
    >
      <span>{displayMessage}</span>
      <button
        onClick={dismiss}
        className="p-1 hover:opacity-75 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
        aria-label="Dismiss"
      >
        <FaTimes className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}
