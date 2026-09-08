import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateCounterpartyApi } from '../api';

const originalFetch = global.fetch;

function mockFetchResult(result: Record<string, unknown>, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue({ result }),
  } as unknown as Response);
}

function validApiResult(overrides: Record<string, unknown> = {}) {
  return {
    server_ready: true,
    network: 'mainnet',
    version: '11.3.0',
    backend_height: 952800,
    counterparty_height: 952800,
    ...overrides,
  };
}

describe('validateCounterpartyApi', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('accepts a mainnet 11.3.0 API', async () => {
    mockFetchResult(validApiResult());

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(true);
    expect(result.apiInfo?.version).toBe('11.3.0');
    expect(result.diagnostic).toBeUndefined();
  });

  it('accepts newer patch and minor versions', async () => {
    mockFetchResult(validApiResult({ version: '11.3.1' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(true);
  });

  it('compares API versions numerically instead of lexicographically', async () => {
    mockFetchResult(validApiResult({ version: '11.10.0' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(true);
  });

  it('rejects APIs older than 11.3.0', async () => {
    mockFetchResult(validApiResult({ version: '11.2.9' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('API must be Counterparty Core 11.3.0 or newer');
    expect(result.diagnostic).toEqual({ code: 'version_required', minimumVersion: '11.3.0' });
  });

  it('rejects missing or unparsable API versions', async () => {
    mockFetchResult(validApiResult({ version: undefined }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('API must be Counterparty Core 11.3.0 or newer');
  });

  it('rejects non-mainnet APIs before version acceptance', async () => {
    mockFetchResult(validApiResult({ network: 'testnet4', version: '11.3.0' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('API must be connected to mainnet');
    expect(result.diagnostic).toEqual({ code: 'mainnet_required' });
  });

  it.each([
    ['', 'API URL is required', 'url_required'],
    ['not a URL', 'Invalid URL format', 'invalid_url'],
  ])('keeps the URL rejection and original diagnostic for %s', async (url, error, code) => {
    global.fetch = vi.fn();
    expect(await validateCounterpartyApi(url)).toEqual({ isValid: false, error, diagnostic: { code } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the exact request and HTTP status without retrying or decoding a failed response', async () => {
    const json = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json });
    expect(await validateCounterpartyApi('https://api.example.com')).toEqual({
      isValid: false, error: 'API returned error: 429', diagnostic: { code: 'http_error', status: 429 },
    });
    expect(global.fetch).toHaveBeenCalledExactlyOnceWith('https://api.example.com/v2', {
      method: 'GET', headers: { 'Content-Type': 'application/json' }, signal: expect.any(AbortSignal),
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('retains the missing-result response rejection', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await validateCounterpartyApi('https://api.example.com')).toEqual({
      isValid: false, error: 'Invalid API response format', diagnostic: { code: 'invalid_response' },
    });
  });

  it('checks readiness before network or version', async () => {
    mockFetchResult(validApiResult({ server_ready: false, network: 'testnet4', version: '1.0.0' }));
    expect(await validateCounterpartyApi('https://api.example.com')).toEqual({
      isValid: false, error: 'API server is not ready', diagnostic: { code: 'server_not_ready' },
    });
  });

  it.each([
    [new DOMException('timed out', 'AbortError'), 'Connection timeout - API not reachable', 'timeout'],
    [new TypeError('Failed to fetch'), 'Cannot connect to API - check URL and CORS settings', 'connection_failed'],
    [new Error('Unexpected transport failure'), 'Failed to validate API', 'validation_failed'],
  ])('preserves transport rejection %s and does not retry', async (failure, error, code) => {
    global.fetch = vi.fn().mockRejectedValue(failure);
    expect(await validateCounterpartyApi('https://api.example.com')).toEqual({ isValid: false, error, diagnostic: { code } });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
