import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import {
  clearZeldCaches,
  fetchZeldBalance,
  fetchZeldOutpointBalance,
  fetchZeldRewards,
  fetchZeldUtxos,
  isLikelyZeldTxid,
  parseZeldUtxos,
  zeldBaseUnitsToDisplay,
} from '@/core/zeld/api';

vi.mock('@/core/api/client', async original => ({
  ...(await original<typeof import('@/core/api/client')>()),
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(apiClient.get);
const ADDRESS = 'bc1qegs0t03e6xujm6euysgh76dg7zltw2ama9ymha';
const TXID = '00000051c6465578353e60b976023decfa5c87fd75ea99917f1935ebcd3eff38';

describe('ZELD API client', () => {
  beforeEach(() => {
    get.mockReset();
    clearZeldCaches();
  });

  it('parses the live utxos shape and drops malformed or empty entries', () => {
    expect(parseZeldUtxos([
      { balance: 409600000000, txid: TXID, vout: 0 },
      { balance: '5', txid: TXID.toUpperCase(), vout: 1 },
      { balance: 0, txid: TXID, vout: 2 },
      { balance: -1, txid: TXID, vout: 3 },
      { balance: 7, txid: 'nope', vout: 0 },
      'garbage',
    ])).toEqual([
      { txid: TXID, vout: 0, balance: 409_600_000_000n },
      { txid: TXID, vout: 1, balance: 5n },
    ]);
    expect(() => parseZeldUtxos({})).toThrow('unexpected shape');
  });

  it('fetches, sums, and caches an address balance', async () => {
    get.mockResolvedValue({ data: [{ balance: 100, txid: TXID, vout: 0 }, { balance: 23, txid: TXID, vout: 1 }] } as never);
    const balance = await fetchZeldBalance(ADDRESS);
    expect(balance.baseUnits).toBe(123n);
    expect(balance.utxos).toHaveLength(2);
    await fetchZeldUtxos(ADDRESS);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe(`https://api.zeldhash.com/addresses/${ADDRESS}/utxos`);
  });

  it('does not cache a failure', async () => {
    get.mockRejectedValueOnce(new Error('down'));
    await expect(fetchZeldUtxos(ADDRESS)).rejects.toThrow('down');
    get.mockResolvedValueOnce({ data: [] } as never);
    expect(await fetchZeldUtxos(ADDRESS)).toEqual([]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reads one outpoint and treats an unknown one as zero', async () => {
    get.mockResolvedValueOnce({ data: { balance: 42, txid: TXID, vout: 0 } } as never);
    expect(await fetchZeldOutpointBalance(TXID, 0)).toBe(42n);
    get.mockResolvedValueOnce({ data: null } as never);
    expect(await fetchZeldOutpointBalance(TXID, 1)).toBe(0n);
    expect(get.mock.calls[0]?.[0]).toBe(`https://api.zeldhash.com/utxos/${encodeURIComponent(`${TXID}:0`)}`);
  });

  it('lists rewards newest block first', async () => {
    get.mockResolvedValueOnce({ data: [
      { address: ADDRESS, block_index: 100, reward: 256_00000000, txid: TXID, vout: 0, zero_count: 6 },
      { address: ADDRESS, block_index: 200, reward: 4096_00000000, txid: TXID, vout: 0, zero_count: 7 },
    ] } as never);
    const rewards = await fetchZeldRewards(ADDRESS, 5);
    expect(rewards.map(reward => reward.block_index)).toEqual([200, 100]);
    expect(rewards[0]?.reward).toBe(409_600_000_000n);
    expect(get.mock.calls[0]?.[0]).toBe(`https://api.zeldhash.com/addresses/${ADDRESS}/rewards?limit=5&offset=0`);
  });

  it('treats the indexer no-rewards response as an empty history', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { code: 'HTTP_ERROR', status: 404,
      response: { status: 404, data: { error: 'No rewards found for address.' } } }));
    expect(await fetchZeldRewards(ADDRESS)).toEqual([]);
  });

  it.each([404, 502])('preserves other HTTP %s errors instead of claiming an empty history', async status => {
    const error = Object.assign(new Error('Unavailable'), { code: 'HTTP_ERROR', status,
      response: { status, data: { error: 'Backend unavailable' } } });
    get.mockRejectedValueOnce(error);
    await expect(fetchZeldRewards(ADDRESS)).rejects.toBe(error);
  });

  it('formats base units with eight decimals', () => {
    expect(zeldBaseUnitsToDisplay(409_600_000_000n)).toBe('4096.00000000');
    expect(zeldBaseUnitsToDisplay(0n)).toBe('0.00000000');
  });

  it('recognises a six-zero txid', () => {
    expect(isLikelyZeldTxid(TXID)).toBe(true);
    expect(isLikelyZeldTxid('00000f' + '0'.repeat(58))).toBe(false);
  });
});
