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

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Test the API endpoint
    const response = await fetch(`${url}/v2`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { isValid: false, error: `API returned error: ${response.status}` };
    }

    const data = await response.json();

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
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      return { isValid: false, error: "Connection timeout - API not reachable" };
    }
    if (error instanceof TypeError) {
      return { isValid: false, error: "Cannot connect to API - check URL and CORS settings" };
    }
    return { isValid: false, error: "Failed to validate API" };
  }
}
