import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { fundAndAuthorization, legacyAttachAndDependentListing } from '@/core/bitcoin/__tests__/helpers/psbtBundleFixtures';
import { parsePSBT } from '@/core/bitcoin/psbt';
import { bundleSpendsItsParent, packageParentOf, rebindDependentListingPsbt } from '@/core/bitcoin/psbtBundleTransactions';

describe('PSBT bundle transactions', () => {
  it('refuses to rebind a different source outpoint', () => {
    const fixture = legacyAttachAndDependentListing();
    expect(() => rebindDependentListingPsbt(
      fixture.listingPsbt,
      { txid: 'ff'.repeat(32), vout: 0 },
      '11'.repeat(32),
    )).toThrow(/reviewed attach outpoint/);
  });

  it('hands the funding bytes, keyed by its txid, only to bundles that spend their parent', () => {
    const { fund, fundId } = fundAndAuthorization();
    expect(packageParentOf(fund.psbtHex)).toEqual({ [fundId]: bytesToHex(parsePSBT(fund.psbtHex).toBytes(true, false)) });
    expect(bundleSpendsItsParent('fund-and-authorize-offers')).toBe(true);
    expect(bundleSpendsItsParent('acceptance-cpfp')).toBe(true);
    expect(bundleSpendsItsParent('authorize-offers')).toBe(false);
    expect(bundleSpendsItsParent('attach-and-list')).toBe(false);
  });
});
