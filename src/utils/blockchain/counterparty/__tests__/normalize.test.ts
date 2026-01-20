import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeFormData, getComposeType } from '../normalize';
import type { AssetInfo } from '../api';
import * as api from '../api';
import * as numeric from '@/utils/numeric';

// Mock the API module
vi.mock('../api', () => ({
  fetchAssetDetails: vi.fn(),
}));

// Mock the numeric module
vi.mock('@/utils/numeric', () => ({
  toSatoshis: vi.fn(),
}));

const mockFetchAssetDetails = vi.mocked(api.fetchAssetDetails);
const mockToSatoshis = vi.mocked(numeric.toSatoshis);

describe('normalize.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default toSatoshis mock behavior
    mockToSatoshis.mockImplementation((value: any) => {
      const num = parseFloat(value.toString());
      return Math.floor(num * 100000000).toString();
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getComposeType', () => {
    it('should detect order type from give_asset and get_asset fields', () => {
      const formData = { give_asset: 'BTC', get_asset: 'XCP' };
      expect(getComposeType(formData)).toBe('order');
    });

    it('should detect dividend type from dividend_asset field', () => {
      const formData = { dividend_asset: 'XCP' };
      expect(getComposeType(formData)).toBe('dividend');
    });

    it('should detect dispenser type from escrow_quantity field', () => {
      const formData = { escrow_quantity: '1000' };
      expect(getComposeType(formData)).toBe('dispenser');
    });

    it('should detect sweep type from flags and destination without quantity', () => {
      const formData = { flags: 1, destination: 'address123' };
      expect(getComposeType(formData)).toBe('sweep');
    });

    it('should detect utxo type from utxos field', () => {
      const formData = { utxos: [] };
      expect(getComposeType(formData)).toBe('utxo');
    });

    it('should detect mpma type from sends field', () => {
      const formData = { sends: [] };
      expect(getComposeType(formData)).toBe('mpma');
    });

    it('should detect broadcast type from text field', () => {
      const formData = { text: 'Hello World' };
      expect(getComposeType(formData)).toBe('broadcast');
    });

    it('should detect send type from quantity and asset fields', () => {
      const formData = { quantity: '1.5', asset: 'XCP' };
      expect(getComposeType(formData)).toBe('send');
    });

    it('should detect issuance type from quantity and asset_name fields', () => {
      const formData = { quantity: '1000', asset_name: 'MYTOKEN' };
      expect(getComposeType(formData)).toBe('issuance');
    });

    it('should detect attach type from destination and asset fields', () => {
      const formData = { destination: 'address123', asset: 'XCP' };
      expect(getComposeType(formData)).toBe('attach');
    });

    it('should detect movetoutxo type from utxo_address field', () => {
      const formData = { utxo_address: 'address123' };
      expect(getComposeType(formData)).toBe('movetoutxo');
    });

    it('should use explicit type mapping from __type field', () => {
      const formData = { __type: 'SendOptions' };
      expect(getComposeType(formData)).toBe('send');
    });

    it('should use explicit type mapping from type field', () => {
      const formData = { type: 'OrderOptions' };
      expect(getComposeType(formData)).toBe('order');
    });

    it('should return undefined for unknown form data', () => {
      const formData = { unknown_field: 'value' };
      expect(getComposeType(formData)).toBeUndefined();
    });
  });

  describe('normalizeFormData', () => {
    describe('BTC asset normalization', () => {
      it('should normalize BTC amounts using toSatoshis', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'BTC');

        mockToSatoshis.mockReturnValue('150000000');

        const result = await normalizeFormData(formData, 'send');

        expect(mockToSatoshis).toHaveBeenCalledWith('1.5');
        expect(result.normalizedData.quantity).toBe('150000000');
        expect(result.assetInfoCache.size).toBe(0); // BTC doesn't need asset info
      });

      it('should normalize mainchainrate to satoshis when mainchainrate_asset is BTC', async () => {
        const formData = new FormData();
        formData.set('mainchainrate', '0.001');
        formData.set('mainchainrate_asset', 'BTC'); // Hidden field from dispenser form

        mockToSatoshis.mockReturnValue('100000');

        const result = await normalizeFormData(formData, 'dispenser');

        expect(mockToSatoshis).toHaveBeenCalledWith('0.001');
        expect(result.normalizedData.mainchainrate).toBe('100000');
      });

      it('should skip mainchainrate normalization when mainchainrate_asset field is missing', async () => {
        const formData = new FormData();
        formData.set('mainchainrate', '0.001');
        // No mainchainrate_asset field - this would be a form bug

        const result = await normalizeFormData(formData, 'dispenser');

        // Without the asset field, the value is not normalized
        expect(mockToSatoshis).not.toHaveBeenCalled();
        expect(result.normalizedData.mainchainrate).toBe('0.001');
      });
    });

    describe('Divisible asset normalization', () => {
      const mockDivisibleAsset: AssetInfo = {
        asset: 'XCP',
        asset_longname: null,
        divisible: true,
        locked: false,
        supply_normalized: '1000000.00000000'
      };

      it('should normalize divisible asset amounts using toSatoshis', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'XCP');

        mockFetchAssetDetails.mockResolvedValue(mockDivisibleAsset);
        mockToSatoshis.mockReturnValue('150000000');

        const result = await normalizeFormData(formData, 'send');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('XCP');
        expect(mockToSatoshis).toHaveBeenCalledWith('1.5');
        expect(result.normalizedData.quantity).toBe('150000000');
        expect(result.assetInfoCache.get('XCP')).toEqual(mockDivisibleAsset);
      });

      it('should handle multiple divisible assets in order', async () => {
        const formData = new FormData();
        formData.set('give_quantity', '2.5');
        formData.set('give_asset', 'XCP');
        formData.set('get_quantity', '0.001');
        formData.set('get_asset', 'PEPECASH');

        const mockPepeCash: AssetInfo = {
          asset: 'PEPECASH',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '500000.00000000'
        };

        mockFetchAssetDetails
          .mockResolvedValueOnce(mockDivisibleAsset)
          .mockResolvedValueOnce(mockPepeCash);

        mockToSatoshis
          .mockReturnValueOnce('250000000')
          .mockReturnValueOnce('100000');

        const result = await normalizeFormData(formData, 'order');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('XCP');
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('PEPECASH');
        expect(result.normalizedData.give_quantity).toBe('250000000');
        expect(result.normalizedData.get_quantity).toBe('100000');
        expect(result.assetInfoCache.size).toBe(2);
      });
    });

    describe('Indivisible asset normalization', () => {
      const mockIndivisibleAsset: AssetInfo = {
        asset: 'INDIVISIBLE',
        asset_longname: null,
        divisible: false,
        locked: false,
        supply_normalized: '1000'
      };

      it('should not modify indivisible asset amounts', async () => {
        const formData = new FormData();
        formData.set('quantity', '150');
        formData.set('asset', 'INDIVISIBLE');

        mockFetchAssetDetails.mockResolvedValue(mockIndivisibleAsset);

        const result = await normalizeFormData(formData, 'send');

        expect(mockFetchAssetDetails).toHaveBeenCalledWith('INDIVISIBLE');
        expect(mockToSatoshis).not.toHaveBeenCalled();
        expect(result.normalizedData.quantity).toBe('150');
        expect(result.assetInfoCache.get('INDIVISIBLE')).toEqual(mockIndivisibleAsset);
      });

      it('should handle mixed divisible and indivisible assets in order', async () => {
        const formData = new FormData();
        formData.set('give_quantity', '100');
        formData.set('give_asset', 'INDIVISIBLE');
        formData.set('get_quantity', '1.5');
        formData.set('get_asset', 'XCP');

        const mockDivisibleAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails
          .mockResolvedValueOnce(mockIndivisibleAsset)
          .mockResolvedValueOnce(mockDivisibleAsset);

        mockToSatoshis.mockReturnValue('150000000');

        const result = await normalizeFormData(formData, 'order');

        expect(result.normalizedData.give_quantity).toBe('100'); // Not normalized
        expect(result.normalizedData.get_quantity).toBe('150000000'); // Normalized
        expect(mockToSatoshis).toHaveBeenCalledTimes(1);
        expect(mockToSatoshis).toHaveBeenCalledWith('1.5');
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
        const formData = new FormData();
        formData.set('give_quantity', '1.0');
        formData.set('give_asset', 'CACHED');
        formData.set('get_quantity', '2.0');
        formData.set('get_asset', 'CACHED');

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis
          .mockReturnValueOnce('100000000')
          .mockReturnValueOnce('200000000');

        const result = await normalizeFormData(formData, 'order');

        expect(mockFetchAssetDetails).toHaveBeenCalledTimes(1);
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('CACHED');
        expect(result.assetInfoCache.get('CACHED')).toEqual(mockAsset);
        expect(result.normalizedData.give_quantity).toBe('100000000');
        expect(result.normalizedData.get_quantity).toBe('200000000');
      });
    });

    describe('API error handling', () => {
      it('should throw error when API fetch fails', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'UNKNOWN');

        mockFetchAssetDetails.mockRejectedValue(new Error('Asset not found'));

        await expect(normalizeFormData(formData, 'send')).rejects.toThrow('Asset not found');
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('UNKNOWN');
      });

      it('should throw error for null asset info response', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'NULLASSET');

        mockFetchAssetDetails.mockResolvedValue(null);

        await expect(normalizeFormData(formData, 'send')).rejects.toThrow('Asset "NULLASSET" not found');
      });
    });

    describe('Edge cases and validation', () => {
      it('should skip normalization for undefined, null, or empty values', async () => {
        const formData = new FormData();
        formData.set('quantity', '');
        formData.set('asset', 'XCP');

        const result = await normalizeFormData(formData, 'send');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(result.normalizedData.quantity).toBe('');
      });

      it('should skip normalization when asset field is missing', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        // No asset field

        const result = await normalizeFormData(formData, 'send');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(result.normalizedData.quantity).toBe('1.5');
      });

      it('should handle very large numbers', async () => {
        const formData = new FormData();
        formData.set('quantity', '999999999.99999999');
        formData.set('asset', 'XCP');

        const mockAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('99999999999999999');

        const result = await normalizeFormData(formData, 'send');

        expect(mockToSatoshis).toHaveBeenCalledWith('999999999.99999999');
        expect(result.normalizedData.quantity).toBe('99999999999999999');
      });

      it('should handle zero values', async () => {
        const formData = new FormData();
        formData.set('quantity', '0');
        formData.set('asset', 'XCP');

        const mockAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('0');

        const result = await normalizeFormData(formData, 'send');

        expect(mockToSatoshis).toHaveBeenCalledWith('0');
        expect(result.normalizedData.quantity).toBe('0');
      });

      it('should handle very small decimal numbers', async () => {
        const formData = new FormData();
        formData.set('quantity', '0.00000001');
        formData.set('asset', 'XCP');

        const mockAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('1');

        const result = await normalizeFormData(formData, 'send');

        expect(mockToSatoshis).toHaveBeenCalledWith('0.00000001');
        expect(result.normalizedData.quantity).toBe('1');
      });
    });

    describe('Different compose types', () => {
      it('should handle send compose type', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'BTC');

        mockToSatoshis.mockReturnValue('150000000');

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('150000000');
      });

      it('should handle order compose type with multiple quantities', async () => {
        const formData = new FormData();
        formData.set('give_quantity', '1.0');
        formData.set('give_asset', 'BTC');
        formData.set('get_quantity', '2.0');
        formData.set('get_asset', 'BTC');

        mockToSatoshis
          .mockReturnValueOnce('100000000')
          .mockReturnValueOnce('200000000');

        const result = await normalizeFormData(formData, 'order');

        expect(result.normalizedData.give_quantity).toBe('100000000');
        expect(result.normalizedData.get_quantity).toBe('200000000');
      });

      it('should handle dividend compose type', async () => {
        const formData = new FormData();
        formData.set('quantity_per_unit', '0.5');
        formData.set('dividend_asset', 'BTC');

        mockToSatoshis.mockReturnValue('50000000');

        const result = await normalizeFormData(formData, 'dividend');

        expect(result.normalizedData.quantity_per_unit).toBe('50000000');
      });

      it('should handle dispenser compose type with indivisible asset and BTC mainchainrate', async () => {
        const formData = new FormData();
        formData.set('give_quantity', '100');
        formData.set('asset', 'INDIVISIBLE');
        formData.set('escrow_quantity', '1000');
        formData.set('mainchainrate', '0.001');
        formData.set('mainchainrate_asset', 'BTC'); // Hidden field from dispenser form

        const mockAsset: AssetInfo = {
          asset: 'INDIVISIBLE',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '10000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('100000');

        const result = await normalizeFormData(formData, 'dispenser');

        expect(result.normalizedData.give_quantity).toBe('100'); // Indivisible
        expect(result.normalizedData.escrow_quantity).toBe('1000'); // Indivisible
        expect(result.normalizedData.mainchainrate).toBe('100000'); // Normalized to satoshis
        expect(mockToSatoshis).toHaveBeenCalledWith('0.001');
      });

      it('should handle unknown compose type without normalization', async () => {
        const formData = new FormData();
        formData.set('unknown_field', '1.5');

        const result = await normalizeFormData(formData, 'unknown');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockToSatoshis).not.toHaveBeenCalled();
        expect(result.normalizedData.unknown_field).toBe('1.5');
        expect(result.assetInfoCache.size).toBe(0);
      });

      it('should handle compose types with no quantity fields', async () => {
        const formData = new FormData();
        formData.set('flags', '1');
        formData.set('destination', 'address123');

        const result = await normalizeFormData(formData, 'sweep');

        expect(mockFetchAssetDetails).not.toHaveBeenCalled();
        expect(mockToSatoshis).not.toHaveBeenCalled();
        expect(result.normalizedData.flags).toBe('1');
        expect(result.normalizedData.destination).toBe('address123');
      });
    });

    describe('Asset divisible property edge cases', () => {
      it('should handle asset info with undefined divisible property', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'UNDEFINED_DIVISIBLE');

        const mockAsset: AssetInfo = {
          asset: 'UNDEFINED_DIVISIBLE',
          asset_longname: null,
          divisible: undefined as any, // Force undefined
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('1.5'); // Not normalized due to undefined divisible
      });

      it('should handle asset info with null divisible property', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'NULL_DIVISIBLE');

        const mockAsset: AssetInfo = {
          asset: 'NULL_DIVISIBLE',
          asset_longname: null,
          divisible: null as any, // Force null
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('1.5'); // Not normalized due to null divisible
      });
    });

    describe('FormData conversion', () => {
      it('should properly convert FormData to normalized object', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'BTC');
        formData.set('destination', 'address123');
        formData.set('memo', 'test memo');

        mockToSatoshis.mockReturnValue('150000000');

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('150000000');
        expect(result.normalizedData.asset).toBe('BTC');
        expect(result.normalizedData.destination).toBe('address123');
        expect(result.normalizedData.memo).toBe('test memo');
      });

      it('should preserve non-quantity fields unchanged', async () => {
        const formData = new FormData();
        formData.set('quantity', '1.5');
        formData.set('asset', 'BTC');
        formData.set('fee_per_kb', '10000');
        formData.set('allow_unconfirmed_inputs', 'true');

        mockToSatoshis.mockReturnValue('150000000');

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('150000000');
        expect(result.normalizedData.fee_per_kb).toBe('10000');
        expect(result.normalizedData.allow_unconfirmed_inputs).toBe('true');
      });
    });

    describe('Precision and rounding scenarios', () => {
      it('should handle maximum precision for divisible assets', async () => {
        const formData = new FormData();
        formData.set('quantity', '0.99999999'); // 8 decimal places (max for divisible)
        formData.set('asset', 'XCP');

        const mockAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('99999999');

        const result = await normalizeFormData(formData, 'send');

        expect(mockToSatoshis).toHaveBeenCalledWith('0.99999999');
        expect(result.normalizedData.quantity).toBe('99999999');
      });

      it('should handle scientific notation in inputs', async () => {
        const formData = new FormData();
        formData.set('quantity', '1e-8'); // 0.00000001 in scientific notation
        formData.set('asset', 'XCP');

        const mockAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('1');

        const result = await normalizeFormData(formData, 'send');

        expect(mockToSatoshis).toHaveBeenCalledWith('1e-8');
        expect(result.normalizedData.quantity).toBe('1');
      });

      it('should handle extremely large indivisible amounts', async () => {
        const formData = new FormData();
        formData.set('quantity', '18446744073709551615'); // Near uint64 max
        formData.set('asset', 'INDIVISIBLE');

        const mockAsset: AssetInfo = {
          asset: 'INDIVISIBLE',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '18446744073709551615'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('18446744073709551615');
        expect(mockToSatoshis).not.toHaveBeenCalled();
      });
    });

    describe('Special asset names and edge cases', () => {
      it('should handle XCP asset (historically important divisible asset)', async () => {
        const formData = new FormData();
        formData.set('quantity', '100.5');
        formData.set('asset', 'XCP');

        const mockAsset: AssetInfo = {
          asset: 'XCP',
          asset_longname: null,
          divisible: true,
          locked: true,
          supply_normalized: '2648998.99999999'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('10050000000');

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('10050000000');
        expect(result.assetInfoCache.get('XCP')).toEqual(mockAsset);
      });

      it('should handle asset names with special characters', async () => {
        const formData = new FormData();
        formData.set('quantity', '50');
        formData.set('asset', 'A123456789012'); // 13-character asset name

        const mockAsset: AssetInfo = {
          asset: 'A123456789012',
          asset_longname: null,
          divisible: false,
          locked: false,
          supply_normalized: '1000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('50');
        expect(mockFetchAssetDetails).toHaveBeenCalledWith('A123456789012');
      });

      it('should handle asset with longname', async () => {
        const formData = new FormData();
        formData.set('quantity', '10.5');
        formData.set('asset', 'LONGNAME');

        const mockAsset: AssetInfo = {
          asset: 'LONGNAME',
          asset_longname: 'VERYLONGASSETNAME.WITH.DOTS',
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis.mockReturnValue('1050000000');

        const result = await normalizeFormData(formData, 'send');

        expect(result.normalizedData.quantity).toBe('1050000000');
        expect(result.assetInfoCache.get('LONGNAME')).toEqual(mockAsset);
      });
    });

    describe('Race condition and concurrent asset fetching', () => {
      it('should handle concurrent requests for the same asset', async () => {
        const formData = new FormData();
        formData.set('give_quantity', '1.0');
        formData.set('give_asset', 'RACEASSET');
        formData.set('get_quantity', '2.0');
        formData.set('get_asset', 'RACEASSET');

        const mockAsset: AssetInfo = {
          asset: 'RACEASSET',
          asset_longname: null,
          divisible: true,
          locked: false,
          supply_normalized: '1000000.00000000'
        };

        // Simulate both calls returning the same asset info
        mockFetchAssetDetails.mockResolvedValue(mockAsset);
        mockToSatoshis
          .mockReturnValueOnce('100000000')
          .mockReturnValueOnce('200000000');

        const result = await normalizeFormData(formData, 'order');

        // Should only fetch asset info once due to caching
        expect(mockFetchAssetDetails).toHaveBeenCalledTimes(1);
        expect(result.normalizedData.give_quantity).toBe('100000000');
        expect(result.normalizedData.get_quantity).toBe('200000000');
        expect(result.assetInfoCache.size).toBe(1);
      });
    });
  });
});