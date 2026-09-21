import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRawInteger } from '@/core/amount-contract/amounts';
import { apiClient } from '@/core/api/client';
import { CounterpartyApiError } from '@/core/errors';
import { fetchAssetDetails } from '../api';
import { composeMPMA, composeSend, composeTransaction } from '../compose';
import { normalizeFormData, verifiedReviewParams } from '../normalize';

vi.mock('@/core/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('../api', () => ({ fetchAssetDetails: vi.fn() }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => null }));
vi.mock('@/core/counterparty/utxoSelection', () => ({ selectUtxosForTransaction: vi.fn().mockRejectedValue(new Error('unavailable')) }));
vi.mock('@/core/settings', () => ({ getActiveSettings: () => ({ counterpartyApiBase: 'https://api.example', allowUnconfirmedTxs: false }) }));

const form = (fields: Record<string, string>) => {
  const value = new FormData();
  for (const [key, entry] of Object.entries(fields)) value.set(key, entry);
  return value;
};

beforeEach(() => vi.clearAllMocks());

describe('native display-unit normalization', () => {
  it.each(['-5', '1e5', '1,234', '0,5', '1.2.3', '1.000000000', '1\n2', '', '1.'])('rejects complete invalid draft %s before compose', async quantity => {
    await expect(normalizeFormData(form({ asset: 'XCP', quantity }), 'send')).rejects.toThrow();
  });
  it('a network failure cannot turn an existing issuance into a new asset', async () => {
    vi.mocked(fetchAssetDetails).mockRejectedValueOnce(new Error('offline'));
    await expect(normalizeFormData(form({ asset: 'TOKEN', quantity: '5', divisible: 'true' }), 'issuance')).rejects.toThrow('offline');
  });
  it('confirmed absence uses the explicit new-issuance divisibility', async () => {
    vi.mocked(fetchAssetDetails).mockRejectedValueOnce(new CounterpartyApiError('missing', '/assets/TOKEN', { statusCode: 404 }));
    const result = await normalizeFormData(form({ asset: 'TOKEN', quantity: '5', divisible: 'true' }), 'issuance');
    expect(result.normalizedData.quantity).toBe('500000000');
  });
  it('review uses checked quantities and independently read metadata above double precision', async () => {
    vi.mocked(fetchAssetDetails).mockResolvedValueOnce({ asset: 'TOKEN', divisible: false } as any);
    const result = await normalizeFormData(form({ give_asset: 'XCP', give_quantity: '100000000.00000001', get_asset: 'TOKEN', get_quantity: '100' }), 'order');
    const params = verifiedReviewParams('order', result.normalizedData, result.assetInfoCache);
    expect(params).toMatchObject({ give_quantity: '10000000000000001', give_quantity_normalized: '100000000.00000001', get_quantity: '100', get_quantity_normalized: '100', get_asset_info: { divisible: false } });
  });
  it.each(['1,5', '-5', '1e2', '1.000000000'])('rejects fee %s even for a broadcast', async sat_per_vbyte => {
    await expect(normalizeFormData(form({ text: 'test', sat_per_vbyte }), 'broadcast')).rejects.toThrow();
  });
  it('converts each MPMA asset separately and rejects fractional indivisible rows', async () => {
    vi.mocked(fetchAssetDetails).mockResolvedValue({ asset: 'TOKEN', divisible: false } as any);
    const result = await normalizeFormData(form({ assets: 'XCP,TOKEN', quantities: '1.5,100', destinations: 'a,b' }), 'mpma');
    expect(result.normalizedData.quantities).toBe('150000000,100');
    expect(verifiedReviewParams('mpma', result.normalizedData, result.assetInfoCache)).toMatchObject({
      asset_dest_quant_list: [['XCP', 'a', '150000000'], ['TOKEN', 'b', '100']],
      verified_asset_info: { XCP: { divisible: true }, TOKEN: { divisible: false } },
    });
    await expect(normalizeFormData(form({ assets: 'XCP,TOKEN', quantities: '1.5,0.5' }), 'mpma')).rejects.toMatchObject({ code: 'amount_precision' });
  });
});

describe('native raw compose boundary', () => {
  it.each(['fee_fraction', 'minted_asset_commission'])('rejects %s when Core float conversion would lose a base unit', async field => {
    expect(Math.trunc(0.29 * 1e8)).toBe(28999999);
    await expect(composeTransaction('broadcast', { [field]: '0.29' }, 'source', 1)).rejects.toThrow('cannot encode');
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it.each(['1.5', '1,234', '1e3', '-5', '9223372036854775808', Number.MAX_SAFE_INTEGER + 1])('rejects raw quantity %s before any request', async quantity => {
    await expect(composeSend({ sourceAddress: 'source', destination: 'destination', asset: 'XCP', quantity, sat_per_vbyte: 1 })).rejects.toThrow();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it('generic entry point cannot bypass raw validation', async () => {
    await expect(composeTransaction('order', { give_quantity: '0.5' }, 'source', 1)).rejects.toThrow();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it('MPMA raw arrays cannot bypass validation', async () => {
    await expect(composeMPMA({ sourceAddress: 'source', assets: ['XCP', 'XCP'], destinations: ['a', 'b'], quantities: ['100', '1,5'], sat_per_vbyte: 1 })).rejects.toThrow();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it('serializes exact raw units and fee without exponent or rounding', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('stop before transaction response'));
    await expect(composeSend({ sourceAddress: 'source', destination: 'destination', asset: 'XCP', quantity: '10000000000000001', sat_per_vbyte: 0.101 })).rejects.toThrow('stop before');
    const params = new URL(String(vi.mocked(apiClient.get).mock.calls[0]![0])).searchParams;
    expect(params.get('quantity')).toBe('10000000000000001');
    expect(params.get('sat_per_vbyte')).toBe('0.101');
    expect(parseRawInteger(params.get('quantity')!)).toBe(10000000000000001n);
  });
});
