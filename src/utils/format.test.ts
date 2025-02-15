import { describe, it, expect } from 'vitest';
import { formatAmount, formatAddress, formatAsset } from '@/utils/format';

describe('Format Utilities', () => {
  it('should format an amount in currency style', () => {
    // The exact output might vary by locale so we check for a substring.
    const formatted = formatAmount({
      value: 1234.567,
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
    expect(formatted).toContain("1,234.57");
  });

  it('should shorten a blockchain address correctly', () => {
    const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    const shortened = formatAddress(address);
    expect(shortened).toBe("1A1zP1...DivfNa");
  });

  it('should return the full address when shorten is false', () => {
    const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    const full = formatAddress(address, false);
    expect(full).toBe(address);
  });

  it('should use the asset longname if available', () => {
    const assetName = "XMY";
    const assetInfo = { asset_longname: "My Long Asset Name" };
    const formatted = formatAsset(assetName, { assetInfo });
    expect(formatted).toBe("My Long Asset Name");
  });

  it('should shorten asset name if requested and too long', () => {
    const assetName = "AReallyLongAssetNameThatExceedsTwentyCharacters";
    const formatted = formatAsset(assetName, { shorten: true });
    expect(formatted).toMatch(/\.\.\.$/); // ends with "..."
  });
});
