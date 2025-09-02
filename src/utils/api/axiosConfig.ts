/**
 * Centralized Axios Configuration
 * Provides configured axios instances with proper timeouts and error handling
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

// Default timeout values (in milliseconds)
export const API_TIMEOUTS = {
  DEFAULT: 30000,     // 30 seconds for most requests
  QUICK: 10000,       // 10 seconds for simple lookups
  LONG: 60000,        // 60 seconds for complex operations
  BROADCAST: 45000,   // 45 seconds for transaction broadcasts
} as const;

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,  // Start with 1 second
  maxRetryDelay: 5000,
  shouldRetry: (error: AxiosError) => {
    // Retry on network errors or 5xx server errors
    if (!error.response) return true; // Network error
    return error.response.status >= 500 && error.response.status < 600;
  }
};

/**
 * Create an axios instance with timeout and retry logic
 */
export function createAxiosInstance(
  baseConfig?: AxiosRequestConfig,
  timeout: number = API_TIMEOUTS.DEFAULT
): AxiosInstance {
  const instance = axios.create({
    timeout,
    ...baseConfig,
    headers: {
      'Content-Type': 'application/json',
      ...baseConfig?.headers,
    },
  });

  // Add request interceptor for logging in development
  if (process.env.NODE_ENV === 'development') {
    instance.interceptors.request.use(
      (config) => {
        console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
          timeout: config.timeout,
          params: config.params,
        });
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  // Add response interceptor for error handling
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      // Handle timeout specifically
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('[API] Request timeout:', error.config?.url);
        
        // Create a more user-friendly error
        const timeoutError = new Error(
          `Request timed out after ${error.config?.timeout}ms. Please check your connection and try again.`
        );
        (timeoutError as any).code = 'TIMEOUT';
        (timeoutError as any).originalError = error;
        throw timeoutError;
      }

      // Handle network errors
      if (!error.response) {
        console.error('[API] Network error:', error.message);
        const networkError = new Error(
          'Network error. Please check your internet connection.'
        );
        (networkError as any).code = 'NETWORK_ERROR';
        (networkError as any).originalError = error;
        throw networkError;
      }

      // Log other errors
      console.error('[API] Request failed:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.response?.data || error.message,
      });

      throw error;
    }
  );

  return instance;
}

/**
 * Retry logic wrapper for axios requests
 */
export async function withRetry<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: any;
  let delay = RETRY_CONFIG.retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not retryable
      if (!RETRY_CONFIG.shouldRetry(error as AxiosError)) {
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

// Pre-configured instances for different use cases
export const apiClient = createAxiosInstance({}, API_TIMEOUTS.DEFAULT);
export const quickApiClient = createAxiosInstance({}, API_TIMEOUTS.QUICK);
export const longApiClient = createAxiosInstance({}, API_TIMEOUTS.LONG);
export const broadcastApiClient = createAxiosInstance({}, API_TIMEOUTS.BROADCAST);

/**
 * Helper to make a request with a specific timeout
 */
export async function requestWithTimeout<T>(
  config: AxiosRequestConfig,
  timeout: number = API_TIMEOUTS.DEFAULT
): Promise<T> {
  const instance = createAxiosInstance({}, timeout);
  const response = await instance.request<T>(config);
  return response.data;
}