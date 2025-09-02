import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  looksLikeAssetName, 
  shouldTriggerAssetLookup, 
  lookupAssetOwner 
} from '../assetOwner';
import * as counterpartyApi from '@/utils/blockchain/counterparty';

// Mock the counterparty API
vi.mock('@/utils/blockchain/counterparty', () => ({
  fetchAssetDetails: vi.fn(),
}));

const mockFetchAssetDetails = vi.mocked(counterpartyApi.fetchAssetDetails);

describe('Asset Owner Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('looksLikeAssetName', () => {
    it('should accept valid ASSET.xcp format', () => {
      expect(looksLikeAssetName('DROPLISTER.xcp')).toBe(true);
      expect(looksLikeAssetName('BITCOIN.xcp')).toBe(true);
      expect(looksLikeAssetName('TEST.xcp')).toBe(true);
    });

    it('should accept case insensitive .xcp', () => {
      expect(looksLikeAssetName('DROPLISTER.XCP')).toBe(true);
      expect(looksLikeAssetName('DROPLISTER.xcp')).toBe(true);
      expect(looksLikeAssetName('DROPLISTER.Xcp')).toBe(true);
    });

    it('should accept numeric assets with .xcp', () => {
      expect(looksLikeAssetName('A123456789012345678.xcp')).toBe(true);
    });

    it('should reject non-.xcp subassets', () => {
      expect(looksLikeAssetName('DROPLISTER.other')).toBe(false);
      expect(looksLikeAssetName('BITCOIN.btc')).toBe(false);
      expect(looksLikeAssetName('TEST.subasset')).toBe(false);
    });

    it('should reject multiple dots and .xcp endings', () => {
      expect(looksLikeAssetName('ASSET.xcp.xcp')).toBe(false);
      expect(looksLikeAssetName('ASSET.sub.xcp')).toBe(false);
      expect(looksLikeAssetName('TEST.xcp.xcp')).toBe(false);
      expect(looksLikeAssetName('BITCOIN.xcp.xcp')).toBe(false);
    });

    it('should reject invalid parent assets', () => {
      expect(looksLikeAssetName('123.xcp')).toBe(false); // Starts with number
      expect(looksLikeAssetName('a.xcp')).toBe(false); // Lowercase
      expect(looksLikeAssetName('AB.xcp')).toBe(false); // Too short
      expect(looksLikeAssetName('VERYLONGASSETNAME.xcp')).toBe(false); // Too long
    });

    it('should reject empty or invalid inputs', () => {
      expect(looksLikeAssetName('')).toBe(false);
      expect(looksLikeAssetName(' ')).toBe(false);
      expect(looksLikeAssetName('TEST.xcp')).toBe(true); // Valid parent asset (4+ chars, starts with B-Z)
    });

    it('should reject Bitcoin addresses', () => {
      expect(looksLikeAssetName('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
      expect(looksLikeAssetName('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
    });
  });

  describe('shouldTriggerAssetLookup', () => {
    it('should trigger for valid ASSET.xcp patterns', () => {
      expect(shouldTriggerAssetLookup('DROPLISTER.xcp')).toBe(true);
      expect(shouldTriggerAssetLookup('BITCOIN.xcp')).toBe(true);
    });

    it('should not trigger for Bitcoin addresses', () => {
      expect(shouldTriggerAssetLookup('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
      expect(shouldTriggerAssetLookup('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(false);
      expect(shouldTriggerAssetLookup('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
    });

    it('should not trigger for too short strings', () => {
      expect(shouldTriggerAssetLookup('A.x')).toBe(false);
      expect(shouldTriggerAssetLookup('AB')).toBe(false);
      expect(shouldTriggerAssetLookup('TST.xcp')).toBe(false); // 7 chars, too short
      expect(shouldTriggerAssetLookup('TEST.xcp')).toBe(true); // 8 chars, valid minimum
    });

    it('should not trigger for non-.xcp endings', () => {
      expect(shouldTriggerAssetLookup('DROPLISTER.other')).toBe(false);
      expect(shouldTriggerAssetLookup('BITCOIN.btc')).toBe(false);
    });
  });

  describe('lookupAssetOwner', () => {
    it('should successfully lookup asset owner', async () => {
      const mockAssetInfo = {
        asset: 'DROPLISTER.xcp',
        asset_longname: null,
        issuer: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
        divisible: true,
        locked: false,
        supply_normalized: '1000000000'
      };

      mockFetchAssetDetails.mockResolvedValue(mockAssetInfo);

      const result = await lookupAssetOwner('DROPLISTER.xcp');

      expect(result.isValid).toBe(true);
      expect(result.ownerAddress).toBe('19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX');
      expect(result.assetName).toBe('DROPLISTER.xcp');
      expect(mockFetchAssetDetails).toHaveBeenCalledWith('DROPLISTER.xcp');
    });

    it('should handle case insensitive input', async () => {
      const mockAssetInfo = {
        asset: 'DROPLISTER.xcp',
        asset_longname: null,
        issuer: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
        divisible: true,
        locked: false,
        supply_normalized: '1000000000'
      };

      mockFetchAssetDetails.mockResolvedValue(mockAssetInfo);

      const result = await lookupAssetOwner('DROPLISTER.XCP');

      expect(result.isValid).toBe(true);
      expect(result.ownerAddress).toBe('19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX');
      expect(mockFetchAssetDetails).toHaveBeenCalledWith('DROPLISTER.XCP');
    });

    it('should return error for asset not found', async () => {
      mockFetchAssetDetails.mockResolvedValue(null);

      const result = await lookupAssetOwner('NONEXISTENT.xcp');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Asset not found or has no issuer');
    });

    it('should return error for asset without issuer', async () => {
      const mockAssetInfo = {
        asset: 'NOISSUER.xcp',
        asset_longname: null,
        issuer: '',
        divisible: true,
        locked: false,
        supply_normalized: '0'
      };

      mockFetchAssetDetails.mockResolvedValue(mockAssetInfo);

      const result = await lookupAssetOwner('NOISSUER.xcp');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Asset not found or has no issuer');
    });

    it('should return error for invalid asset format', async () => {
      const result = await lookupAssetOwner('invalid-format');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid asset name format');
      expect(mockFetchAssetDetails).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockFetchAssetDetails.mockRejectedValue(new Error('API Error'));

      const result = await lookupAssetOwner('DROPLISTER.xcp');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Failed to lookup asset owner');
    });
  });
});