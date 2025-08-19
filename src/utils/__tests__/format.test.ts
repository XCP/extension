import { describe, it, expect } from 'vitest';
import { formatAmount, formatAddress, formatAsset, formatDate } from '@/utils/format';

describe('format utilities', () => {
  describe('formatAmount', () => {
    it('should format decimal amounts with default settings', () => {
      const result = formatAmount({ value: 1234.567 });
      expect(result).toBe('1,234.567');
    });

    it('should format currency amounts', () => {
      const result = formatAmount({
        value: 1234.567,
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      });
      // Currency formatting can vary by locale, so check for key components
      expect(result).toContain('1,234.57');
      expect(result).toMatch(/[\$]|USD/); // Should contain $ or USD
    });

    it('should format percentage amounts', () => {
      const result = formatAmount({
        value: 0.1234,
        style: 'percent',
        maximumFractionDigits: 2,
      });
      expect(result).toContain('12.34');
      expect(result).toContain('%');
    });

    it('should handle null values', () => {
      expect(formatAmount({ value: null })).toBe('N/A');
    });

    it('should handle undefined values', () => {
      expect(formatAmount({ value: undefined })).toBe('N/A');
    });

    it('should handle zero values', () => {
      expect(formatAmount({ value: 0 })).toBe('0');
    });

    it('should handle negative values', () => {
      const result = formatAmount({ value: -1234.56 });
      expect(result).toBe('-1,234.56');
    });

    it('should format with custom maximum fraction digits', () => {
      expect(formatAmount({ value: 1.23456789, maximumFractionDigits: 2 })).toBe('1.23');
      expect(formatAmount({ value: 1.23456789, maximumFractionDigits: 4 })).toBe('1.2346');
    });

    it('should format with custom minimum fraction digits', () => {
      expect(formatAmount({ value: 1.2, minimumFractionDigits: 4 })).toBe('1.2000');
    });

    it('should handle compact notation', () => {
      const result = formatAmount({ 
        value: 1234567, 
        compact: true 
      });
      // Compact notation varies by locale, but should be shorter
      expect(result.length).toBeLessThan('1,234,567'.length);
      expect(result).toMatch(/[KMB]|million|thousand/i);
    });

    it('should disable grouping when useGrouping is false', () => {
      expect(formatAmount({ value: 1234.56, useGrouping: false })).toBe('1234.56');
    });

    it('should handle different sign display options', () => {
      expect(formatAmount({ value: 123, signDisplay: 'always' })).toContain('+123');
      expect(formatAmount({ value: -123, signDisplay: 'never' })).toBe('123');
    });

    it('should handle custom locale', () => {
      // Test with a specific locale if possible
      const result = formatAmount({ 
        value: 1234.56, 
        locale: 'en-US' 
      });
      expect(result).toBe('1,234.56');
    });

    it('should handle very large numbers', () => {
      const result = formatAmount({ value: 1e15 });
      expect(result).toContain('1,000,000,000,000,000');
    });

    it('should handle very small numbers', () => {
      const result = formatAmount({ 
        value: 0.00000001,
        maximumFractionDigits: 8 
      });
      expect(result).toBe('0.00000001');
    });

    it('should remove undefined options from formatter', () => {
      // This tests the internal logic that removes undefined options
      expect(() => formatAmount({ 
        value: 123,
        currency: undefined,
        maximumFractionDigits: undefined 
      })).not.toThrow();
    });
  });

  describe('formatAddress', () => {
    it('should shorten Bitcoin addresses by default', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(formatAddress(address)).toBe('1A1zP1...DivfNa');
    });

    it('should shorten different Bitcoin address types', () => {
      // P2PKH (starts with 1)
      const p2pkh = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
      expect(formatAddress(p2pkh)).toBe('1BvBMS...JaNVN2');

      // P2SH (starts with 3) 
      const p2sh = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
      expect(formatAddress(p2sh)).toBe('3J98t1...RhWNLy');

      // Bech32 (starts with bc1)
      const bech32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      expect(formatAddress(bech32)).toBe('bc1qw5...v8f3t4');
    });

    it('should return full address when shorten is false', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(formatAddress(address, false)).toBe(address);
    });

    it('should handle short addresses', () => {
      const shortAddress = '1A1zP1eP5Q';
      expect(formatAddress(shortAddress)).toBe('1A1zP1...P1eP5Q'); // Still follows pattern even if short
    });

    it('should handle empty addresses', () => {
      expect(formatAddress('')).toBe('...');
    });

    it('should handle addresses shorter than 12 characters', () => {
      const veryShort = '12345';
      expect(formatAddress(veryShort)).toBe('12345...12345');
    });

    it('should explicitly test shorten=true', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(formatAddress(address, true)).toBe('1A1zP1...DivfNa');
    });
  });

  describe('formatAsset', () => {
    it('should return BTC unchanged', () => {
      expect(formatAsset('BTC')).toBe('BTC');
    });

    it('should return XCP unchanged', () => {
      expect(formatAsset('XCP')).toBe('XCP');
    });

    it('should return regular asset names unchanged', () => {
      expect(formatAsset('PEPECASH')).toBe('PEPECASH');
      expect(formatAsset('RAREPEPE')).toBe('RAREPEPE');
    });

    it('should use asset longname when available', () => {
      const assetInfo = { asset_longname: 'My Custom Asset Name' };
      expect(formatAsset('MYASSET', { assetInfo })).toBe('My Custom Asset Name');
    });

    it('should ignore empty longname', () => {
      const assetInfo = { asset_longname: '' };
      expect(formatAsset('MYASSET', { assetInfo })).toBe('MYASSET');
    });

    it('should ignore null longname', () => {
      const assetInfo = { asset_longname: null };
      expect(formatAsset('MYASSET', { assetInfo })).toBe('MYASSET');
    });

    it('should handle null assetInfo', () => {
      expect(formatAsset('MYASSET', { assetInfo: null })).toBe('MYASSET');
    });

    it('should handle undefined assetInfo', () => {
      expect(formatAsset('MYASSET', { assetInfo: undefined })).toBe('MYASSET');
    });

    it('should handle no options', () => {
      expect(formatAsset('MYASSET')).toBe('MYASSET');
    });

    it('should shorten long asset names when requested', () => {
      const longName = 'THISASSETNAMEISVERYVERYLONGANDEXCEEDSTWENTYFIVECHARACTERS';
      const result = formatAsset(longName, { shorten: true });
      expect(result).toBe('THISASSETNAMEISVERYVERYLO...');
      expect(result.length).toBe(28); // 25 chars + "..."
    });

    it('should shorten long longnames when requested', () => {
      const assetInfo = { asset_longname: 'This Is A Very Very Long Asset Name That Exceeds Twenty Five Characters' };
      const result = formatAsset('SHORT', { assetInfo, shorten: true });
      expect(result).toBe('This Is A Very Very Long ...');
    });

    it('should not shorten short asset names even when shorten=true', () => {
      expect(formatAsset('SHORT', { shorten: true })).toBe('SHORT');
    });

    it('should not shorten asset names exactly 25 characters', () => {
      const exactly25 = 'ABCDEFGHIJKLMNOPQRSTUVWXY'; // 25 chars
      expect(exactly25.length).toBe(25);
      expect(formatAsset(exactly25, { shorten: true })).toBe(exactly25);
    });

    it('should shorten asset names longer than 25 characters', () => {
      const exactly26 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // 26 chars
      expect(exactly26.length).toBe(26);
      const result = formatAsset(exactly26, { shorten: true });
      expect(result).toBe('ABCDEFGHIJKLMNOPQRSTUVWXY...');
    });

    it('should prioritize longname over asset name but still apply BTC/XCP exception', () => {
      // BTC and XCP should always return as-is, even with longname
      const assetInfo = { asset_longname: 'Bitcoin' };
      expect(formatAsset('BTC', { assetInfo })).toBe('BTC');
      
      const xcpInfo = { asset_longname: 'Counterparty' };
      expect(formatAsset('XCP', { assetInfo: xcpInfo })).toBe('XCP');
    });
  });

  describe('formatDate', () => {
    it('should format Unix timestamp to readable date', () => {
      // Use a known timestamp: January 1, 2023 00:00:00 UTC
      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = formatDate(timestamp);
      
      // Check that it contains expected date components (account for timezone)
      expect(result).toMatch(/202[23]/);
      expect(result).toMatch(/1/); // Day or month
    });

    it('should handle epoch timestamp (0)', () => {
      const result = formatDate(0);
      expect(result).toMatch(/19[67]\d/); // Unix epoch, accounting for timezone
    });

    it('should handle current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = formatDate(now);
      
      const currentYear = new Date().getFullYear().toString();
      expect(result).toContain(currentYear);
    });

    it('should handle future timestamp', () => {
      // January 1, 2030
      const futureTimestamp = 1893456000;
      const result = formatDate(futureTimestamp);
      expect(result).toMatch(/20[23]\d/); // Should contain year around 2030
    });

    it('should handle negative timestamp (before epoch)', () => {
      const result = formatDate(-86400); // 1 day before epoch
      expect(result).toContain('1969');
    });

    it('should format with locale-specific format', () => {
      const timestamp = 1672531200; // 2023-01-01 00:00:00 UTC
      const result = formatDate(timestamp);
      
      // Result should be a valid date string (exact format depends on locale)
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle very large timestamps', () => {
      // Year 2100 (July 15, 2100) - middle of year to avoid timezone issues
      const largeTimestamp = 4120243200; // July 15, 2100
      const result = formatDate(largeTimestamp);
      expect(result).toMatch(/2100/); // Should contain year 2100
    });
  });

  describe('integration scenarios', () => {
    it('should handle real-world Bitcoin transaction formatting', () => {
      const amount = formatAmount({
        value: 0.00123456,
        maximumFractionDigits: 8,
      });
      expect(amount).toBe('0.00123456');

      const address = formatAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
      expect(address).toBe('bc1qw5...v8f3t4');

      const timestamp = formatDate(1698777600); // Recent timestamp
      expect(timestamp).toBeTruthy();
    });

    it('should handle asset display with complete information', () => {
      const asset = formatAsset('PEPECASH', {
        assetInfo: { asset_longname: 'Pepe Cash' },
        shorten: false,
      });
      expect(asset).toBe('Pepe Cash');
    });

    it('should handle currency formatting for different denominations', () => {
      // Satoshis to BTC
      const satoshis = formatAmount({
        value: 0.00000001,
        maximumFractionDigits: 8,
      });
      expect(satoshis).toBe('0.00000001');

      // BTC amount
      const btc = formatAmount({
        value: 1.5,
        maximumFractionDigits: 8,
      });
      expect(btc).toBe('1.5');

      // Large amounts with grouping
      const large = formatAmount({
        value: 21000000,
        useGrouping: true,
      });
      expect(large).toBe('21,000,000');
    });

    it('should handle edge cases gracefully', () => {
      // Empty/null inputs
      expect(formatAmount({ value: null })).toBe('N/A');
      expect(formatAddress('')).toBe('...');
      expect(formatAsset('')).toBe('');

      // Very long inputs
      const longAddress = 'a'.repeat(100);
      expect(formatAddress(longAddress)).toBe('aaaaaa...aaaaaa');
      
      const longAsset = 'A'.repeat(50);
      expect(formatAsset(longAsset, { shorten: true })).toMatch(/\.\.\.$/);
    });
  });
});
