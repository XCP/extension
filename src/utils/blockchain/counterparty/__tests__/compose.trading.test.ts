import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composeOrder, composeCancel, composeDispenser, composeDispense } from '../compose';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import * as axiosUtils from '@/utils/axios';
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
vi.mock('@/utils/axios');
vi.mock('@/utils/storage/settingsStorage');

const mockedApiClient = vi.mocked(axiosUtils.apiClient, true);
const mockedGetSettings = vi.mocked(settingsStorage.getSettings);

describe('Compose Trading Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockResolvedValue(mockSettings as any);
    // Mock both get and post methods since different functions may use different HTTP methods
    mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
    mockedApiClient.post.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
  });

  describe('composeOrder', () => {
    const defaultParams = {
      give_asset: testAssets.XCP,
      give_quantity: testQuantities.MEDIUM,
      get_asset: testAssets.BTC,
      get_quantity: 10000000, // 0.1 BTC
      expiration: 100,
      fee_required: 0,
    };

    it('should compose order transaction with required parameters', async () => {
      const result = await composeOrder({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'order', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        fee_provided: 1000,
        use_fee_decimal_format: true,
        skip_validation: true,
      };

      const result = await composeOrder({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      expect(result).toEqual(createMockComposeResult());
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should handle sell orders (give XCP, get BTC)', async () => {
      const sellParams = {
        give_asset: testAssets.XCP,
        give_quantity: 100000000,
        get_asset: testAssets.BTC,
        get_quantity: 10000000,
        expiration: 100,
        fee_required: 0,
      };

      await composeOrder({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...sellParams,
      });
      assertComposeUrlCalled(mockedApiClient, 'order', sellParams);
    });

    it('should handle buy orders (give BTC, get XCP)', async () => {
      const buyParams = {
        give_asset: testAssets.BTC,
        give_quantity: 10000000,
        get_asset: testAssets.XCP,
        get_quantity: 100000000,
        expiration: 100,
        fee_required: 0,
      };

      await composeOrder({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...buyParams,
      });
      assertComposeUrlCalled(mockedApiClient, 'order', buyParams);
    });

    it('should handle asset-to-asset trades', async () => {
      const assetTradeParams = {
        give_asset: testAssets.DIVISIBLE,
        give_quantity: 50000000,
        get_asset: testAssets.INDIVISIBLE,
        get_quantity: 10,
        expiration: 200,
        fee_required: 0,
      };

      await composeOrder({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...assetTradeParams,
      });
      assertComposeUrlCalled(mockedApiClient, 'order', assetTradeParams);
    });

    it('should handle zero expiration (fill or kill)', async () => {
      const fillOrKillParams = {
        ...defaultParams,
        expiration: 0,
      };

      await composeOrder({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...fillOrKillParams,
      });
      
      // Check if apiClient.get was called with query parameters
      const actualUrl = mockedApiClient.get.mock.calls[0][0];
      const url = new URL(actualUrl);
      expect(url.searchParams.get('expiration')).toBe('0');
    });
  });

  describe('composeCancel', () => {
    const defaultParams = {
      offer_hash: 'abc123def456...',
    };

    it('should compose cancel transaction', async () => {
      const result = await composeCancel({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'cancel', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        skip_validation: true,
      };

      const result = await composeCancel({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      expect(result).toEqual(createMockComposeResult());
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should handle multiple offer hashes', async () => {
      const hashes = ['hash1', 'hash2', 'hash3'];

      for (const offer_hash of hashes) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        mockedApiClient.post.mockResolvedValue(createMockApiResponse(createMockComposeResult()));

        const result = await composeCancel({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          offer_hash,
        });

        expect(result).toEqual(createMockComposeResult());
        expect(mockedApiClient.get).toHaveBeenCalled();
      }
    });

    it('should handle invalid offer hash error', async () => {
      // Clear previous mocks and set up error mock
      vi.clearAllMocks();
      mockedGetSettings.mockResolvedValue(mockSettings as any);
      const error = new Error('Invalid offer hash');
      mockedApiClient.get.mockRejectedValueOnce(error);

      await expect(
        composeCancel({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...defaultParams,
        })
      ).rejects.toThrow('Invalid offer hash');
    });
  });

  describe('composeDispenser', () => {
    const defaultParams = {
      asset: testAssets.XCP,
      give_quantity: 1000000,
      escrow_quantity: 100000000,
      mainchainrate: 100,
      status: '0', // 0 = open, 10 = close
    };

    it('should compose dispenser transaction', async () => {
      const result = await composeDispenser({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'dispenser', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        open_address: 'bc1qopenaddress',
        oracle_address: 'bc1qoracleaddress',
        skip_validation: true,
      };

      const result = await composeDispenser({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      expect(result).toEqual(createMockComposeResult());
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should handle opening a dispenser', async () => {
      const openParams = {
        ...defaultParams,
        status: '0', // Open
      };

      const result = await composeDispenser({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...openParams,
      });

      expect(result).toEqual(createMockComposeResult());
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should handle closing a dispenser', async () => {
      const closeParams = {
        ...defaultParams,
        status: '10', // Close
      };

      const result = await composeDispenser({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...closeParams,
      });

      expect(result).toEqual(createMockComposeResult());
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should handle different mainchain rates', async () => {
      const rates = [100, 1000, 10000, 100000];

      for (const mainchainrate of rates) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        mockedApiClient.post.mockResolvedValue(createMockApiResponse(createMockComposeResult()));

        const params = { ...defaultParams, mainchainrate };
        const result = await composeDispenser({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        expect(result).toEqual(createMockComposeResult());
        expect(mockedApiClient.get).toHaveBeenCalled();
      }
    });
  });

  describe('composeDispense', () => {
    const defaultParams = {
      dispenser: 'bc1qdispenser123',
      quantity: 1000000,
    };

    it('should compose dispense transaction', async () => {
      const result = await composeDispense({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'dispense', defaultParams);
    });

    it('should include optional parameters', async () => {
      const optionalParams = {
        skip_validation: true,
      };

      const result = await composeDispense({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
        ...optionalParams,
      });

      expect(result).toEqual(createMockComposeResult());
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should handle different quantities', async () => {
      const quantities = [100, 1000, 10000, 100000];

      for (const quantity of quantities) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        mockedApiClient.post.mockResolvedValue(createMockApiResponse(createMockComposeResult()));

        const params = { ...defaultParams, quantity };
        const result = await composeDispense({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        expect(result).toEqual(createMockComposeResult());
        expect(mockedApiClient.get).toHaveBeenCalled();
      }
    });

    it('should handle dispense from different addresses', async () => {
      const dispensers = ['bc1qdispenser1', 'bc1qdispenser2', 'bc1qdispenser3'];

      for (const dispenser of dispensers) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockApiResponse(createMockComposeResult()));
        mockedApiClient.post.mockResolvedValue(createMockApiResponse(createMockComposeResult()));

        const params = { ...defaultParams, dispenser };
        const result = await composeDispense({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        expect(result).toEqual(createMockComposeResult());
        expect(mockedApiClient.get).toHaveBeenCalled();
      }
    });

    it('should handle insufficient BTC error', async () => {
      // Clear previous mocks and set up error mock
      vi.clearAllMocks();
      mockedGetSettings.mockResolvedValue(mockSettings as any);
      const error = new Error('Insufficient BTC for dispense');
      mockedApiClient.get.mockRejectedValueOnce(error);

      await expect(
        composeDispense({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...defaultParams,
        })
      ).rejects.toThrow('Insufficient BTC for dispense');
    });
  });
});