import {
  isVersionAtLeast,
  MIN_COUNTERPARTY_API_VERSION,
} from '@/core/counterparty/capabilities';

/**
 * Interface for Counterparty API validation result
 */
export type ApiValidationDiagnostic =
  | { code: 'url_required' | 'invalid_url' | 'invalid_response' | 'server_not_ready' | 'mainnet_required' | 'timeout' | 'connection_failed' | 'validation_failed' }
  | { code: 'http_error'; status: number }
  | { code: 'version_required'; minimumVersion: string };

export interface ApiValidationResult {
  isValid: boolean;
  /** Original diagnostic retained for callers; known UI text uses diagnostic at render time. */
  error?: string;
  diagnostic?: ApiValidationDiagnostic;
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
    return { isValid: false, error: "API URL is required", diagnostic: { code: 'url_required' } };
  }

  try {
    new URL(url);
  } catch {
    return { isValid: false, error: "Invalid URL format", diagnostic: { code: 'invalid_url' } };
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
      return { isValid: false, error: `API returned error: ${response.status}`, diagnostic: { code: 'http_error', status: response.status } };
    }

    const data = await response.json();

    // Check for required fields
    if (!data?.result) {
      return { isValid: false, error: "Invalid API response format", diagnostic: { code: 'invalid_response' } };
    }

    if (!data.result.server_ready) {
      return { isValid: false, error: "API server is not ready", diagnostic: { code: 'server_not_ready' } };
    }

    if (data.result.network !== "mainnet") {
      return { isValid: false, error: "API must be connected to mainnet", diagnostic: { code: 'mainnet_required' } };
    }

    const version = String(data.result.version ?? '');
    if (!isVersionAtLeast(version, MIN_COUNTERPARTY_API_VERSION)) {
      return {
        isValid: false,
        error: `API must be Counterparty Core ${MIN_COUNTERPARTY_API_VERSION} or newer`,
        diagnostic: { code: 'version_required', minimumVersion: MIN_COUNTERPARTY_API_VERSION },
      };
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
      return { isValid: false, error: "Connection timeout - API not reachable", diagnostic: { code: 'timeout' } };
    }
    if (error instanceof TypeError) {
      return { isValid: false, error: "Cannot connect to API - check URL and CORS settings", diagnostic: { code: 'connection_failed' } };
    }
    return { isValid: false, error: "Failed to validate API", diagnostic: { code: 'validation_failed' } };
  }
}
