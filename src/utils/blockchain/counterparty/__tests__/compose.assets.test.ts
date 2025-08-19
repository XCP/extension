import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { 
  composeIssuance, 
  composeDestroy, 
  composeDividend,
  getDividendEstimateXcpFee,
  composeBurn 
} from '../compose';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import {
  mockAddress,
  mockApiBase,
  mockSettings,
  mockSatPerVbyte,
  createMockComposeResult,
  createMockApiResponse,
  assertComposeUrlCalled,
  testAssets,
  testQuantities,
} from './helpers/composeTestHelpers';

// Mock dependencies
vi.mock('axios');
vi.mock('@/utils/storage/settingsStorage');

const mockedAxios = vi.mocked(axios, true);
const mockedGetKeychainSettings = vi.mocked(settingsStorage.getKeychainSettings);

describe('Compose Asset Management Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetKeychainSettings.mockResolvedValue(mockSettings as any);
    mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
  });

  describe('composeIssuance', () => {
    const defaultParams = {
      asset: 'NEWASSET',
      quantity: 1000000000,
      divisible: true,
      lock: false,
      reset: false,
      description: 'Test Asset Description',
    };

    it('should compose issuance transaction with required parameters', async () => {
      const result = await composeIssuance({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'issuance', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        transfer_destination: 'bc1qtransferaddr',
        divisible: true,
        lock: false,
        reset: false,
        skip_validation: true,
      };

      await composeIssuance({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('transfer_destination=bc1qtransferaddr');
      expect(actualUrl).toContain('divisible=true');
      expect(actualUrl).toContain('lock=false');
      expect(actualUrl).toContain('reset=false');
    });

    it('should handle subasset issuance', async () => {
      const subassetParams = {
        asset: 'PARENTASSET.SUBASSET',
        quantity: 100000,
        divisible: true,
        lock: false,
        reset: false,
        description: 'Subasset Description',
      };

      await composeIssuance({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...subassetParams,
      });
      assertComposeUrlCalled(mockedAxios, 'issuance', subassetParams);
    });

    it('should handle numeric asset issuance', async () => {
      const numericParams = {
        asset: testAssets.NUMERIC,
        quantity: 1000000000,
        divisible: true,
        lock: false,
        reset: false,
        description: 'Numeric Asset',
      };

      await composeIssuance({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...numericParams,
      });
      assertComposeUrlCalled(mockedAxios, 'issuance', numericParams);
    });

    it('should handle locking an asset', async () => {
      const lockParams = {
        ...defaultParams,
        quantity: 0, // No new issuance
        lock: true,
      };
      
      const optionalParams = {
        lock: true,
      };

      await composeIssuance({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...lockParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('lock=true');
      expect(actualUrl).toContain('quantity=0');
    });

    it('should handle transfer of ownership', async () => {
      const transferParams = {
        asset: 'EXISTINGASSET',
        quantity: 0,
        divisible: true,
        lock: false,
        reset: false,
        description: '',
      };
      
      const optionalParams = {
        transfer_destination: 'bc1qnewowner',
      };

      await composeIssuance({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...transferParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('transfer_destination=bc1qnewowner');
      expect(actualUrl).toContain('quantity=0');
    });
  });

  describe('composeDestroy', () => {
    const defaultParams = {
      asset: testAssets.XCP,
      quantity: testQuantities.MEDIUM,
    };

    it('should compose destroy transaction', async () => {
      const result = await composeDestroy({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'destroy', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        tag: 'destruction-tag',
        skip_validation: true,
      };

      await composeDestroy({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('tag=destruction-tag');
    });

    it('should handle destroying different assets', async () => {
      const assets = [testAssets.XCP, testAssets.DIVISIBLE, testAssets.INDIVISIBLE];
      
      for (const asset of assets) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, asset };
        await composeDestroy({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`asset=${asset}`);
      }
    });

    it('should handle different quantities', async () => {
      const quantities = [100, 1000000, 1000000000];
      
      for (const quantity of quantities) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, quantity };
        await composeDestroy({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`quantity=${quantity}`);
      }
    });
  });

  describe('composeDividend', () => {
    const defaultParams = {
      asset: 'SHARETOKEN',
      dividend_asset: testAssets.XCP,
      quantity_per_unit: 1000,
    };

    it('should compose dividend transaction', async () => {
      const result = await composeDividend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'dividend', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        skip_validation: true,
      };

      await composeDividend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const actualUrl = actualCall[0];
    });

    it('should handle BTC dividends', async () => {
      const btcDividendParams = {
        asset: 'SHARETOKEN',
        dividend_asset: testAssets.BTC,
        quantity_per_unit: 100, // 100 satoshis per unit
      };

      await composeDividend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...btcDividendParams,
      });
      assertComposeUrlCalled(mockedAxios, 'dividend', btcDividendParams);
    });

    it('should handle different dividend rates', async () => {
      const rates = [10, 100, 1000, 10000];
      
      for (const quantity_per_unit of rates) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        const params = { ...defaultParams, quantity_per_unit };
        await composeDividend({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`quantity_per_unit=${quantity_per_unit}`);
      }
    });
  });

  describe('getDividendEstimateXcpFee', () => {
    it('should get dividend fee estimate', async () => {
      const mockFeeEstimate = { result: 50000000 };
      mockedAxios.get.mockResolvedValueOnce({ data: mockFeeEstimate });

      const result = await getDividendEstimateXcpFee(mockAddress, 'SHARETOKEN');

      expect(result).toBe(50000000);
      
      const expectedUrl = `${mockApiBase}/v2/addresses/${mockAddress}/compose/dividend/estimatexcpfees`;
      const actualCall = mockedAxios.get.mock.calls[0];
      expect(actualCall[0]).toContain(expectedUrl);
      expect(actualCall[0]).toContain('asset=SHARETOKEN');
    });

    it('should handle fee estimation errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Fee estimation failed'));

      await expect(
        getDividendEstimateXcpFee(mockAddress, 'SHARETOKEN')
      ).rejects.toThrow('Fee estimation failed');
    });
  });

  describe('composeBurn', () => {
    const defaultParams = {
      quantity: 10000000, // 0.1 BTC
    };

    it('should compose burn transaction', async () => {
      const result = await composeBurn({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedAxios, 'burn', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        skip_validation: true,
      };

      await composeBurn({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      const actualCall = mockedAxios.get.mock.calls[0];
      const actualUrl = actualCall[0];
    });

    it('should handle different burn amounts', async () => {
      const amounts = [100000, 1000000, 10000000, 100000000];
      
      for (const quantity of amounts) {
        vi.clearAllMocks();
        mockedAxios.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        
        await composeBurn({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          quantity,
        });
        
        const actualCall = mockedAxios.get.mock.calls[0];
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`quantity=${quantity}`);
      }
    });

    it('should handle minimum burn amount error', async () => {
      const smallAmount = { quantity: 100 }; // Too small
      
      mockedAxios.get.mockRejectedValueOnce(new Error('Burn amount below minimum'));

      await expect(
        composeBurn({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...smallAmount,
        })
      ).rejects.toThrow('Burn amount below minimum');
    });

    it('should handle insufficient BTC error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Insufficient BTC for burn'));

      await expect(
        composeBurn({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...defaultParams,
        })
      ).rejects.toThrow('Insufficient BTC for burn');
    });
  });
});