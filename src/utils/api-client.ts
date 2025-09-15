/**
 * Native Fetch API Client - Replacement for Axios
 * Provides axios-compatible API with proper timeouts, retries, and error handling
 */

// Timeout configuration matching existing axios config
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
  shouldRetry: (status?: number, error?: any) => {
    // Retry on network errors or 5xx server errors
    if (!status) return true; // Network error
    return status >= 500 && status < 600;
  }
};

// Custom error class that mimics AxiosError structure
export class ApiError extends Error {
  response?: {
    status: number;
    statusText: string;
    data: any;
    headers: Record<string, string>;
  };
  request?: any;
  code?: string;
  config?: ApiRequestConfig;
  isApiError = true;

  constructor(message: string, config?: ApiRequestConfig) {
    super(message);
    this.name = 'ApiError';
    this.config = config;
  }
}

// Request configuration interface (axios-compatible)
export interface ApiRequestConfig {
  url?: string;
  method?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  signal?: AbortSignal;
  validateStatus?: (status: number) => boolean;
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
}

// Response interface (axios-compatible)
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: ApiRequestConfig;
}

// Interceptor interfaces
export interface RequestInterceptor {
  onFulfilled?: (config: ApiRequestConfig) => ApiRequestConfig | Promise<ApiRequestConfig>;
  onRejected?: (error: any) => any;
}

export interface ResponseInterceptor {
  onFulfilled?: (response: ApiResponse) => ApiResponse | Promise<ApiResponse>;
  onRejected?: (error: any) => any;
}

/**
 * ApiClient class - Main axios replacement
 */
export class ApiClient {
  private baseURL: string;
  private defaultTimeout: number;
  private defaultHeaders: Record<string, string>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(config?: ApiRequestConfig) {
    this.baseURL = config?.baseURL || '';
    this.defaultTimeout = config?.timeout || API_TIMEOUTS.DEFAULT;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config?.headers,
    };
  }

  // Interceptor management (axios-compatible)
  interceptors = {
    request: {
      use: (
        onFulfilled?: RequestInterceptor['onFulfilled'],
        onRejected?: RequestInterceptor['onRejected']
      ) => {
        this.requestInterceptors.push({ onFulfilled, onRejected });
        return this.requestInterceptors.length - 1;
      },
      eject: (id: number) => {
        this.requestInterceptors[id] = {} as RequestInterceptor;
      }
    },
    response: {
      use: (
        onFulfilled?: ResponseInterceptor['onFulfilled'],
        onRejected?: ResponseInterceptor['onRejected']
      ) => {
        this.responseInterceptors.push({ onFulfilled, onRejected });
        return this.responseInterceptors.length - 1;
      },
      eject: (id: number) => {
        this.responseInterceptors[id] = {} as ResponseInterceptor;
      }
    }
  };

  /**
   * Build full URL from base URL and path
   */
  private buildURL(url: string, params?: Record<string, any>): string {
    const fullUrl = new URL(url, this.baseURL || undefined);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          fullUrl.searchParams.append(key, String(value));
        }
      });
    }

    return fullUrl.toString();
  }

  /**
   * Parse response headers
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const parsed: Record<string, string> = {};
    headers.forEach((value, key) => {
      parsed[key] = value;
    });
    return parsed;
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeout: number, controller: AbortController): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort();
        const error = new ApiError(`Request timed out after ${timeout}ms`);
        error.code = 'ECONNABORTED';
        reject(error);
      }, timeout);

      // Clean up timeout when request completes
      controller.signal.addEventListener('abort', () => clearTimeout(timeoutId));
    });
  }

  /**
   * Apply request interceptors
   */
  private async applyRequestInterceptors(config: ApiRequestConfig): Promise<ApiRequestConfig> {
    let currentConfig = config;

    for (const interceptor of this.requestInterceptors) {
      if (interceptor.onFulfilled) {
        try {
          currentConfig = await interceptor.onFulfilled(currentConfig);
        } catch (error) {
          if (interceptor.onRejected) {
            currentConfig = await interceptor.onRejected(error);
          } else {
            throw error;
          }
        }
      }
    }

    return currentConfig;
  }

  /**
   * Apply response interceptors
   */
  private async applyResponseInterceptors(
    response: ApiResponse | ApiError,
    isError = false
  ): Promise<ApiResponse> {
    let currentResponse = response;

    for (const interceptor of this.responseInterceptors) {
      if (isError && interceptor.onRejected) {
        try {
          currentResponse = await interceptor.onRejected(currentResponse);
          isError = false; // If error handler returns normally, it's no longer an error
        } catch (error) {
          currentResponse = error as ApiError;
          isError = true;
        }
      } else if (!isError && interceptor.onFulfilled) {
        try {
          currentResponse = await interceptor.onFulfilled(currentResponse as ApiResponse);
        } catch (error) {
          currentResponse = error as ApiError;
          isError = true;
        }
      }
    }

    if (isError) {
      throw currentResponse;
    }

    return currentResponse as ApiResponse;
  }

  /**
   * Core request method
   */
  async request<T = any>(config: ApiRequestConfig): Promise<ApiResponse<T>> {
    // Apply request interceptors
    const finalConfig = await this.applyRequestInterceptors({
      ...config,
      headers: {
        ...this.defaultHeaders,
        ...config.headers,
      },
      timeout: config.timeout || this.defaultTimeout,
    });

    const controller = new AbortController();

    // Merge signals if one was provided
    if (finalConfig.signal) {
      finalConfig.signal.addEventListener('abort', () => controller.abort());
    }

    const url = finalConfig.url ? this.buildURL(finalConfig.url, finalConfig.params) : '';
    const timeout = finalConfig.timeout || this.defaultTimeout;

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[API] ${finalConfig.method?.toUpperCase() || 'GET'} ${url}`, {
        timeout,
        params: finalConfig.params,
      });
    }

    try {
      // Race between fetch and timeout
      const fetchPromise = fetch(url, {
        method: finalConfig.method || 'GET',
        headers: finalConfig.headers,
        body: finalConfig.data ?
          (typeof finalConfig.data === 'string' ? finalConfig.data : JSON.stringify(finalConfig.data))
          : undefined,
        signal: controller.signal,
      });

      const response = await Promise.race([
        fetchPromise,
        this.createTimeoutPromise(timeout, controller),
      ]);

      const headers = this.parseHeaders(response.headers);

      // Parse response based on content type
      let data: any;
      const contentType = response.headers.get('content-type') || '';

      if (finalConfig.responseType === 'text' || contentType.includes('text/')) {
        data = await response.text();
      } else if (finalConfig.responseType === 'blob') {
        data = await response.blob();
      } else if (finalConfig.responseType === 'arraybuffer') {
        data = await response.arrayBuffer();
      } else {
        // Default to JSON, but handle empty responses
        const text = await response.text();
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text; // Fall back to text if JSON parsing fails
        }
      }

      // Check if status is ok (can be customized via validateStatus)
      const validateStatus = finalConfig.validateStatus || ((status) => status >= 200 && status < 300);

      if (!validateStatus(response.status)) {
        const error = new ApiError(`Request failed with status ${response.status}`, finalConfig);
        error.response = {
          status: response.status,
          statusText: response.statusText,
          data,
          headers,
        };
        error.request = finalConfig;
        throw error;
      }

      const apiResponse: ApiResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers,
        config: finalConfig,
      };

      // Apply response interceptors
      return await this.applyResponseInterceptors(apiResponse) as ApiResponse<T>;

    } catch (error: any) {
      // Handle fetch errors
      let apiError: ApiError;

      if (error instanceof ApiError) {
        apiError = error;
      } else if (error.name === 'AbortError') {
        apiError = new ApiError('Request aborted', finalConfig);
        apiError.code = 'ECONNABORTED';
      } else {
        apiError = new ApiError(error.message || 'Network error', finalConfig);
        apiError.code = 'NETWORK_ERROR';
      }

      apiError.config = finalConfig;
      apiError.request = finalConfig;

      // Log error
      if (process.env.NODE_ENV === 'development') {
        console.error('[API] Request failed:', {
          url,
          status: apiError.response?.status,
          message: apiError.message,
        });
      }

      // Apply response interceptors (for error handling)
      try {
        await this.applyResponseInterceptors(apiError, true);
        // If interceptor handled the error without throwing, this shouldn't happen
        throw apiError;
      } catch (interceptorError) {
        throw interceptorError;
      }
    }
  }

  /**
   * Convenience methods (axios-compatible)
   */
  async get<T = any>(url: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  async post<T = any>(url: string, data?: any, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  async put<T = any>(url: string, data?: any, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  async delete<T = any>(url: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  async patch<T = any>(url: string, data?: any, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  async head<T = any>(url: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'HEAD', url });
  }

  async options<T = any>(url: string, config?: ApiRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'OPTIONS', url });
  }
}

/**
 * Create an ApiClient instance with configuration
 */
export function createApiClient(
  baseConfig?: ApiRequestConfig,
  timeout: number = API_TIMEOUTS.DEFAULT
): ApiClient {
  const client = new ApiClient({
    ...baseConfig,
    timeout,
  });

  // Add default interceptors similar to axiosConfig.ts

  // Development logging (request interceptor)
  if (process.env.NODE_ENV === 'development') {
    client.interceptors.request.use(
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

  // Error handling (response interceptor)
  client.interceptors.response.use(
    (response) => response,
    async (error: ApiError) => {
      // Handle timeout specifically
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('[API] Request timeout:', error.config?.url);

        // Create a more user-friendly error
        const timeoutError = new ApiError(
          `Request timed out after ${error.config?.timeout}ms. Please check your connection and try again.`
        );
        timeoutError.code = 'TIMEOUT';
        (timeoutError as any).originalError = error;
        throw timeoutError;
      }

      // Handle network errors
      if (!error.response) {
        console.error('[API] Network error:', error.message);
        const networkError = new ApiError(
          'Network error. Please check your internet connection.'
        );
        networkError.code = 'NETWORK_ERROR';
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

  return client;
}

/**
 * Retry logic wrapper for API requests
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
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's not retryable
      const status = error.response?.status;
      if (!RETRY_CONFIG.shouldRetry(status, error)) {
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

// Pre-configured instances for different use cases (axios-compatible)
export const apiClient = createApiClient({}, API_TIMEOUTS.DEFAULT);
export const quickApiClient = createApiClient({}, API_TIMEOUTS.QUICK);
export const longApiClient = createApiClient({}, API_TIMEOUTS.LONG);
export const broadcastApiClient = createApiClient({}, API_TIMEOUTS.BROADCAST);

/**
 * Helper to make a request with a specific timeout
 */
export async function requestWithTimeout<T>(
  config: ApiRequestConfig,
  timeout: number = API_TIMEOUTS.DEFAULT
): Promise<T> {
  const client = createApiClient({}, timeout);
  const response = await client.request<T>(config);
  return response.data;
}

/**
 * Static methods for direct use (axios-compatible)
 */
export const api = {
  get: <T = any>(url: string, config?: ApiRequestConfig) =>
    apiClient.get<T>(url, config).then(res => res.data),

  post: <T = any>(url: string, data?: any, config?: ApiRequestConfig) =>
    apiClient.post<T>(url, data, config).then(res => res.data),

  put: <T = any>(url: string, data?: any, config?: ApiRequestConfig) =>
    apiClient.put<T>(url, data, config).then(res => res.data),

  delete: <T = any>(url: string, config?: ApiRequestConfig) =>
    apiClient.delete<T>(url, config).then(res => res.data),

  patch: <T = any>(url: string, data?: any, config?: ApiRequestConfig) =>
    apiClient.patch<T>(url, data, config).then(res => res.data),

  request: <T = any>(config: ApiRequestConfig) =>
    apiClient.request<T>(config).then(res => res.data),

  // Utility to check if error is an API error (replaces axios.isAxiosError)
  isApiError: (error: any): error is ApiError => {
    return error instanceof ApiError || error?.isApiError === true;
  },

  // Create instance method for custom configurations
  create: (config?: ApiRequestConfig) => createApiClient(config),
};

// Export the main api object as default for drop-in axios replacement
export default api;