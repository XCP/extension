import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchInputsAttachedAssets, MAX_ASSET_LOOKUP_INPUTS } from '../useSignPsbtRequest';
import { fetchUtxoBalances } from '@/utils/blockchain/counterparty/api';

vi.mock('@/utils/blockchain/counterparty/api');

const mockedFetch = vi.mocked(fetchUtxoBalances);

function page(result: unknown[]) {
  return { result, next_cursor: null, result_count: result.length } as never;
}

const input = (index: number, txid = `${index}`.repeat(64).slice(0, 64), vout = 0) => ({
  index,
  txid,
  vout,
});

describe('fetchInputsAttachedAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only inputs that carry assets, keyed by input index', async () => {
    mockedFetch.mockImplementation(async (utxo: string) => {
      if (utxo.startsWith('aaaa')) {
        return page([
          { asset: 'PEPECASH', quantity_normalized: '1000.00000000', asset_info: { asset_longname: null } },
        ]);
      }
      return page([]);
    });

    const assets = await fetchInputsAttachedAssets([
      input(0, 'aaaa'.repeat(16)),
      input(1, 'bbbb'.repeat(16)),
    ]);

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      inputIndex: 0,
      utxo: `${'aaaa'.repeat(16)}:0`,
      assets: [{ asset: 'PEPECASH', quantity_normalized: '1000.00000000', asset_longname: null }],
    });
  });

  it('prefers the asset longname when present', async () => {
    mockedFetch.mockResolvedValue(
      page([
        { asset: 'A95428956661682177', quantity_normalized: '1', asset_info: { asset_longname: 'MYPROJECT.RARE' } },
      ])
    );

    const assets = await fetchInputsAttachedAssets([input(0)]);
    expect(assets[0]!.assets[0]!.asset_longname).toBe('MYPROJECT.RARE');
  });

  it('treats a failed lookup as no assets rather than throwing', async () => {
    mockedFetch.mockRejectedValue(new Error('indexer down'));

    await expect(fetchInputsAttachedAssets([input(0)])).resolves.toEqual([]);
  });

  it('builds the UTXO string as txid:vout in display order', async () => {
    mockedFetch.mockResolvedValue(page([]));
    await fetchInputsAttachedAssets([input(3, 'dead'.repeat(16), 2)]);
    expect(mockedFetch).toHaveBeenCalledWith(`${'dead'.repeat(16)}:2`);
  });

  it('caps the number of lookups and warns on truncation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedFetch.mockResolvedValue(page([]));

    const many = Array.from({ length: MAX_ASSET_LOOKUP_INPUTS + 5 }, (_, i) =>
      input(i, `${i}`.padStart(64, '0'))
    );
    await fetchInputsAttachedAssets(many);

    expect(mockedFetch).toHaveBeenCalledTimes(MAX_ASSET_LOOKUP_INPUTS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('only the first'));
    warn.mockRestore();
  });

  it('drops balance rows missing an asset or quantity', async () => {
    mockedFetch.mockResolvedValue(
      page([
        { asset: 'XCP', quantity_normalized: '5.00000000' },
        { asset: '', quantity_normalized: '1' },
        { asset: 'GHOST', quantity_normalized: '' },
      ])
    );

    const assets = await fetchInputsAttachedAssets([input(0)]);
    expect(assets[0]!.assets).toEqual([
      { asset: 'XCP', quantity_normalized: '5.00000000', asset_longname: null },
    ]);
  });
});
