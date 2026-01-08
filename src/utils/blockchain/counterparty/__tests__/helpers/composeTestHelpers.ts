import { vi, expect, beforeEach, it } from 'vitest';
import type { ComposeResult } from '../../compose';

/**
 * Common test data and mocks for compose tests
 */
export const mockAddress = 'bc1qtest123address';
export const mockDestAddress = 'bc1qdest456address';
export const mockApiBase = 'https://api.counterparty.io:4000';
import { DEFAULT_SETTINGS } from '@/utils/storage/settingsStorage';

export const mockSettings = {
  ...DEFAULT_SETTINGS,
  counterpartyApiBase: mockApiBase,
};
export const mockSatPerVbyte = 10;

/**
 * Create a mock compose result with defaults
 */
export const createMockComposeResult = (overrides?: Partial<ComposeResult>): ComposeResult => ({
  rawtransaction: '0200000001...',
  btc_in: 100000,
  btc_out: 90000,
  btc_change: 8000,
  btc_fee: 2000,
  data: 'counterparty_data_hex',
  lock_scripts: ['script1', 'script2'],
  inputs_values: [100000],
  signed_tx_estimated_size: {
    vsize: 250,
    adjusted_vsize: 250,
    sigops_count: 2,
  },
  psbt: 'cHNidP8BAP0...',
  params: {
    source: mockAddress,
    destination: mockDestAddress,
    asset: 'XCP',
    quantity: 100000000,
    memo: null,
    memo_is_hex: false,
    use_enhanced_send: false,
    no_dispense: false,
    skip_validation: false,
    asset_info: {
      asset_longname: null,
      description: 'Test Asset',
      issuer: mockAddress,
      divisible: true,
      locked: false,
      owner: mockAddress,
    },
    quantity_normalized: '1.00000000',
  },
  name: 'send',
  ...overrides,
});

/**
 * Create a mock API response with full AxiosResponse structure
 */
export const createMockApiResponse = <T = ComposeResult>(data: T) => ({
  data: data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: { headers: {} as any },
});

/**
 * Setup common mocks for compose tests
 */
export const setupComposeMocks = () => {
  const mockedAxios = {
    get: vi.fn().mockResolvedValue(createMockApiResponse(createMockComposeResult())),
    post: vi.fn().mockResolvedValue(createMockApiResponse(createMockComposeResult())),
  };
  
  const mockedGetSettings = vi.fn().mockResolvedValue(mockSettings);
  
  return {
    mockedAxios,
    mockedGetSettings,
  };
};

/**
 * Assert that the compose URL was called correctly
 */
export const assertComposeUrlCalled = (
  mockedAxios: any,
  endpoint: string,
  expectedParams: Record<string, any>
) => {
  const baseUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/${endpoint}`;
  
  // Get the actual call - could be either get or post
  const getCall = mockedAxios.get.mock.calls[0];
  const postCall = mockedAxios.post.mock.calls[0];
  
  if (getCall) {
    const actualUrl = getCall[0];
    const actualOptions = getCall[1];
    
    // Check that the URL starts with the expected base
    expect(actualUrl).toContain(baseUrl);
    
    // Check that the URL contains the expected parameters as query string
    const url = new URL(actualUrl);
    Object.entries(expectedParams).forEach(([key, value]) => {
      expect(url.searchParams.get(key)).toBe(String(value));
    });
    
    // Check headers
    expect(actualOptions?.headers?.['Content-Type']).toBe('application/json');
  } else if (postCall) {
    const actualUrl = postCall[0];
    const actualParams = postCall[1];
    
    // Check that the URL is correct
    expect(actualUrl).toContain(baseUrl);
    
    // Check that the params match
    Object.entries(expectedParams).forEach(([key, value]) => {
      expect(actualParams[key]).toBe(value);
    });
  }
};

/**
 * Common test scenarios for optional parameters
 */
export const testOptionalParameters = (
  composeFn: Function,
  endpoint: string,
  requiredParams: Record<string, any>,
  optionalParams: Record<string, any>,
  mockedAxios: any
) => {
  return async () => {
    await composeFn(mockAddress, requiredParams, optionalParams);
    
    const expectedUrl = `${mockApiBase}/api/v2/addresses/${mockAddress}/compose/${endpoint}`;
    const actualCall = mockedAxios.post.mock.calls[0];
    const actualParams = actualCall[1];
    
    // Check all optional params were included
    Object.entries(optionalParams).forEach(([key, value]) => {
      expect(actualParams[key]).toBe(value);
    });
  };
};

/**
 * Common test for error handling
 */
export const testErrorHandling = (
  composeFn: Function,
  requiredParams: any,
  mockedAxios: any
) => {
  return async () => {
    const errorMessage = 'API Error';
    mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));
    
    await expect(composeFn(mockAddress, requiredParams)).rejects.toThrow(errorMessage);
  };
};

/**
 * Test assets for various scenarios
 */
export const testAssets = {
  XCP: 'XCP',
  BTC: 'BTC',
  DIVISIBLE: 'DIVISIBLEASSET',
  INDIVISIBLE: 'INDIVISIBLEASSET',
  SUBASSET: 'PARENTASSET.SUBASSET',
  NUMERIC: 'A95428956661682177',
};

/**
 * Test quantities for various scenarios
 */
export const testQuantities = {
  SMALL: 100,
  MEDIUM: 100000000,
  LARGE: 1000000000000,
  ZERO: 0,
  NEGATIVE: -100, // For error testing
  FRACTIONAL: 0.12345678,
};

/**
 * Test memo scenarios
 */
export const testMemos = {
  TEXT: 'Test memo',
  HEX: '0x48656c6c6f', // "Hello" in hex
  EMPTY: '',
  LONG: 'This is a very long memo that exceeds the typical limit for memo fields in Counterparty transactions',
};

/**
 * Mock settings for different networks
 */
export const networkSettings = {
  MAINNET: { counterpartyApiBase: 'https://api.counterparty.io:4000' },
  TESTNET: { counterpartyApiBase: 'https://testnet.counterparty.io:4001' },
};

/**
 * Create a test suite for a compose function
 */
export const createComposeTestSuite = (
  suiteName: string,
  composeFn: Function,
  endpoint: string,
  requiredParams: Record<string, any>
) => {
  return () => {
    let mocks: ReturnType<typeof setupComposeMocks>;

    beforeEach(() => {
      vi.clearAllMocks();
      mocks = setupComposeMocks();
    });

    it('should compose transaction with required parameters', async () => {
      const result = await composeFn(mockAddress, requiredParams);
      
      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mocks.mockedAxios, endpoint, requiredParams);
    });

    it('should handle API errors', async () => {
      await testErrorHandling(composeFn, requiredParams, mocks.mockedAxios)();
    });

    it('should get settings before making request', async () => {
      await composeFn(mockAddress, requiredParams);
      expect(mocks.mockedGetSettings).toHaveBeenCalled();
    });
  };
};