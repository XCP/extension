import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composeSend, composeSendOrMPMA, composeMPMA, composeSweep, getSweepEstimateXcpFee, composeMove } from '../compose';
import * as apiClientUtils from '@/utils/apiClient';
import { walletManager } from '@/utils/wallet/walletManager';
import {
  mockAddress,
  mockDestAddress,
  mockApiBase,
  mockSettings,
  mockSatPerVbyte,
  createMockComposeResult,
  createMockApiResponse,
  assertComposeUrlCalled,
  testAssets,
  testQuantities,
  testMemos,
} from './helpers/composeTestHelpers';

// Mock dependencies
vi.mock('@/utils/apiClient');
vi.mock('@/utils/wallet/walletManager', () => ({
  walletManager: {
    getSettings: vi.fn(),
  },
}));

// Mock UTXO selection to prevent real API calls to mempool.space
vi.mock('@/utils/blockchain/counterparty/utxo-selection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [{ txid: 'mock-txid', vout: 0, value: 100000, status: { confirmed: true } }],
    inputsSet: 'mock-txid:0',
    totalValue: 100000,
    excludedWithAssets: 0,
  }),
}));

const mockedApiClient = vi.mocked(apiClientUtils.apiClient, true);
const mockedGetSettings = vi.mocked(walletManager.getSettings);

describe('Compose Send Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
    mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
  });

  describe('composeSend', () => {
    const defaultParams = {
      destination: mockDestAddress,
      asset: testAssets.XCP,
      quantity: testQuantities.MEDIUM,
    };

    it('should compose send transaction with required parameters', async () => {
      const result = await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'send', defaultParams);
    });

    it('should include optional parameters when provided', async () => {
      const optionalParams = {
        memo: testMemos.TEXT,
        memo_is_hex: false,
      };

      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      const url = new URL(actualUrl);

      expect(url.searchParams.get('memo')).toBe(testMemos.TEXT);
      expect(url.searchParams.get('memo_is_hex')).toBe('false');
    });

    it('should handle hex memo correctly', async () => {
      const optionalParams = {
        memo: testMemos.HEX,
        memo_is_hex: true,
      };

      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      expect(actualUrl).toContain(`memo=${encodeURIComponent(testMemos.HEX)}`);
      expect(actualUrl).toContain('memo_is_hex=true');
    });

    it('should handle API errors', async () => {
      const errorMessage = 'API Error';
      mockedApiClient.get.mockRejectedValueOnce(new Error(errorMessage));

      await expect(composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      })).rejects.toThrow(errorMessage);
    });

    it('should handle BTC sends', async () => {
      const btcParams = {
        destination: mockDestAddress,
        asset: testAssets.BTC,
        quantity: 100000000, // 1 BTC in satoshis
      };

      await composeSend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...btcParams,
      });
      assertComposeUrlCalled(mockedApiClient, 'send', btcParams);
    });
  });

  describe('composeSendOrMPMA', () => {
    const defaultParams = {
      destination: mockDestAddress,
      asset: testAssets.XCP,
      quantity: testQuantities.MEDIUM,
    };

    // composeSendOrMPMA accesses response.result.name, so we need proper ApiResponse structure
    const createApiResponseWithResult = () => ({
      data: { result: createMockComposeResult() },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as any },
    });

    it('should use composeSend for single destination and set result.name to "send"', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());

      const result = await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result.name).toBe('send');
      assertComposeUrlCalled(mockedApiClient, 'send', defaultParams);
    });

    it('should use composeMPMA for multiple destinations and set result.name to "mpma"', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `${mockDestAddress}, bc1qanother, bc1qthird`;

      const result = await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress, // ignored when destinations provided
        destinations,
      });

      expect(result.result.name).toBe('mpma');

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      expect(actualUrl).toContain('/compose/mpma');
      // MPMA uses comma-separated destinations
      expect(actualUrl).toContain('destinations=');
      expect(actualUrl).toContain('bc1qanother');
      expect(actualUrl).toContain('bc1qthird');
    });

    it('should duplicate asset and quantity for each destination in MPMA', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `${mockDestAddress}, bc1qsecond`;

      await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress,
        destinations,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      // Should have same asset for both destinations
      expect(actualUrl).toContain(`assets=${testAssets.XCP}%2C${testAssets.XCP}`);
      // Should have same quantity for both destinations
      expect(actualUrl).toContain(`quantities=${testQuantities.MEDIUM}%2C${testQuantities.MEDIUM}`);
    });

    it('should include memo for each destination in MPMA', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `${mockDestAddress}, bc1qsecond`;

      await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress,
        destinations,
        memo: testMemos.TEXT,
        memo_is_hex: false,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      // Should have memo arrays
      expect(actualUrl).toContain(`memos[]=${encodeURIComponent(testMemos.TEXT)}`);
      expect(actualUrl).toContain('memos_are_hex[]=false');
    });

    it('should treat single destination without comma as regular send', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());

      const result = await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        destinations: mockDestAddress, // Single destination, no comma
      });

      expect(result.result.name).toBe('send');
      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      expect(actualUrl).toContain('/compose/send');
    });

    it('should trim whitespace from destinations', async () => {
      mockedApiClient.get.mockResolvedValue(createApiResponseWithResult());
      const destinations = `  ${mockDestAddress}  ,  bc1qsecond  `;

      await composeSendOrMPMA({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        asset: testAssets.XCP,
        quantity: testQuantities.MEDIUM,
        destination: mockDestAddress,
        destinations,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      // Destinations should be trimmed (MPMA uses comma-separated, not array syntax)
      expect(actualUrl).toContain(`destinations=${encodeURIComponent(mockDestAddress)}%2Cbc1qsecond`);
      // Should not contain extra whitespace
      expect(actualUrl).not.toContain('%20%20');
    });
  });

  describe('composeSweep', () => {
    const defaultParams = {
      destination: mockDestAddress,
      flags: 1,
      memo: testMemos.TEXT,
    };

    it('should compose sweep transaction', async () => {
      const result = await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'sweep', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        allow_unconfirmed_inputs: true,
      };

      await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      expect(actualUrl).toContain('allow_unconfirmed_inputs=true');
    });

    it('should handle empty memo sweep', async () => {
      const noMemoParams = {
        destination: mockDestAddress,
        flags: 1,
      };

      await composeSweep({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...noMemoParams,
      });
      
      const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
      const url = new URL(actualUrl);
      expect(url.searchParams.get('memo')).toBe(''); // Default empty string
    });

    it('should handle different flag values', async () => {
      const flagValues = [1, 2, 3, 4]; // Different sweep flags
      
      for (const flags of flagValues) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, flags };
        await composeSweep({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
        expect(actualUrl).toContain(`flags=${flags}`);
      }
    });
  });

  describe('getSweepEstimateXcpFee', () => {
    it('should get sweep fee estimate', async () => {
      const mockFeeEstimate = 10000000;
      mockedApiClient.get.mockResolvedValueOnce(createMockApiResponse({ result: mockFeeEstimate }));

      const result = await getSweepEstimateXcpFee(mockAddress);

      expect(result).toEqual(mockFeeEstimate);

      const expectedUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/sweep/estimatexcpfees`;
      expect(mockedApiClient.get).toHaveBeenCalledWith(expectedUrl);
    });

    it('should handle error in fee estimation', async () => {
      mockedApiClient.get.mockRejectedValueOnce(new Error('Fee estimation failed'));

      await expect(
        getSweepEstimateXcpFee(mockAddress)
      ).rejects.toThrow('Fee estimation failed');
    });

    it('should use correct API endpoint', async () => {
      const mockFeeEstimate = 10000000;
      mockedApiClient.get.mockResolvedValueOnce(createMockApiResponse({ result: mockFeeEstimate }));

      await getSweepEstimateXcpFee(mockAddress);

      const actualUrl = mockedApiClient.get.mock.calls[0][0];
      expect(actualUrl).toContain('/compose/sweep/estimatexcpfees');
    });
  });

  describe('composeMove', () => {
    const defaultParams = {
      sourceUtxo: 'abc123def456:0',
      destination: mockDestAddress,
    };

    it('should compose move transaction', async () => {
      const result = await composeMove({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      
      // For UTXO-based transactions, check the URL format
      const actualUrl = mockedApiClient.get.mock.calls[0][0];
      expect(actualUrl).toContain(`/v2/utxos/${defaultParams.sourceUtxo}/compose/move`);
      expect(actualUrl).toContain(`destination=${defaultParams.destination}`);
    });


    it('should handle moving all assets', async () => {
      const moveAllParams = {
        sourceUtxo: 'def456ghi789:1',
        destination: mockDestAddress,
      };

      await composeMove({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...moveAllParams,
      });
      const actualUrl = mockedApiClient.get.mock.calls[0][0];
      expect(actualUrl).toContain(`/v2/utxos/${moveAllParams.sourceUtxo}/compose/move`);
      expect(actualUrl).toContain(`destination=${moveAllParams.destination}`);
    });

    it('should handle moving from different UTXOs', async () => {
      const utxos = [
        'utxo1:0',
        'utxo2:1',
        'utxo3:0',
      ];

      for (const sourceUtxo of utxos) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, sourceUtxo };
        await composeMove({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualUrl = mockedApiClient.get.mock.calls[0][0] as string;
        expect(actualUrl).toContain(`/v2/utxos/${sourceUtxo}/compose/move`);
      }
    });

    it('should handle error when moving to same address', async () => {
      const sameAddressParams = {
        sourceUtxo: 'ghi789jkl012:0',
        destination: mockAddress, // Same as source
      };

      mockedApiClient.get.mockRejectedValueOnce(new Error('Cannot move to same address'));

      await expect(
        composeMove({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...sameAddressParams,
        })
      ).rejects.toThrow('Cannot move to same address');
    });
  });
});