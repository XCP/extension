/**
 * Centralized API Client Configuration
 * Provides a fetch-based client with proper timeouts and error handling
 * Drop-in replacement for axios with compatible API
 */

/**
 * Response wrapper to match axios response shape
 */
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers | Record<string, string>;
}

/**
 * Request configuration options
 */
export interface RequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  params?: Record<string, string | number | boolean>;
}

/**
 * Custom API error with additional context
 */
export interface ApiError extends Error {
  code: 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'CANCELLED';
  status?: number;
  response?: {
    data: unknown;
    status: number;
  };
}

/**
 * Create a typed API error
 */
function createApiError(
  message: string,
  code: ApiError['code'],
  options?: { status?: number; response?: { data: unknown; status: number } }
): ApiError {
  const error = new Error(message) as ApiError;
  error.code = code;
  error.status = options?.status;
  error.response = options?.response;
  return error;
}

/**
 * Check if an error is a cancellation error
 */
export function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Check if an error is an API error (similar to axios.isAxiosError)
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'code' in error;
}

// Default timeout values (in milliseconds)
export const API_TIMEOUTS = {
  DEFAULT: 30000,     // 30 seconds for most requests
  QUICK: 10000,       // 10 seconds for simple lookups
  LONG: 60000,        // 60 seconds for complex operations
  BROADCAST: 45000,   // 45 seconds for transaction broadcasts
} as const;

// URL patterns mapped to timeouts for intelligent timeout selection
const TIMEOUT_PATTERNS = [
  { pattern: /\/utxos?/i, timeout: API_TIMEOUTS.QUICK },         // UTXO lookups - 10s
  { pattern: /\/balance/i, timeout: API_TIMEOUTS.QUICK },        // Balance checks - 10s
  { pattern: /\/broadcast/i, timeout: API_TIMEOUTS.BROADCAST },  // Broadcasting - 45s
  { pattern: /\/compose/i, timeout: API_TIMEOUTS.LONG },         // Composition - 60s
  { pattern: /\/tx\//i, timeout: API_TIMEOUTS.QUICK },           // Transaction lookups - 10s
  { pattern: /\/transactions/i, timeout: API_TIMEOUTS.DEFAULT }, // Transaction lists - 30s
] as const;

/**
 * Get appropriate timeout for a URL automatically
 */
export function getTimeoutForUrl(url: string): number {
  for (const { pattern, timeout } of TIMEOUT_PATTERNS) {
    if (pattern.test(url)) {
      return timeout;
    }
  }
  return API_TIMEOUTS.DEFAULT;
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,  // Start with 1 second
  maxRetryDelay: 5000,
  shouldRetry: (error: ApiError, status?: number) => {
    // Don't retry cancellations
    if (error.code === 'CANCELLED') return false;
    // Retry on network errors
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') return true;
    // Retry on 5xx server errors
    return status !== undefined && status >= 500 && status < 600;
  }
};

/**
 * Build URL with query params
 */
function buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
  if (!params) return url;
  const urlObj = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    urlObj.searchParams.append(key, String(value));
  });
  return urlObj.toString();
}

/**
 * Create a timeout-aware fetch with AbortController
 */
async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit & { timeout?: number },
  externalSignal?: AbortSignal
): Promise<ApiResponse<T>> {
  const timeout = options.timeout || API_TIMEOUTS.DEFAULT;

  // Create timeout controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

  // Combine with external signal if provided
  const combinedSignal = externalSignal
    ? AbortSignal.any([timeoutController.signal, externalSignal])
    : timeoutController.signal;

  try {
    const response = await fetch(url, {
      ...options,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    // Parse response body
    const contentType = response.headers.get('content-type');
    let data: T;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text() as unknown as T;
    }

    // Check for HTTP errors
    if (!response.ok) {
      throw createApiError(
        `Request failed with status ${response.status}`,
        'HTTP_ERROR',
        { status: response.status, response: { data, status: response.status } }
      );
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      // Check if it was from external signal (user cancellation) or timeout
      if (externalSignal?.aborted) {
        throw createApiError('Request cancelled', 'CANCELLED');
      }
      throw createApiError(
        `Request timed out after ${timeout}ms. Please check your connection and try again.`,
        'TIMEOUT'
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw createApiError(
        'Network error. Please check your internet connection.',
        'NETWORK_ERROR'
      );
    }

    // Re-throw API errors as-is
    if (isApiError(error)) {
      throw error;
    }

    // Wrap unknown errors
    throw createApiError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      'NETWORK_ERROR'
    );
  }
}

/**
 * Retry logic wrapper for API requests
 */
export async function withRetry<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: ApiError | null = null;
  let delay = RETRY_CONFIG.retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error as ApiError;

      // Don't retry if it's not retryable
      if (!RETRY_CONFIG.shouldRetry(lastError, lastError.status)) {
        throw error;
      }

      // Don't retry after last attempt
      if (attempt === maxRetries) {
        break;
      }

      console.warn(`[API] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff with jitter
      delay = Math.min(
        delay * 2 + Math.random() * 1000,
        RETRY_CONFIG.maxRetryDelay
      );
    }
  }

  throw lastError;
}

/**
 * Unified smart client that automatically selects appropriate timeouts
 * based on URL patterns and provides built-in retry logic
 */
export const apiClient = {
  /**
   * GET request with automatic timeout selection
   */
  async get<T = unknown>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const timeout = config?.timeout || getTimeoutForUrl(url);
    const fullUrl = buildUrl(url, config?.params);

    return withRetry(() => fetchWithTimeout<T>(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      timeout,
    }, config?.signal));
  },

  /**
   * POST request with automatic timeout selection
   */
  async post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    const timeout = config?.timeout || getTimeoutForUrl(url);
    const fullUrl = buildUrl(url, config?.params);

    // Determine body and content-type
    let body: string | undefined;
    const contentType = config?.headers?.['Content-Type'] || 'application/json';

    if (data !== null && data !== undefined) {
      if (contentType.includes('application/json')) {
        body = JSON.stringify(data);
      } else {
        body = String(data);
      }
    }

    return withRetry(() => fetchWithTimeout<T>(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...config?.headers,
      },
      body,
      timeout,
    }, config?.signal));
  },

  /**
   * PUT request with automatic timeout selection
   */
  async put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    const timeout = config?.timeout || getTimeoutForUrl(url);
    const fullUrl = buildUrl(url, config?.params);

    return withRetry(() => fetchWithTimeout<T>(fullUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      timeout,
    }, config?.signal));
  },

  /**
   * DELETE request with automatic timeout selection
   */
  async delete<T = unknown>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const timeout = config?.timeout || getTimeoutForUrl(url);
    const fullUrl = buildUrl(url, config?.params);

    return withRetry(() => fetchWithTimeout<T>(fullUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      timeout,
    }, config?.signal));
  },

  /**
   * PATCH request with automatic timeout selection
   */
  async patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    const timeout = config?.timeout || getTimeoutForUrl(url);
    const fullUrl = buildUrl(url, config?.params);

    return withRetry(() => fetchWithTimeout<T>(fullUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      timeout,
    }, config?.signal));
  },
};
