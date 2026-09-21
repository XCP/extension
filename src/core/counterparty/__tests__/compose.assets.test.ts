import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientUtils from '@/core/api/client';
import { asBaseUnits } from '@/core/numeric';
import { getActiveSettings } from '@/core/settings';
import {
  composeBurn, 
  composeDestroy,
  composeDividend,
  composeIssuance
} from '../compose';
import {
  assertComposeUrlCalled,
  createMockComposeResponse,
  createMockComposeResult,
  mockAddress,
  mockSatPerVbyte,
  mockSettings,
  testAssets,
  testQuantities,
} from './helpers/composeTestHelpers';

// Mock dependencies
vi.mock('@/core/api/client');
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: vi.fn().mockReturnValue(actual.DEFAULT_SETTINGS) };
});

// Mock UTXO selection to prevent real API calls to mempool.space.
// The txid is spelled out rather than imported as `mockInputTxid`: this factory is hoisted
// above the imports and cannot read them. It must stay in step with the composed transaction
// in composeTestHelpers, or the input check has nothing to match and stops testing anything.
vi.mock('@/core/counterparty/utxoSelection', () => ({
  selectUtxosForTransaction: vi.fn().mockResolvedValue({
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    inputsSet: `${'aa'.repeat(32)}:0`,
    totalValue: 100000,
    excludedWithAssets: 0,
  }),
}));

const mockedApiClient = vi.mocked(apiClientUtils.apiClient, true);
const mockedGetSettings = vi.mocked(getActiveSettings);

describe('Compose Asset Management Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSettings.mockReturnValue(mockSettings as any);
    mockedApiClient.get.mockResolvedValue(createMockComposeResponse());
  });

  describe('composeIssuance', () => {
    const defaultParams = {
      asset: 'NEWASSET',
      quantity: asBaseUnits(1000000000),
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'issuance', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('transfer_destination=bc1qtransferaddr');
      expect(actualUrl).toContain('divisible=true');
      expect(actualUrl).toContain('lock=false');
      expect(actualUrl).toContain('reset=false');
    });

    it('should handle subasset issuance', async () => {
      const subassetParams = {
        asset: 'PARENTASSET.SUBASSET',
        quantity: asBaseUnits(100000),
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
      assertComposeUrlCalled(mockedApiClient, 'issuance', subassetParams);
    });

    it('should handle numeric asset issuance', async () => {
      const numericParams = {
        asset: testAssets.NUMERIC,
        quantity: asBaseUnits(1000000000),
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
      assertComposeUrlCalled(mockedApiClient, 'issuance', numericParams);
    });

    it('should handle locking an asset', async () => {
      const lockParams = {
        ...defaultParams,
        quantity: asBaseUnits(0), // No new issuance
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('lock=true');
      expect(actualUrl).toContain('quantity=0');
    });

    it('should handle transfer of ownership', async () => {
      const transferParams = {
        asset: 'EXISTINGASSET',
        quantity: asBaseUnits(0),
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
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

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'destroy', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const actualUrl = actualCall[0];
      expect(actualUrl).toContain('tag=destruction-tag');
    });

    it('should handle destroying different assets', async () => {
      const assets = [testAssets.XCP, testAssets.DIVISIBLE, testAssets.INDIVISIBLE];

      for (const asset of assets) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, asset };
        await composeDestroy({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`asset=${asset}`);
      }
    });

    it('should handle different quantities', async () => {
      const quantities = [100, 1000000, 1000000000];

      for (const quantity of quantities) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, quantity };
        await composeDestroy({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`quantity=${quantity}`);
      }
    });
  });

  describe('composeDividend', () => {
    const defaultParams = {
      asset: 'SHARETOKEN',
      dividend_asset: testAssets.XCP,
      quantity_per_unit: asBaseUnits(1000),
    };

    it('should compose dividend transaction', async () => {
      const result = await composeDividend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'dividend', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const actualUrl = actualCall[0];
      // `skip_validation` is declared on the options type but never forwarded (compose.ts only
      // names it in the interface), so passing it changes nothing about the request. Asserted as
      // absent rather than left unasserted, which is how this test came to check nothing at all.
      expect(actualUrl).not.toContain('skip_validation');
      expect(actualUrl).toContain('compose/dividend');
    });

    it('should handle BTC dividends', async () => {
      const btcDividendParams = {
        asset: 'SHARETOKEN',
        dividend_asset: testAssets.BTC,
        quantity_per_unit: asBaseUnits(100), // 100 satoshis per unit
      };

      await composeDividend({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...btcDividendParams,
      });
      assertComposeUrlCalled(mockedApiClient, 'dividend', btcDividendParams);
    });

    it('should handle different dividend rates', async () => {
      const rates = [10, 100, 1000, 10000];

      for (const quantity_per_unit of rates) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        const params = { ...defaultParams, quantity_per_unit };
        await composeDividend({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...params,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`quantity_per_unit=${quantity_per_unit}`);
      }
    });
  });

  describe('composeBurn', () => {
    const defaultParams = {
      quantity: asBaseUnits(10000000), // 0.1 BTC
    };

    it('should compose burn transaction', async () => {
      const result = await composeBurn({
        sourceAddress: mockAddress,
        sat_per_vbyte: mockSatPerVbyte,
        ...defaultParams,
      });

      expect(result.result).toEqual(createMockComposeResult());
      assertComposeUrlCalled(mockedApiClient, 'burn', defaultParams);
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

      const actualCall = mockedApiClient.get.mock.calls[0]!;
      const actualUrl = actualCall[0];
      // See the dividend case above: `skip_validation` never reaches the wire.
      expect(actualUrl).not.toContain('skip_validation');
      expect(actualUrl).toContain('compose/burn');
    });

    it('should handle different burn amounts', async () => {
      const amounts = [100000, 1000000, 10000000, 100000000];

      for (const quantity of amounts) {
        vi.clearAllMocks();
        mockedApiClient.get.mockResolvedValue(createMockComposeResponse());

        await composeBurn({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          quantity,
        });

        const actualCall = mockedApiClient.get.mock.calls[0]!;
        const actualUrl = actualCall[0];
        expect(actualUrl).toContain(`quantity=${quantity}`);
      }
    });

    it('should handle minimum burn amount error', async () => {
      const smallAmount = { quantity: asBaseUnits(100) }; // Too small

      mockedApiClient.get.mockRejectedValueOnce(new Error('Burn amount below minimum'));

      await expect(
        composeBurn({
          sourceAddress: mockAddress,
          sat_per_vbyte: mockSatPerVbyte,
          ...smallAmount,
        })
      ).rejects.toThrow('Burn amount below minimum');
    });

    it('should handle insufficient BTC error', async () => {
      mockedApiClient.get.mockRejectedValueOnce(new Error('Insufficient BTC for burn'));

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
