import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { denormalizeProviderData, getComposeTypeFromProvider } from '../denormalize';
import type { AssetInfo } from '../api';
import * as api from '../api';
import * as numeric from '@/utils/numeric';

// Mock the API module
vi.mock('../api', () => ({
  fetchAssetDetails: vi.fn(),
}));

// Mock the numeric module
vi.mock('@/utils/numeric', () => ({
  fromSatoshis: vi.fn(),
}));

const mockFetchAssetDetails = vi.mocked(api.fetchAssetDetails);
const mockFromSatoshis = vi.mocked(numeric.fromSatoshis);

describe('denormalize.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default fromSatoshis mock behavior
    (mockFromSatoshis.mockImplementation as any)((value: any, options?: any) => {
      const num = parseFloat(value.toString());
      const result = (num / 100000000).toFixed(8);
      if (options?.asNumber === true || options === true) {
        return parseFloat(result);
      }
      if (options?.removeTrailingZeros) {
        return result.replace(/\.?0+$/, '');
      }
      return result;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getComposeTypeFromProvider', () => {
    it('should detect order type from give_asset and get_asset fields', () => {
      const params = { give_asset: 'BTC', get_asset: 'XCP' };
      expect(getComposeTypeFromProvider(params)).toBe('order');
    });

    it('should detect dividend type from dividend_asset field', () => {
      const params = { dividend_asset: 'XCP' };
      expect(getComposeTypeFromProvider(params)).toBe('dividend');
    });

    it('should detect dispenser type from escrow_quantity and mainchainrate fields', () => {
      const params = { escrow_quantity: '1000', mainchainrate: '100000' };
      expect(getComposeTypeFromProvider(params)).toBe('dispenser');
    });

    it('should detect dispense type from dispenser and quantity fields', () => {
      const params = { dispenser: 'dispenser_hash', quantity: '100' };
      expect(getComposeTypeFromProvider(params)).toBe('dispense');
    });

    it('should detect sweep type from flags and destination without quantity', () => {
      const params = { flags: 1, destination: 'address123' };
      expect(getComposeTypeFromProvider(params)).toBe('sweep');
    });

    it('should detect btcpay type from order_match_id field', () => {
      const params = { order_match_id: 'match123' };
      expect(getComposeTypeFromProvider(params)).toBe('btcpay');
    });

    it('should detect cancel type from offer_hash field', () => {
      const params = { offer_hash: 'hash123' };
      expect(getComposeTypeFromProvider(params)).toBe('cancel');
    });

    it('should detect broadcast type from text field without asset', () => {
      const params = { text: 'Hello World' };
      expect(getComposeTypeFromProvider(params)).toBe('broadcast');
    });

    it('should detect send type from quantity, asset, and destination fields', () => {
      const params = { quantity: '1500000000', asset: 'XCP', destination: 'address123' };
      expect(getComposeTypeFromProvider(params)).toBe('send');
    });

    it('should detect issuance type from quantity, asset, and divisible fields', () => {
      const params = { quantity: '1000000000', asset: 'MYTOKEN', divisible: true };
      expect(getComposeTypeFromProvider(params)).toBe('issuance');
    });

    it('should detect destroy type from quantity, asset, and tag fields', () => {
      const params = { quantity: '1000000000', asset: 'XCP', tag: 'burn' };
      expect(getComposeTypeFromProvider(params)).toBe('destroy');
    });

    it('should detect attach type from quantity, asset, and source_utxo fields', () => {
      const params = { quantity: '1000000000', asset: 'XCP', source_utxo: 'utxo123' };
      expect(getComposeTypeFromProvider(params)).toBe('attach');
    });

    it('should default to send for quantity and asset without other hints', () => {
      const params = { quantity: '1500000000', asset: 'XCP' };
      expect(getComposeTypeFromProvider(params)).toBe('send');
    });

    it('should return undefined for unknown provider data', () => {
      const params = { unknown_field: 'value' };
      expect(getComposeTypeFromProvider(params)).toBeUndefined();
    });
  });

  describe('denormalizeProviderData', () => {
    describe('BTC asset denormalization', () => {
      it('should denormalize BTC amounts using fromSatoshis', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('150000000', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('1.5');
        expect(result.assetInfoCache.size).toBe(0); // BTC doesn't need asset info
      });

      it('should handle mainchainrate field for BTC in dispenser', async () => {
        const providerData = {
          give_quantity: '10000000000',
          asset: 'MYTOKEN',
          escrow_quantity: '50000000000',
          mainchainrate: '100000'
        };

        const mockAsset: AssetInfo = {
          asset: 'MYTOKEN',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis.mockReturnValue('0.001' as any);

        const result = await denormalizeProviderData(providerData, 'dispenser');

        // mainchainrate should be denormalized as BTC
        expect(mockFromSatoshis).toHaveBeenCalledWith('100000', { removeTrailingZeros: true });
        expect(result.denormalizedData.mainchainrate).toBe('0.001');
        expect(result.denormalizedData.give_quantity).toBe('10000000000'); // Indivisible asset
        expect(result.denormalizedData.escrow_quantity).toBe('50000000000'); // Indivisible asset
      });

      it('should handle zero BTC amounts', async () => {
        const providerData = {
          quantity: '0',
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('0' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('0', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('0');
      });

      it('should handle very large BTC amounts', async () => {
        const providerData = {
          quantity: '2100000000000000', // 21M BTC in satoshis
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('21000000' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('2100000000000000', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('21000000');
      });
    });

    describe('XCP asset denormalization', () => {
      it('should denormalize XCP amounts using fromSatoshis (always divisible)', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'XCP'
        };

        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('150000000', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('1.5');
        expect(result.assetInfoCache.size).toBe(0); // XCP doesn't need asset info fetch
      });

      it('should handle XCP burn scenario', async () => {
        const providerData = {
          quantity: '50000000'
        };

        mockFromSatoshis.mockReturnValue('0.5' as any);

        const result = await denormalizeProviderData(providerData, 'burn');

        expect(mockFromSatoshis).toHaveBeenCalledWith('50000000', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('0.5');
      });
    });

    describe('Divisible asset denormalization', () => {
      const mockDivisibleAsset: AssetInfo = {
        asset: 'PEPECASH',
        asset_longname: null,
        divisible: true,
        locked: false,
        supply_normalized: '500000.00000000'
      };

      it('should denormalize divisible asset amounts using fromSatoshis', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'PEPECASH'
        };

        mockFetchAssetDetails.mockResolvedValue(mockDivisibleAsset);
        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('PEPECASH');
        expect(mockFromSatoshis).toHaveBeenCalledWith('150000000', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('1.5');
        expect(result.assetInfoCache.get('PEPECASH')).toEqual(mockDivisibleAsset);
      });

      it('should handle multiple divisible assets in order', async () => {
        const providerData = {
          give_quantity: '250000000',
          give_asset: 'PEPECASH',
          get_quantity: '100000',
          get_asset: 'ANOTHERDIV'
        };

        const mockAnotherDiv: AssetInfo = {
          asset: 'ANOTHERDIV',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails
          .mockResolvedValueOnce(mockDivisibleAsset)
          .mockResolvedValueOnce(mockAnotherDiv);

        mockFromSatoshis
          .mockReturnValueOnce('2.5' as any)
          .mockReturnValueOnce('0.001' as any);

        const result = await denormalizeProviderData(providerData, 'order');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('PEPECASH');
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('ANOTHERDIV');
        expect(result.denormalizedData.give_quantity).toBe('2.5');
        expect(result.denormalizedData.get_quantity).toBe('0.001');
        expect(result.assetInfoCache.size).toBe(2);
      });

      it('should handle very small divisible amounts (1 satoshi)', async () => {
        const providerData = {
          quantity: '1',
          asset: 'PEPECASH'
        };

        mockFetchAssetDetails.mockResolvedValue(mockDivisibleAsset);
        mockFromSatoshis.mockReturnValue('0.00000001' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('1', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('0.00000001');
      });

      it('should handle maximum precision divisible amounts', async () => {
        const providerData = {
          quantity: '99999999', // 0.99999999 in user format
          asset: 'PEPECASH'
        };

        mockFetchAssetDetails.mockResolvedValue(mockDivisibleAsset);
        mockFromSatoshis.mockReturnValue('0.99999999' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('99999999', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('0.99999999');
      });
    });

    describe('Indivisible asset denormalization', () => {
      const mockIndivisibleAsset: AssetInfo = {
        asset: 'INDIVISIBLE',
        asset_longname: null,
        divisible: false,
        locked: false,
        supply_normalized: '1000'
      };

      it('should not modify indivisible asset amounts', async () => {
        const providerData = {
          quantity: '150',
          asset: 'INDIVISIBLE'
        };

        mockFetchAssetDetails.mockResolvedValue(mockIndivisibleAsset);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('INDIVISIBLE');
        expect(mockFromSatoshis).not.toHaveBeenCalled();
        expect(result.denormalizedData.quantity).toBe('150');
        expect(result.assetInfoCache.get('INDIVISIBLE')).toEqual(mockIndivisibleAsset);
      });

      it('should handle mixed divisible and indivisible assets in order', async () => {
        const providerData = {
          give_quantity: '100',
          give_asset: 'INDIVISIBLE',
          get_quantity: '150000000',
          get_asset: 'XCP'
        };

        mockFetchAssetDetails.mockResolvedValue(mockIndivisibleAsset);
        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'order');

        expect(result.denormalizedData.give_quantity).toBe('100'); // Not denormalized
        expect(result.denormalizedData.get_quantity).toBe('1.5'); // Denormalized (XCP)
        expect(mockFromSatoshis).toHaveBeenCalledTimes(1);
        expect(mockFromSatoshis).toHaveBeenCalledWith('150000000', { removeTrailingZeros: true });
      });

      it('should handle very large indivisible amounts', async () => {
        const providerData = {
          quantity: '18446744073709551615', // Near uint64 max
          asset: 'INDIVISIBLE'
        };

        mockFetchAssetDetails.mockResolvedValue(mockIndivisibleAsset);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('18446744073709551615');
        expect(mockFromSatoshis).not.toHaveBeenCalled();
      });

      it('should handle zero indivisible amounts', async () => {
        const providerData = {
          quantity: '0',
          asset: 'INDIVISIBLE'
        };

        mockFetchAssetDetails.mockResolvedValue(mockIndivisibleAsset);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('0');
        expect(mockFromSatoshis).not.toHaveBeenCalled();
      });
    });

    describe('Asset info caching', () => {
      const mockAsset: AssetInfo = {
        asset: 'CACHED',
        asset_longname: null,
        divisible: true,
        locked: false,
        supply_normalized: '1000000.00000000'
      };

      it('should cache asset info and reuse it for subsequent calls', async () => {
        const providerData = {
          give_quantity: '100000000',
          give_asset: 'CACHED',
          get_quantity: '200000000',
          get_asset: 'CACHED'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis
          .mockReturnValueOnce('1' as any)
          .mockReturnValueOnce('2' as any);

        const result = await denormalizeProviderData(providerData, 'order');

        expect(mockFetchAssetDetails).toHaveBeenCalledTimes(1);
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('CACHED');
        expect(result.assetInfoCache.get('CACHED')).toEqual(mockAsset);
        expect(result.denormalizedData.give_quantity).toBe('1');
        expect(result.denormalizedData.get_quantity).toBe('2');
      });

      it('should handle multiple different assets and cache them separately', async () => {
        const providerData = {
          give_quantity: '100000000',
          give_asset: 'ASSET1',
          get_quantity: '200',
          get_asset: 'ASSET2'
        };

        const mockAsset1: AssetInfo = {
          asset: 'ASSET1',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        const mockAsset2: AssetInfo = {
          asset: 'ASSET2',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails
          .mockResolvedValueOnce(mockAsset1)
          .mockResolvedValueOnce(mockAsset2);

        mockFromSatoshis.mockReturnValue('1' as any);

        const result = await denormalizeProviderData(providerData, 'order');

        expect(mockFetchAssetDetails).toHaveBeenCalledTimes(2);
        expect(result.assetInfoCache.get('ASSET1')).toEqual(mockAsset1);
        expect(result.assetInfoCache.get('ASSET2')).toEqual(mockAsset2);
        expect(result.denormalizedData.give_quantity).toBe('1'); // Divisible
        expect(result.denormalizedData.get_quantity).toBe('200'); // Indivisible
      });
    });

    describe('API error handling', () => {
      it('should handle API fetch errors gracefully', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'UNKNOWN'
        };

        mockFetchAssetDetails.mockRejectedValue(new Error('Asset not found'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('UNKNOWN');
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to fetch asset info for UNKNOWN:',
          expect.any(Error)
        );
        expect(result.denormalizedData.quantity).toBe('150000000'); // Not denormalized due to error
        expect(result.assetInfoCache.get('UNKNOWN')).toBeNull();

        consoleSpy.mockRestore();
      });

      it('should handle null asset info response', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'NULLASSET'
        };

        mockFetchAssetDetails.mockResolvedValue(null);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('150000000'); // Not denormalized
        expect(result.assetInfoCache.get('NULLASSET')).toBeNull();
      });

      it('should handle asset info with undefined divisible property', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'UNDEFINED_DIVISIBLE'
        };

        const mockAsset: AssetInfo = {
          asset: 'UNDEFINED_DIVISIBLE',
          asset_longname: null,
          divisible: undefined as any, // Force undefined
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('150000000'); // Not denormalized due to undefined divisible
        expect(mockFromSatoshis).not.toHaveBeenCalled();
      });

      it('should handle multiple API errors in single call', async () => {
        const providerData = {
          give_quantity: '100000000',
          give_asset: 'ERROR1',
          get_quantity: '200000000',
          get_asset: 'ERROR2'
        };

        mockFetchAssetDetails
          .mockRejectedValueOnce(new Error('Asset 1 not found'))
          .mockRejectedValueOnce(new Error('Asset 2 not found'));

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await denormalizeProviderData(providerData, 'order');

        expect(consoleSpy).toHaveBeenCalledTimes(2);
        expect(result.denormalizedData.give_quantity).toBe('100000000');
        expect(result.denormalizedData.get_quantity).toBe('200000000');
        expect(result.assetInfoCache.get('ERROR1')).toBeNull();
        expect(result.assetInfoCache.get('ERROR2')).toBeNull();

        consoleSpy.mockRestore();
      });
    });

    describe('Edge cases and validation', () => {
      it('should skip denormalization for undefined, null, or empty values', async () => {
        const providerData = {
          quantity: '',
          asset: 'XCP',
          give_quantity: null,
          get_quantity: undefined
        };

        const result = await denormalizeProviderData(providerData, 'order');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockFromSatoshis).not.toHaveBeenCalled();
        expect(result.denormalizedData.quantity).toBe('');
        expect(result.denormalizedData.give_quantity).toBeNull();
        expect(result.denormalizedData.get_quantity).toBeUndefined();
      });

      it('should skip denormalization when asset field is missing', async () => {
        const providerData = {
          quantity: '150000000'
          // No asset field
        };

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockFromSatoshis).not.toHaveBeenCalled();
        expect(result.denormalizedData.quantity).toBe('150000000');
      });

      it('should handle provider data with no matching asset field configuration', async () => {
        const providerData = {
          unknown_quantity: '150000000',
          unknown_asset: 'XCP'
        };

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockFromSatoshis).not.toHaveBeenCalled();
        expect(result.denormalizedData.unknown_quantity).toBe('150000000');
      });

      it('should preserve non-quantity fields unchanged', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'BTC',
          destination: 'address123',
          memo: 'test memo',
          fee_per_kb: '10000'
        };

        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('1.5');
        expect(result.denormalizedData.asset).toBe('BTC');
        expect(result.denormalizedData.destination).toBe('address123');
        expect(result.denormalizedData.memo).toBe('test memo');
        expect(result.denormalizedData.fee_per_kb).toBe('10000');
      });

      it('should handle numeric values as strings', async () => {
        const providerData = {
          quantity: 150000000, // numeric instead of string
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith(150000000, { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('1.5');
      });
    });

    describe('Different compose types', () => {
      it('should handle send compose type', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('1.5');
      });

      it('should handle order compose type with multiple quantities', async () => {
        const providerData = {
          give_quantity: '100000000',
          give_asset: 'BTC',
          get_quantity: '200000000',
          get_asset: 'BTC'
        };

        mockFromSatoshis
          .mockReturnValueOnce('1' as any)
          .mockReturnValueOnce('2' as any);

        const result = await denormalizeProviderData(providerData, 'order');

        expect(result.denormalizedData.give_quantity).toBe('1');
        expect(result.denormalizedData.get_quantity).toBe('2');
      });

      it('should handle dividend compose type', async () => {
        const providerData = {
          quantity_per_unit: '50000000',
          dividend_asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('0.5' as any);

        const result = await denormalizeProviderData(providerData, 'dividend');

        expect(result.denormalizedData.quantity_per_unit).toBe('0.5');
      });

      it('should handle dispenser compose type with mixed assets', async () => {
        const providerData = {
          give_quantity: '100',
          asset: 'INDIVISIBLE',
          escrow_quantity: '1000',
          mainchainrate: '100000'
        };

        const mockAsset: AssetInfo = {
          asset: 'INDIVISIBLE',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '10000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis.mockReturnValue('0.001' as any);

        const result = await denormalizeProviderData(providerData, 'dispenser');

        expect(result.denormalizedData.give_quantity).toBe('100'); // Indivisible
        expect(result.denormalizedData.escrow_quantity).toBe('1000'); // Indivisible
        expect(result.denormalizedData.mainchainrate).toBe('0.001'); // BTC (always divisible)
        expect(mockFromSatoshis).toHaveBeenCalledTimes(1); // Only for mainchainrate
      });

      it('should handle fairminter compose type', async () => {
        const providerData = {
          premint_quantity: '100000000',
          lot_size: '200000000',
          asset: 'FAIRTOKEN'
        };

        const mockAsset: AssetInfo = {
          asset: 'FAIRTOKEN',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis
          .mockReturnValueOnce('1' as any)
          .mockReturnValueOnce('2' as any);

        const result = await denormalizeProviderData(providerData, 'fairminter');

        expect(result.denormalizedData.premint_quantity).toBe('1');
        expect(result.denormalizedData.lot_size).toBe('2');
      });

      it('should handle unknown compose type without denormalization', async () => {
        const providerData = {
          unknown_field: '150000000'
        };

        const result = await denormalizeProviderData(providerData, 'unknown');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockFromSatoshis).not.toHaveBeenCalled();
        expect(result.denormalizedData.unknown_field).toBe('150000000');
        expect(result.assetInfoCache.size).toBe(0);
      });

      it('should handle compose types with no quantity fields', async () => {
        const providerData = {
          flags: 1,
          destination: 'address123'
        };

        const result = await denormalizeProviderData(providerData, 'sweep');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockFromSatoshis).not.toHaveBeenCalled();
        expect(result.denormalizedData.flags).toBe(1);
        expect(result.denormalizedData.destination).toBe('address123');
      });
    });

    describe('Hardcoded vs dynamic asset fields', () => {
      it('should handle hardcoded BTC asset field', async () => {
        const providerData = {
          mainchainrate: '100000'
        };

        mockFromSatoshis.mockReturnValue('0.001' as any);

        const result = await denormalizeProviderData(providerData, 'dispenser');

        expect(mockFromSatoshis).toHaveBeenCalledWith('100000', { removeTrailingZeros: true });
        expect(result.denormalizedData.mainchainrate).toBe('0.001');
      });

      it('should handle dynamic asset field references', async () => {
        const providerData = {
          quantity: '150000000',
          asset: 'DYNAMIC'
        };

        const mockAsset: AssetInfo = {
          asset: 'DYNAMIC',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('DYNAMIC');
        expect(result.denormalizedData.quantity).toBe('1.5');
      });
    });

    describe('Precision preservation and formatting', () => {
      it('should preserve precision for very small divisible amounts', async () => {
        const providerData = {
          quantity: '1', // 1 satoshi
          asset: 'XCP'
        };

        mockFromSatoshis.mockReturnValue('0.00000001' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('1', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('0.00000001');
      });

      it('should handle trailing zero removal', async () => {
        const providerData = {
          quantity: '100000000', // 1.00000000
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('1' as any); // With removeTrailingZeros: true

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('100000000', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('1');
      });

      it('should handle scientific notation in provider data', async () => {
        const providerData = {
          quantity: '1e8', // 100000000 in scientific notation
          asset: 'BTC'
        };

        mockFromSatoshis.mockReturnValue('1' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(mockFromSatoshis).toHaveBeenCalledWith('1e8', { removeTrailingZeros: true });
        expect(result.denormalizedData.quantity).toBe('1');
      });
    });

    describe('Reversibility with normalize.ts', () => {
      it('should produce values that could be normalized back to original', async () => {
        const originalSatoshis = '150000000';
        const providerData = {
          quantity: originalSatoshis,
          asset: 'BTC'
        };

        // Mock fromSatoshis to return the actual decimal equivalent
        mockFromSatoshis.mockReturnValue('1.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('1.5');
        // This '1.5' should be normalizable back to '150000000' with toSatoshis
      });

      it('should handle roundtrip for indivisible assets', async () => {
        const originalAmount = '150';
        const providerData = {
          quantity: originalAmount,
          asset: 'INDIVISIBLE'
        };

        const mockAsset: AssetInfo = {
          asset: 'INDIVISIBLE',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('150');
        // This should normalize back to '150' (unchanged for indivisible assets)
      });
    });

    describe('Special asset configurations', () => {
      it('should handle asset with longname', async () => {
        const providerData = {
          quantity: '1050000000',
          asset: 'LONGNAME'
        };

        const mockAsset: AssetInfo = {
          asset: 'LONGNAME',
          asset_longname: 'VERYLONGASSETNAME.WITH.DOTS',
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis.mockReturnValue('10.5' as any);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('10.5');
        expect(result.assetInfoCache.get('LONGNAME')).toEqual(mockAsset);
      });

      it('should handle asset with special characters in name', async () => {
        const providerData = {
          quantity: '50',
          asset: 'A123456789012' // 13-character asset name
        };

        const mockAsset: AssetInfo = {
          asset: 'A123456789012',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await denormalizeProviderData(providerData, 'send');

        expect(result.denormalizedData.quantity).toBe('50');
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('A123456789012');
      });
    });

    describe('Performance and concurrent scenarios', () => {
      it('should handle concurrent denormalization of same asset efficiently', async () => {
        const providerData = {
          give_quantity: '100000000',
          give_asset: 'CONCURRENT',
          get_quantity: '200000000',
          get_asset: 'CONCURRENT'
        };

        const mockAsset: AssetInfo = {
          asset: 'CONCURRENT',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockFromSatoshis
          .mockReturnValueOnce('1' as any)
          .mockReturnValueOnce('2' as any);

        const result = await denormalizeProviderData(providerData, 'order');

        // Should only fetch asset info once due to caching
        expect(mockFetchAssetDetails).toHaveBeenCalledTimes(1);
        expect(result.denormalizedData.give_quantity).toBe('1');
        expect(result.denormalizedData.get_quantity).toBe('2');
        expect(result.assetInfoCache.size).toBe(1);
      });
    });
  });
});