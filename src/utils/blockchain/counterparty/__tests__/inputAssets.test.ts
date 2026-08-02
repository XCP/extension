import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fetchInputsAttachedAssets,
  classifySignedInputAssets,
  MAX_ASSET_LOOKUP_INPUTS,
  type InputAttachedAssets,
} from '../inputAssets';
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

  it('reports a failed lookup as unknown status, not as clean', async () => {
    mockedFetch.mockRejectedValue(new Error('indexer down'));

    const result = await fetchInputsAttachedAssets([input(0)]);
    expect(result).toEqual([
      { inputIndex: 0, utxo: `${input(0).txid}:0`, assets: [], lookupFailed: true },
    ]);
  });

  it('omits inputs confirmed empty but keeps ones that failed', async () => {
    mockedFetch.mockImplementation(async (utxo: string) => {
      if (utxo.startsWith('aaaa')) throw new Error('rate limited');
      return page([]); // confirmed empty
    });

    const result = await fetchInputsAttachedAssets([
      input(0, 'aaaa'.repeat(16)), // failed -> kept as unknown
      input(1, 'bbbb'.repeat(16)), // clean  -> omitted
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ inputIndex: 0, lookupFailed: true, assets: [] });
  });

  it('builds the UTXO string as txid:vout in display order', async () => {
    mockedFetch.mockResolvedValue(page([]));
    await fetchInputsAttachedAssets([input(3, 'dead'.repeat(16), 2)]);
    expect(mockedFetch).toHaveBeenCalledWith(`${'dead'.repeat(16)}:2`);
  });

  it('caps the number of lookups', async () => {
    mockedFetch.mockResolvedValue(page([]));

    const many = Array.from({ length: MAX_ASSET_LOOKUP_INPUTS + 5 }, (_, i) =>
      input(i, `${i}`.padStart(64, '0'))
    );
    await fetchInputsAttachedAssets(many);

    expect(mockedFetch).toHaveBeenCalledTimes(MAX_ASSET_LOOKUP_INPUTS);
  });

  it('reports an input the cap displaced as unknown, never as empty', async () => {
    mockedFetch.mockResolvedValue(page([]));

    const many = Array.from({ length: MAX_ASSET_LOOKUP_INPUTS + 5 }, (_, i) =>
      input(i, `${i}`.padStart(64, '0'))
    );
    const assets = await fetchInputsAttachedAssets(many);

    for (let index = MAX_ASSET_LOOKUP_INPUTS; index < many.length; index++) {
      const entry = assets.find((a) => a.inputIndex === index);
      expect(entry?.lookupFailed, `input ${index} must be reported unknown`).toBe(true);
    }
  });

  it('checks a signed input even when padding would push it past the cap', async () => {
    const assetTxid = 'ab'.repeat(32);
    mockedFetch.mockImplementation(async (utxo: string) =>
      utxo.startsWith(assetTxid)
        ? page([{ asset: 'RAREPEPE', quantity_normalized: '1.00000000', asset_info: { asset_longname: null } }])
        : page([])
    );

    const padding = Array.from({ length: MAX_ASSET_LOOKUP_INPUTS }, (_, i) =>
      input(i, `${i}`.padStart(64, '0'))
    );
    const victimIndex = MAX_ASSET_LOOKUP_INPUTS;
    const inputs = [...padding, input(victimIndex, assetTxid)];

    const assets = await fetchInputsAttachedAssets(inputs, [victimIndex]);
    const { withAssets, unknownStatus } = classifySignedInputAssets(assets, [victimIndex]);

    expect(withAssets).toHaveLength(1);
    expect(withAssets[0]?.inputIndex).toBe(victimIndex);
    expect(withAssets[0]?.assets[0]?.asset).toBe('RAREPEPE');
    expect(unknownStatus).toHaveLength(0);
  });

  it('reports a signed input as unknown when it is displaced and not prioritised', async () => {
    mockedFetch.mockResolvedValue(page([]));

    const inputs = Array.from({ length: MAX_ASSET_LOOKUP_INPUTS + 1 }, (_, i) =>
      input(i, `${i}`.padStart(64, '0'))
    );
    const victimIndex = MAX_ASSET_LOOKUP_INPUTS;

    // No signed indices supplied, so the displaced input cannot be prioritised.
    const assets = await fetchInputsAttachedAssets(inputs);
    const { withAssets, unknownStatus } = classifySignedInputAssets(assets, [victimIndex]);

    expect(withAssets).toHaveLength(0);
    expect(unknownStatus).toHaveLength(1);
    expect(unknownStatus[0]?.inputIndex).toBe(victimIndex);
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

describe('classifySignedInputAssets', () => {
  const withAsset = (inputIndex: number): InputAttachedAssets => ({
    inputIndex,
    utxo: `tx:${inputIndex}`,
    assets: [{ asset: 'XCP', quantity_normalized: '1', asset_longname: null }],
  });
  const failed = (inputIndex: number): InputAttachedAssets => ({
    inputIndex,
    utxo: `tx:${inputIndex}`,
    assets: [],
    lookupFailed: true,
  });

  it('splits signed inputs into with-assets and unknown-status', () => {
    const r = classifySignedInputAssets([withAsset(0), failed(1)], [0, 1]);
    expect(r.withAssets.map(e => e.inputIndex)).toEqual([0]);
    expect(r.unknownStatus.map(e => e.inputIndex)).toEqual([1]);
  });

  it('ignores assets on inputs the wallet is not signing', () => {
    const r = classifySignedInputAssets([withAsset(2), failed(3)], [0, 1]);
    expect(r.withAssets).toEqual([]);
    expect(r.unknownStatus).toEqual([]);
  });

  it('treats a signed input with no entry as clean (in neither list)', () => {
    const r = classifySignedInputAssets([], [0, 1]);
    expect(r.withAssets).toEqual([]);
    expect(r.unknownStatus).toEqual([]);
  });

  it('classifies only the signed subset when some inputs carry assets and others fail', () => {
    // index 0 assets (signed), 1 failed (signed), 2 assets (NOT signed)
    const r = classifySignedInputAssets([withAsset(0), failed(1), withAsset(2)], [0, 1]);
    expect(r.withAssets.map(e => e.inputIndex)).toEqual([0]);
    expect(r.unknownStatus.map(e => e.inputIndex)).toEqual([1]);
  });
});
