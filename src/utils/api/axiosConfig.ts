/**
 * Centralized API Configuration
 * Re-exports from the new native fetch-based api-client
 * Maintains backward compatibility with existing code
 */

import {
  API_TIMEOUTS,
  ApiClient,
  ApiRequestConfig,
  ApiResponse,
  ApiError,
  createApiClient,
  withRetry,
  apiClient,
  quickApiClient,
  longApiClient,
  broadcastApiClient,
  requestWithTimeout,
  api
} from '../api-client';

// Re-export everything for backward compatibility
export {
  API_TIMEOUTS,
  withRetry,
  apiClient,
  quickApiClient,
  longApiClient,
  broadcastApiClient,
  requestWithTimeout
};

// Type aliases for backward compatibility
export type AxiosInstance = ApiClient;
export type AxiosError = ApiError;
export type AxiosRequestConfig = ApiRequestConfig;
export type AxiosResponse<T = any> = ApiResponse<T>;

// Wrapper function to maintain backward compatibility
export function createAxiosInstance(
  baseConfig?: ApiRequestConfig,
  timeout: number = API_TIMEOUTS.DEFAULT
): ApiClient {
  return createApiClient(baseConfig, timeout);
}

// Export axios-compatible default
export default api;