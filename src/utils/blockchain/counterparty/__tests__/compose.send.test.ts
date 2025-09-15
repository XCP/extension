import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/utils/api-client';
import { composeSend, composeSweep, getSweepEstimateXcpFee, composeMove } from '../compose';
import * as settingsStorage from '@/utils/storage/settingsStorage';
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
vi.mock('@/utils/api-client');
vi.mock('@/utils/storage/settingsStorage');

const mockedApi = vi.mocked(api, true);
const mockedGetKeychainSettings = vi.mocked(settingsStorage.getKeychainSettings);

describe('Compose Send Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetKeychainSettings.mockResolvedValue(mockSettings as any);
    mockedApi.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
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
      assertComposeUrlCalled(mockedApi, 'send', defaultParams);
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

      const actualUrl = mockedApi.get.mock.calls[0][0] as string;
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

      const actualUrl = mockedApi.get.mock.calls[0][0] as string;
      expect(actualUrl).toContain(`memo=${encodeURIComponent(testMemos.HEX)}`);
      expect(actualUrl).toContain('memo_is_hex=true');
    });

    it('should handle API errors', async () => {
      const errorMessage = 'API Error';
      mockedApi.get.mockRejectedValueOnce(new Error(errorMessage));

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
      assertComposeUrlCalled(mockedApi, 'send', btcParams);
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
      assertComposeUrlCalled(mockedApi, 'sweep', defaultParams);
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

      const actualUrl = mockedApi.get.mock.calls[0][0] as string;
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
      
      const actualUrl = mockedApi.get.mock.calls[0][0] as string;
      const url = new URL(actualUrl);
      expect(url.searchParams.get('memo')).toBe(''); // Default empty string
    });

    it('should handle different flag values', async () => {
      const flagValues = [1, 2, 3, 4]; // Different sweep flags
      
      for (const flags of flagValues) {
        vi.clearAllMocks();
        mockedApi.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, flags };
        await composeSweep({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualUrl = mockedApi.get.mock.calls[0][0] as string;
        expect(actualUrl).toContain(`flags=${flags}`);
      }
    });
  });

  describe('getSweepEstimateXcpFee', () => {
    it('should get sweep fee estimate', async () => {
      const mockFeeEstimate = 10000000;
      mockedApi.get.mockResolvedValueOnce({ data: { result: mockFeeEstimate } });

      const result = await getSweepEstimateXcpFee(mockAddress);

      expect(result).toEqual(mockFeeEstimate);
      
      const expectedUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/sweep/estimatexcpfees`;
      expect(mockedApi.get).toHaveBeenCalledWith(expectedUrl);
    });

    it('should handle error in fee estimation', async () => {
      mockedApi.get.mockRejectedValueOnce(new Error('Fee estimation failed'));

      await expect(
        getSweepEstimateXcpFee(mockAddress)
      ).rejects.toThrow('Fee estimation failed');
    });

    it('should use correct API endpoint', async () => {
      const mockFeeEstimate = 10000000;
      mockedApi.get.mockResolvedValueOnce({ data: { result: mockFeeEstimate } });

      await getSweepEstimateXcpFee(mockAddress);

      const actualUrl = mockedApi.get.mock.calls[0][0];
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
      const actualUrl = mockedApi.get.mock.calls[0][0];
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
      const actualUrl = mockedApi.get.mock.calls[0][0];
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
        mockedApi.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, sourceUtxo };
        await composeMove({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualUrl = mockedApi.get.mock.calls[0][0] as string;
        expect(actualUrl).toContain(`/v2/utxos/${sourceUtxo}/compose/move`);
      }
    });

    it('should handle error when moving to same address', async () => {
      const sameAddressParams = {
        sourceUtxo: 'ghi789jkl012:0',
        destination: mockAddress, // Same as source
      };

      mockedApi.get.mockRejectedValueOnce(new Error('Cannot move to same address'));

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