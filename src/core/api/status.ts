/**
 * API Status Event System
 *
 * Provides a simple pub/sub mechanism for API errors that React components
 * can subscribe to for displaying global error banners.
 */

export type ApiStatusType = 'rate-limited' | 'server-error' | null;

export interface ApiStatusEvent {
  type: ApiStatusType;
  statusCode?: number;
  message?: string;
  retryAfter?: number;
}

type Listener = (event: ApiStatusEvent) => void;

const listeners = new Set<Listener>();

// Track current status to avoid duplicate emissions
let currentStatus: ApiStatusEvent = { type: null };

/**
 * Emit an API status event to all subscribers.
 */
export function emitApiStatus(event: ApiStatusEvent): void {
  // Avoid duplicate emissions of the same status
  if (currentStatus.type === event.type && currentStatus.statusCode === event.statusCode) {
    return;
  }
  currentStatus = event;
  listeners.forEach(listener => listener(event));
}

/**
 * Subscribe to API status events.
 * @returns Unsubscribe function
 */
export function subscribeApiStatus(listener: Listener): () => void {
  listeners.add(listener);
  // Immediately send current status to new subscriber
  listener(currentStatus);
  return () => listeners.delete(listener);
}

/**
 * Clear the current API status (e.g., when user acknowledges the error).
 */
export function clearApiStatus(): void {
  emitApiStatus({ type: null });
}

/**
 * Determine status type from HTTP status code.
 * Only 429 (rate limit) and 5xx (server errors) trigger the banner.
 * 4xx client errors are handled contextually in the UI.
 */
export function getStatusTypeFromCode(statusCode: number): ApiStatusType {
  if (statusCode === 429) return 'rate-limited';
  if (statusCode >= 500) return 'server-error';
  return null;
}
