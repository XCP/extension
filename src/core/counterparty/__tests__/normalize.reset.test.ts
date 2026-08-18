import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asDisplayUnits } from '@/core/numeric';
import type { AssetInfo } from '../api';
import * as api from '../api';
import { normalizeFormData } from '../normalize';

vi.mock('../api', () => ({
  fetchAssetDetails: vi.fn(),
}));

const mockFetchAssetDetails = vi.mocked(api.fetchAssetDetails);

/** An existing, currently indivisible asset. */
function indivisibleAsset(): AssetInfo {
  return {
    asset: 'MYASSET',
    asset_longname: null,
    description: '',
    issuer: 'bc1qowner',
    divisible: false,
    locked: false,
    supply: '1000',
    supply_normalized: asDisplayUnits('1000'),
  };
}

function resetForm(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set('asset', 'MYASSET');
  formData.set('reset', 'true');
  for (const [k, v] of Object.entries(fields)) formData.set(k, v);
  return formData;
}

describe('normalizeFormData — reset issuance divisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAssetDetails.mockResolvedValue(indivisibleAsset());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('scales a reset quantity by the divisibility the form asks for, not the ledger\'s', async () => {
    // The asset is indivisible today. A reset is the only issuance core lets change that, and it
    // records the message's own `divisible`, so a supply of 5 divisible units must go out as
    // 500000000 base units. Scaling by the ledger's current `false` would send 5 — a supply 1e8
    // smaller than the one the user typed.
    const result = await normalizeFormData(resetForm({ quantity: '5', divisible: 'true' }), 'issuance');

    expect(result.normalizedData.quantity).toBe('500000000');
    expect(result.normalizedData.divisible).toBe(true);
    expect(result.normalizedData.reset).toBe(true);
  });

  it('keeps a reset quantity whole when the form asks for an indivisible asset', async () => {
    const result = await normalizeFormData(
      resetForm({ quantity: '2026', divisible: 'false' }),
      'issuance'
    );

    expect(result.normalizedData.quantity).toBe('2026');
    expect(result.normalizedData.divisible).toBe(false);
  });

  it('truncates a fractional quantity when the reset makes the asset indivisible', async () => {
    mockFetchAssetDetails.mockResolvedValue({ ...indivisibleAsset(), divisible: true });

    const result = await normalizeFormData(
      resetForm({ quantity: '7.9', divisible: 'false' }),
      'issuance'
    );

    expect(result.normalizedData.quantity).toBe('7');
  });

  it('still reads divisibility from the ledger for a non-reset reissuance', async () => {
    // Without `reset`, core rejects any change of divisibility, so the ledger is authoritative and
    // a form value must not be able to rescale the quantity.
    mockFetchAssetDetails.mockResolvedValue({ ...indivisibleAsset(), divisible: true });

    const formData = new FormData();
    formData.set('asset', 'MYASSET');
    formData.set('quantity', '3');
    formData.set('divisible', 'false');

    const result = await normalizeFormData(formData, 'issuance');

    expect(result.normalizedData.quantity).toBe('300000000');
  });
});
