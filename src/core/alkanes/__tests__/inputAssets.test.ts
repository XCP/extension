import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { fetchTransactionChainStatus } from '@/core/bitcoin/utxo';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';
import { fetchAlkanesByOutpoint, fetchAlkanesIndexedHeight } from '../api';
import {
  classifySignedInputAlkanes,
  fetchInputsAlkanes,
  MAX_ALKANES_LOOKUP_INPUTS,
} from '../inputAssets';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchAlkanesByOutpoint: vi.fn(),
  fetchAlkanesIndexedHeight: vi.fn(),
}));
vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn() }));
vi.mock('@/core/bitcoin/utxo', () => ({ fetchTransactionChainStatus: vi.fn() }));
vi.mock('@/core/settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/settings')>()), getActiveSettings: vi.fn(),
}));
const mockedFetch = vi.mocked(fetchAlkanesByOutpoint);
const mockedBitcoinHeight = vi.mocked(getCurrentBlockHeight);
const mockedIndexedHeight = vi.mocked(fetchAlkanesIndexedHeight);
const mockedStatus = vi.mocked(fetchTransactionChainStatus);

describe('Alkanes input UTXO lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue([]);
    mockedBitcoinHeight.mockResolvedValue(800_000);
    mockedIndexedHeight.mockResolvedValue(800_000);
    mockedStatus.mockResolvedValue({ confirmed: true, block_height: 799_999 });
    vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, alkanesApiBase: 'https://first.fixture.test/rpc' });
  });

  it('reports token-bearing UTXOs and omits inputs proved empty', async () => {
    mockedFetch.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: '2:0', value: '7' }]);
    const result = await fetchInputsAlkanes([
      { index: 0, txid: 'a'.repeat(64), vout: 0 },
      { index: 1, txid: 'b'.repeat(64), vout: 1 },
    ], [0, 1]);

    expect(result).toEqual([{
      inputIndex: 1,
      utxo: `${'b'.repeat(64)}:1`,
      balances: [{ id: '2:0', value: '7' }],
    }]);
  });

  it('reports lookup errors as unknown', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'));
    const result = await fetchInputsAlkanes([
      { index: 0, txid: 'a'.repeat(64), vout: 0 },
    ], [0]);

    expect(result[0]).toMatchObject({ inputIndex: 0, lookupFailed: true, balances: [] });
  });

  it('marks inputs beyond the cap unknown instead of assuming they are empty', async () => {
    const inputs = Array.from({ length: MAX_ALKANES_LOOKUP_INPUTS + 1 }, (_, index) => ({
      index,
      txid: index.toString(16).padStart(64, '0'),
      vout: 0,
    }));
    const result = await fetchInputsAlkanes(inputs, inputs.map(input => input.index));

    expect(mockedFetch).toHaveBeenCalledTimes(MAX_ALKANES_LOOKUP_INPUTS);
    expect(result).toContainEqual(expect.objectContaining({ inputIndex: 30, lookupFailed: true }));
  });

  it('classifies only inputs the wallet was asked to sign', () => {
    const entries = [
      { inputIndex: 0, utxo: 'a:0', balances: [{ id: '2:0', value: '1' }] },
      { inputIndex: 1, utxo: 'b:0', balances: [], lookupFailed: true },
      { inputIndex: 2, utxo: 'c:0', balances: [{ id: '4:7', value: '1' }] },
    ];

    expect(classifySignedInputAlkanes(entries, [0, 1])).toEqual({
      withBalances: [entries[0]],
      unknownStatus: [entries[1]],
    });
  });

  it('proves fresh Bitcoin/indexer heights before consulting an empty outpoint sheet', async () => {
    const input = { index: 0, txid: 'ab'.repeat(32), vout: 0 };
    await expect(fetchInputsAlkanes([input], [0])).resolves.toEqual([]);
    expect(mockedBitcoinHeight).toHaveBeenCalledWith(true);
    expect(mockedStatus).toHaveBeenCalledWith(input.txid);
    expect(mockedBitcoinHeight.mock.invocationCallOrder[0]).toBeLessThan(mockedIndexedHeight.mock.invocationCallOrder[0]!);
    expect(mockedIndexedHeight.mock.invocationCallOrder[0]).toBeLessThan(mockedFetch.mock.invocationCallOrder[0]!);
  });

  it('does not treat a confirmed outpoint as empty while metashrew is behind Bitcoin', async () => {
    mockedIndexedHeight.mockResolvedValue(799_999);
    await expect(fetchInputsAlkanes([
      { index: 0, txid: 'ab'.repeat(32), vout: 0, confirmed: true, blockHeight: 799_999 },
    ], [0])).resolves.toEqual([expect.objectContaining({
      inputIndex: 0, balances: [], lookupFailed: true, unknownReason: 'indexer-behind',
    })]);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('uses fresh discovery confirmation status without an extra transaction lookup', async () => {
    await expect(fetchInputsAlkanes([
      { index: 0, txid: 'ab'.repeat(32), vout: 0, confirmed: true, blockHeight: 799_999 },
    ], [0])).resolves.toEqual([]);
    expect(mockedStatus).not.toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { confirmed: false },
    { confirmed: true },
    { confirmed: true, block_height: -1 },
    { confirmed: true, block_height: 0 },
    { confirmed: true, block_height: 800_001 },
  ])('requires independently confirmed status before trusting an empty sheet: %j', async status => {
    mockedStatus.mockResolvedValue(status);
    const result = await fetchInputsAlkanes([{ index: 0, txid: 'ab'.repeat(32), vout: 0 }], [0]);
    expect(result).toEqual([expect.objectContaining({ lookupFailed: true, unknownReason: 'unconfirmed' })]);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it.each([800_001, 799_999])('invalidates the complete read window when Bitcoin moves to %i', async nextHeight => {
    mockedBitcoinHeight.mockResolvedValueOnce(800_000).mockResolvedValueOnce(nextHeight);
    const result = await fetchInputsAlkanes([{ index: 0, txid: 'ab'.repeat(32), vout: 0 }], [0]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([expect.objectContaining({ lookupFailed: true, unknownReason: 'indexer-behind' })]);
  });

  it('invalidates empty results when the indexer falls behind during the read window', async () => {
    mockedIndexedHeight.mockResolvedValueOnce(800_000).mockResolvedValueOnce(799_999);
    const result = await fetchInputsAlkanes([{ index: 0, txid: 'ab'.repeat(32), vout: 0 }], [0]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([expect.objectContaining({ lookupFailed: true, unknownReason: 'indexer-behind' })]);
  });

  it('keeps one endpoint for both freshness gates and sheets if settings change during the read', async () => {
    mockedIndexedHeight.mockImplementation(async () => {
      vi.mocked(getActiveSettings).mockReturnValue({ ...DEFAULT_SETTINGS, alkanesApiBase: 'https://second.fixture.test/rpc' });
      return 800_000;
    });
    await expect(fetchInputsAlkanes([{ index: 0, txid: 'ab'.repeat(32), vout: 0 }], [0])).resolves.toEqual([]);
    expect(mockedIndexedHeight.mock.calls).toEqual([
      ['https://first.fixture.test/rpc'], ['https://first.fixture.test/rpc'],
    ]);
    expect(mockedFetch).toHaveBeenCalledWith('ab'.repeat(32), 0, 'https://first.fixture.test/rpc');
  });
});
