import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAlkanesByOutpoint } from '../api';
import {
  classifySignedInputAlkanes,
  fetchInputsAlkanes,
  MAX_ALKANES_LOOKUP_INPUTS,
} from '../inputAssets';

vi.mock('../api', () => ({ fetchAlkanesByOutpoint: vi.fn() }));
const mockedFetch = vi.mocked(fetchAlkanesByOutpoint);

describe('Alkanes input UTXO lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue([]);
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
});
