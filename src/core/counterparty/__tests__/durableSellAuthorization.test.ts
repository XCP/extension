import { describe, expect, it } from 'vitest';
import {
  findUncommittedAssetSignatures,
  leavesOutputsUncommitted,
} from '@/core/counterparty/durableSellAuthorization';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import { asDisplayUnits } from '@/core/numeric';

const asset = (inputIndex: number): InputAttachedAssets => ({
  inputIndex, utxo: `tx:${inputIndex}`,
  assets: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: asDisplayUnits('1'), asset_longname: null }],
});
const unknown = (inputIndex: number): InputAttachedAssets => ({
  inputIndex, utxo: `tx:${inputIndex}`, assets: [], lookupFailed: true,
});
const listing = (status: 'proved' | 'blocked' | 'retry' | 'caution') => ({ family: 'create_listing' as const, status });

describe('leavesOutputsUncommitted', () => {
  it('is false only for the sighashes that commit every output', () => {
    expect([0x00, 0x01, 0x81].map(leavesOutputsUncommitted)).toEqual([false, false, false]);
    expect([0x02, 0x03, 0x82, 0x83].map(leavesOutputsUncommitted)).toEqual([true, true, true, true]);
  });
});

describe('findUncommittedAssetSignatures', () => {
  it('names each SINGLE/NONE input that carries or may carry an attached asset', () => {
    expect(findUncommittedAssetSignatures(
      [asset(2), unknown(0), asset(3)],
      [{ index: 0, sighashType: 0x83 }, { index: 2, sighashType: 0x03 }, { index: 3, sighashType: 0x01 }],
      undefined,
    )).toEqual([0, 2]);
  });

  it('ignores clean inputs whatever their sighash', () => {
    expect(findUncommittedAssetSignatures([], [{ index: 1, sighashType: 0x83 }], undefined)).toEqual([]);
  });

  it('exempts exactly the seller input of a proved listing', () => {
    expect(findUncommittedAssetSignatures([asset(1)], [{ index: 1, sighashType: 0x83 }], listing('proved'))).toEqual([]);
    // A proved listing is not a licence for some other input.
    expect(findUncommittedAssetSignatures([asset(0)], [{ index: 0, sighashType: 0x83 }], listing('proved'))).toEqual([0]);
  });

  it.each(['blocked', 'retry', 'caution'] as const)('does not exempt a %s listing review', status => {
    expect(findUncommittedAssetSignatures([asset(1)], [{ index: 1, sighashType: 0x83 }], listing(status))).toEqual([1]);
  });

  it('does not exempt any other proved marketplace family', () => {
    expect(findUncommittedAssetSignatures(
      [asset(1)], [{ index: 1, sighashType: 0x83 }], { family: 'accept_exact_offer', status: 'proved' },
    )).toEqual([1]);
  });
});
