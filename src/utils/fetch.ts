/**
 * Unified Fetch Client
 * A minimal, secure wrapper around native fetch API
 */

// Timeout configuration with smart defaults
const TIMEOUTS = {
  // URL patterns mapped to timeouts
  patterns: [
    { pattern: /\/utxos?/i, timeout: 10000 },         // UTXO lookups - 10s
    { pattern: /\/balance/i, timeout: 10000 },        // Balance checks - 10s
    { pattern: /\/broadcast/i, timeout: 45000 },      // Broadcasting - 45s
    { pattern: /\/compose/i, timeout: 60000 },        // Composition - 60s
    { pattern: /\/tx\//i, timeout: 15000 },           // Transaction lookups - 15s
  ],
  default: 30000, // Default timeout - 30s
};

// Custom error class for API errors
export class FetchError extends Error {
  status?: number;
  statusText?: string;
  data?: any;
  code?: string;
  timeout?: boolean;
  network?: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

// Request configuration interface
export interface FetchConfig {
  method?: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  signal?: AbortSignal;
  retry?: {
    attempts?: number;
    retryOn?: number[];
    backoff?: 'linear' | 'exponential';
  };
}

/**
 * Get appropriate timeout for a URL
 */
function getTimeoutForUrl(url: string): number {
  for (const { pattern, timeout } of TIMEOUTS.patterns) {
    if (pattern.test(url)) {
      return timeout;
    }
  }
  return TIMEOUTS.default;
}

/**
 * Build URL with query parameters
 */
function buildUrl(url: string, params?: Record<string, any>): string {
  if (!params) return url;

  const urlObj = new URL(url, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.append(key, String(value));
    }
  });

  return urlObj.toString();
}

/**
 * Create timeout promise
 */
function createTimeoutPromise(timeout: number, controller: AbortController): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      const error = new FetchError(`Request timed out after ${timeout}ms`);
      error.code = 'TIMEOUT';
      error.timeout = true;
      reject(error);
    }, timeout);

    controller.signal.addEventListener('abort', () => clearTimeout(timeoutId));
  });
}

/**
 * Sleep for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay
 */
function getRetryDelay(attempt: number, backoff: 'linear' | 'exponential' = 'exponential'): number {
  if (backoff === 'linear') {
    return 1000 * attempt; // 1s, 2s, 3s...
  }
  // Exponential with jitter
  return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 5000);
}

/**
 * Main request function with retry logic
 */
async function makeRequest<T = any>(
  url: string,
  config: FetchConfig = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    params,
    data,
    timeout = getTimeoutForUrl(url),
    signal,
    retry = { attempts: 3, retryOn: [500, 502, 503, 504], backoff: 'exponential' }
  } = config;

  const maxAttempts = retry.attempts || 1;
  const retryOn = retry.retryOn || [500, 502, 503, 504];
  const backoff = retry.backoff || 'exponential';

  const fullUrl = buildUrl(url, params);

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[Fetch] ${method} ${fullUrl}`, { timeout, params });
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();

    // Merge signals if one was provided
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      // Prepare request options
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      };

      // Add body for non-GET requests
      if (data && method !== 'GET') {
        fetchOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
      }

      // Race between fetch and timeout
      const response = await Promise.race([
        fetch(fullUrl, fetchOptions),
        createTimeoutPromise(timeout, controller),
      ]);

      // Check if we should retry on this status
      if (!response.ok && retryOn.includes(response.status) && attempt < maxAttempts - 1) {
        const delay = getRetryDelay(attempt, backoff);
        console.warn(`[Fetch] Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      // Handle non-ok responses
      if (!response.ok) {
        const error = new FetchError(`Request failed with status ${response.status}`);
        error.status = response.status;
        error.statusText = response.statusText;

        // Try to parse error response
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            error.data = await response.json();
          } else {
            error.data = await response.text();
          }
        } catch {
          // Ignore parsing errors
        }

        throw error;
      }

      // Parse successful response
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        return await response.json();
      } else if (contentType.includes('text/')) {
        return await response.text() as any;
      } else {
        // Return response as-is for binary data
        return response as any;
      }

    } catch (error: any) {
      lastError = error;

      // Don't retry on timeout or abort
      if (error.name === 'AbortError' || error.timeout) {
        throw error;
      }

      // Don't retry on client errors (4xx)
      if (error.status && error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Network error - retry if we have attempts left
      if (attempt < maxAttempts - 1) {
        const delay = getRetryDelay(attempt, backoff);
        console.warn(`[Fetch] Network error, retry ${attempt + 1}/${maxAttempts} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      // Convert to FetchError if it isn't already
      if (!(error instanceof FetchError)) {
        const fetchError = new FetchError(error.message || 'Network error');
        fetchError.network = true;
        fetchError.code = 'NETWORK_ERROR';
        throw fetchError;
      }

      throw error;
    }
  }

  // Should never reach here, but just in case
  throw lastError || new FetchError('Request failed after all retry attempts');
}

/**
 * Exported fetch client with convenient methods
 */
export const client = {
  /**
   * GET request
   */
  get: <T = any>(url: string, config?: Omit<FetchConfig, 'method' | 'data'>) =>
    makeRequest<T>(url, { ...config, method: 'GET' }),

  /**
   * POST request
   */
  post: <T = any>(url: string, data?: any, config?: Omit<FetchConfig, 'method' | 'data'>) =>
    makeRequest<T>(url, { ...config, method: 'POST', data }),

  /**
   * PUT request
   */
  put: <T = any>(url: string, data?: any, config?: Omit<FetchConfig, 'method' | 'data'>) =>
    makeRequest<T>(url, { ...config, method: 'PUT', data }),

  /**
   * DELETE request
   */
  delete: <T = any>(url: string, config?: Omit<FetchConfig, 'method' | 'data'>) =>
    makeRequest<T>(url, { ...config, method: 'DELETE' }),

  /**
   * PATCH request
   */
  patch: <T = any>(url: string, data?: any, config?: Omit<FetchConfig, 'method' | 'data'>) =>
    makeRequest<T>(url, { ...config, method: 'PATCH', data }),

  /**
   * Generic request method
   */
  request: <T = any>(url: string, config?: FetchConfig) =>
    makeRequest<T>(url, config),

  /**
   * Check if error is a FetchError
   */
  isError: (error: any): error is FetchError => {
    return error instanceof FetchError;
  },
};

// Default export for convenience
export default client;

// Re-export types for backward compatibility during migration
export type ApiError = FetchError;
export type ApiRequestConfig = FetchConfig;
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: FetchConfig;
}

// Backward compatibility exports (to be removed after migration)
export const api = client;
export const apiClient = client;
export const quickApiClient = client;
export const longApiClient = client;
export const broadcastApiClient = client;
export const API_TIMEOUTS = TIMEOUTS;

// Simplified withRetry for backward compatibility
export async function withRetry<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = getRetryDelay(attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

// Helper to create ApiResponse format (for tests that need it)
export function createApiResponse<T>(data: T, status = 200): ApiResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {}
  };
}