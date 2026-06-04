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
    version: '11.1.0',
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

  it('accepts a mainnet 11.1.0 API', async () => {
    mockFetchResult(validApiResult());

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(true);
    expect(result.apiInfo?.version).toBe('11.1.0');
  });

  it('accepts newer patch and minor versions', async () => {
    mockFetchResult(validApiResult({ version: '11.2.0' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(true);
  });

  it('compares API versions numerically instead of lexicographically', async () => {
    mockFetchResult(validApiResult({ version: '11.10.0' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(true);
  });

  it('rejects APIs older than 11.1.0', async () => {
    mockFetchResult(validApiResult({ version: '11.0.0' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('API must be Counterparty Core 11.1.0 or newer');
  });

  it('rejects missing or unparsable API versions', async () => {
    mockFetchResult(validApiResult({ version: undefined }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('API must be Counterparty Core 11.1.0 or newer');
  });

  it('rejects non-mainnet APIs before version acceptance', async () => {
    mockFetchResult(validApiResult({ network: 'testnet4', version: '11.1.0' }));

    const result = await validateCounterpartyApi('https://api.example.com');

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('API must be connected to mainnet');
  });
});
