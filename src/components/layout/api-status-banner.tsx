import type { ReactElement } from 'react';
import { FaTimes } from '@/components/icons';
import { useApiStatus } from '@/contexts/api-status-context';

import { t } from '@/i18n';
/**
 * Displays a thin banner below the header when API errors occur.
 * Yellow for rate limiting (429), red for server errors (5xx).
 */
export function ApiStatusBanner(): ReactElement | null {
  const { status, statusCode, message, dismiss } = useApiStatus();

  if (!status) return null;

  const isRateLimited = status === 'rate-limited';
  const bgColor = isRateLimited ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = isRateLimited ? 'text-yellow-900' : 'text-white';

  // Translate status codes here; retain unfamiliar server details verbatim below.
  const knownDefault = message === "API rate limited. Requests may be slow." || /^API error \(\d{3}\)\. Some features may be unavailable\.$/.test(message ?? "");
  const displayMessage = (
    isRateLimited
      ? t('layout_api_status_banner_api_rate_limited_requests_may')
      : t('layout_api_status_banner_api_error_some_features_may')
  );

  return (
    <div
      className={`${bgColor} ${textColor} flex shrink-0 items-center justify-between px-4 py-1.5 text-xs font-medium`}
      role="alert"
    >
      <span className="min-w-0 break-words">
        {displayMessage}{statusCode ? ` (${statusCode})` : ""}
        {message && !knownDefault && <span className="block">{message}</span>}
      </span>
      <button type="button"
        onClick={dismiss}
        className="shrink-0 p-1 hover:opacity-75 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
        aria-label={t('layout_api_status_banner_dismiss')}
      >
        <FaTimes className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}
