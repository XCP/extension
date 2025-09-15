import api from '@/utils/fetch';

/**
 * Interface for Counterparty API validation result
 */
export interface ApiValidationResult {
  isValid: boolean;
  error?: string;
  apiInfo?: {
    version: string;
    network: string;
    backendHeight: number;
    counterpartyHeight: number;
  };
}

/**
 * Validates a Counterparty API endpoint
 * @param url The base URL of the API endpoint
 * @returns Promise with validation result
 */
export async function validateCounterpartyApi(url: string): Promise<ApiValidationResult> {
  // Basic URL validation
  if (!url) {
    return { isValid: false, error: "API URL is required" };
  }

  try {
    new URL(url);
  } catch {
    return { isValid: false, error: "Invalid URL format" };
  }

  try {
    // Test the API endpoint
    const response = await api.get(`${url}/v2`, {
      timeout: 5000,
      validateStatus: (status) => status === 200,
    });

    const data = response;
    
    // Check for required fields
    if (!data?.result) {
      return { isValid: false, error: "Invalid API response format" };
    }

    if (!data.result.server_ready) {
      return { isValid: false, error: "API server is not ready" };
    }

    if (data.result.network !== "mainnet") {
      return { isValid: false, error: "API must be connected to mainnet" };
    }

    // Success
    return {
      isValid: true,
      apiInfo: {
        version: data.result.version,
        network: data.result.network,
        backendHeight: data.result.backend_height,
        counterpartyHeight: data.result.counterparty_height,
      }
    };
  } catch (error) {
    if (api.isApiError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'TIMEOUT') {
        return { isValid: false, error: "Connection timeout - API not reachable" };
      } else if (error.response) {
        return { isValid: false, error: `API returned error: ${error.response.status}` };
      } else if (error.request) {
        return { isValid: false, error: "Cannot connect to API - check URL and CORS settings" };
      } else {
        return { isValid: false, error: "Invalid API response" };
      }
    }
    return { isValid: false, error: "Failed to validate API" };
  }
}