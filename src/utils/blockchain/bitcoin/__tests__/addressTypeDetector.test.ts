import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectAddressFormat, detectAddressFormatFromPreviews, getPreviewAddresses } from '@/utils/blockchain/bitcoin/addressTypeDetector';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';
import { hasAddressActivity } from '@/utils/blockchain/bitcoin/balance';
import * as bitcoinAddress from '@/utils/blockchain/bitcoin/address';

// Mock the external dependencies
vi.mock('@/utils/blockchain/counterparty/api');
vi.mock('@/utils/blockchain/bitcoin/balance');

describe('Address Type Detector', () => {
  const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  const mockAddresses = {
    [AddressFormat.P2PKH]: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
    [AddressFormat.P2WPKH]: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    [AddressFormat.P2SH_P2WPKH]: '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf',
    [AddressFormat.P2TR]: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getAddressFromMnemonic to return predictable addresses
    vi.spyOn(bitcoinAddress, 'getAddressFromMnemonic').mockImplementation(
      (mnemonic, path, format) => {
        return mockAddresses[format] || 'mock-address';
      }
    );
  });

  describe('detectAddressFormat', () => {
    it('should detect P2PKH (Legacy) when it has activity', async () => {
      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity)
        .mockResolvedValueOnce(true)  // P2PKH has activity
        .mockResolvedValue(false);

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2PKH);
    });

    it('should detect P2WPKH (Native SegWit) when it has activity', async () => {
      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity)
        .mockResolvedValueOnce(false)  // P2PKH no activity
        .mockResolvedValueOnce(true)   // P2WPKH has activity
        .mockResolvedValue(false);

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2WPKH);
    });

    it('should detect P2SH_P2WPKH (Nested SegWit) when it has activity', async () => {
      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity)
        .mockResolvedValueOnce(false)  // P2PKH no activity
        .mockResolvedValueOnce(false)  // P2WPKH no activity
        .mockResolvedValueOnce(true)   // P2SH_P2WPKH has activity
        .mockResolvedValue(false);

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2SH_P2WPKH);
    });

    it('should default to P2TR (Taproot) when no activity found', async () => {
      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity).mockResolvedValue(false);

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2TR);
    });

    it('should detect based on Counterparty token activity', async () => {
      // P2PKH address has tokens
      vi.mocked(fetchTokenBalances)
        .mockResolvedValueOnce([{ asset: 'XCP', quantity: '100' }] as any)
        .mockResolvedValue([]);
      vi.mocked(hasAddressActivity).mockResolvedValue(false);

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2PKH);
    });

    it('should prioritize Counterparty activity over Bitcoin activity', async () => {
      // P2PKH has tokens (will be detected first)
      vi.mocked(fetchTokenBalances)
        .mockResolvedValueOnce([{ asset: 'PEPE', quantity: '1000' }] as any)  // P2PKH has tokens
        .mockResolvedValue([]);
      vi.mocked(hasAddressActivity).mockResolvedValue(false);

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2PKH);  // P2PKH checked first and has tokens
    });

    it('should use cached previews when provided', async () => {
      const cachedPreviews = {
        [AddressFormat.P2PKH]: 'cached-p2pkh-address',
        [AddressFormat.P2WPKH]: 'cached-p2wpkh-address',
      };

      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity)
        .mockResolvedValueOnce(false)  // cached-p2pkh-address no activity
        .mockResolvedValueOnce(true);  // cached-p2wpkh-address has activity

      const result = await detectAddressFormat(testMnemonic, cachedPreviews);
      expect(result).toBe(AddressFormat.P2WPKH);

      // Should not have called getAddressFromMnemonic for cached addresses
      expect(bitcoinAddress.getAddressFromMnemonic).toHaveBeenCalledTimes(1); // Only for P2SH_P2WPKH
    });

    it('should handle API failures gracefully', async () => {
      vi.mocked(fetchTokenBalances).mockRejectedValue(new Error('API failed'));
      vi.mocked(hasAddressActivity).mockRejectedValue(new Error('API failed'));

      const result = await detectAddressFormat(testMnemonic);
      expect(result).toBe(AddressFormat.P2TR);
    });

    it('should skip Taproot checking since it is the fallback', async () => {
      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity).mockResolvedValue(false);

      await detectAddressFormat(testMnemonic);

      // Should only generate 3 addresses (not 4, skipping Taproot)
      expect(bitcoinAddress.getAddressFromMnemonic).toHaveBeenCalledTimes(3);
      expect(bitcoinAddress.getAddressFromMnemonic).toHaveBeenCalledWith(
        testMnemonic,
        expect.stringContaining("m/44'/0'/0'/0/0"),
        AddressFormat.P2PKH
      );
      expect(bitcoinAddress.getAddressFromMnemonic).toHaveBeenCalledWith(
        testMnemonic,
        expect.stringContaining("m/84'/0'/0'/0/0"),
        AddressFormat.P2WPKH
      );
      expect(bitcoinAddress.getAddressFromMnemonic).toHaveBeenCalledWith(
        testMnemonic,
        expect.stringContaining("m/49'/0'/0'/0/0"),
        AddressFormat.P2SH_P2WPKH
      );
      // Should NOT call for P2TR
      expect(bitcoinAddress.getAddressFromMnemonic).not.toHaveBeenCalledWith(
        testMnemonic,
        expect.stringContaining("m/86'/0'/0'/0/0"),
        AddressFormat.P2TR
      );
    });
  });

  describe('detectAddressFormatFromPreviews', () => {
    it('should detect format from cached previews only', async () => {
      const previews = {
        [AddressFormat.P2PKH]: 'preview-p2pkh',
        [AddressFormat.P2WPKH]: 'preview-p2wpkh',
        [AddressFormat.P2SH_P2WPKH]: 'preview-p2sh',
      };

      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity)
        .mockResolvedValueOnce(false)  // P2PKH no activity
        .mockResolvedValueOnce(true);  // P2WPKH has activity

      const result = await detectAddressFormatFromPreviews(previews);
      expect(result).toBe(AddressFormat.P2WPKH);
    });

    it('should skip addresses not in previews', async () => {
      const previews = {
        [AddressFormat.P2WPKH]: 'preview-p2wpkh',
        // P2PKH and P2SH_P2WPKH not provided
      };

      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity).mockResolvedValue(true);

      const result = await detectAddressFormatFromPreviews(previews);
      expect(result).toBe(AddressFormat.P2WPKH);

      // Should only check the one address provided
      expect(hasAddressActivity).toHaveBeenCalledTimes(1);
      expect(hasAddressActivity).toHaveBeenCalledWith('preview-p2wpkh');
    });

    it('should default to P2TR when no activity found', async () => {
      const previews = {
        [AddressFormat.P2PKH]: 'preview-p2pkh',
        [AddressFormat.P2WPKH]: 'preview-p2wpkh',
      };

      vi.mocked(fetchTokenBalances).mockResolvedValue([]);
      vi.mocked(hasAddressActivity).mockResolvedValue(false);

      const result = await detectAddressFormatFromPreviews(previews);
      expect(result).toBe(AddressFormat.P2TR);
    });
  });

  describe('getPreviewAddresses', () => {
    it('should generate preview addresses for all formats', () => {
      // Reset mock to use original implementation
      vi.mocked(bitcoinAddress.getAddressFromMnemonic).mockRestore();

      // Mock it again with implementation that returns format-specific addresses
      vi.spyOn(bitcoinAddress, 'getAddressFromMnemonic').mockImplementation(
        (mnemonic, path, format) => mockAddresses[format] || 'unknown'
      );

      const previews = getPreviewAddresses(testMnemonic);

      expect(previews[AddressFormat.P2PKH]).toBe(mockAddresses[AddressFormat.P2PKH]);
      expect(previews[AddressFormat.P2WPKH]).toBe(mockAddresses[AddressFormat.P2WPKH]);
      expect(previews[AddressFormat.P2SH_P2WPKH]).toBe(mockAddresses[AddressFormat.P2SH_P2WPKH]);
      expect(previews[AddressFormat.P2TR]).toBe(mockAddresses[AddressFormat.P2TR]);
      expect(previews[AddressFormat.Counterwallet]).toBeDefined();
    });

    it('should handle address generation failures gracefully', () => {
      // The order in getPreviewAddresses is: P2PKH, P2SH_P2WPKH, P2WPKH, P2TR, Counterwallet
      vi.mocked(bitcoinAddress.getAddressFromMnemonic)
        .mockImplementationOnce(() => mockAddresses[AddressFormat.P2PKH])  // P2PKH succeeds
        .mockImplementationOnce(() => { throw new Error('Failed to generate'); })  // P2SH_P2WPKH fails
        .mockImplementation((mnemonic, path, format) => mockAddresses[format] || 'unknown');

      const previews = getPreviewAddresses(testMnemonic);

      expect(previews[AddressFormat.P2PKH]).toBe(mockAddresses[AddressFormat.P2PKH]);
      expect(previews[AddressFormat.P2SH_P2WPKH]).toBeUndefined(); // Failed
      expect(previews[AddressFormat.P2WPKH]).toBeDefined();
    });
  });
});