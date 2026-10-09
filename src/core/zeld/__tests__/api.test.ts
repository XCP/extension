import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { invalidateAddressBalances } from '@/core/balances/invalidate';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import {
  clearZeldCaches,
  fetchZeldBalance,
  fetchZeldOutpointBalance,
  fetchZeldOutpointBalances,
  fetchZeldRewards,
  fetchZeldUtxos,
  isLikelyZeldTxid,
  parseZeldUtxos,
  setZeldUtxoReadListener,
  zeldBaseUnitsToDisplay,
} from '@/core/zeld/api';

vi.mock('@/core/api/client', async original => ({
  ...(await original<typeof import('@/core/api/client')>()),
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
vi.mock('@/core/bitcoin/utxo', async original => ({
  ...(await original<typeof import('@/core/bitcoin/utxo')>()),
  fetchUTXOs: vi.fn(),
}));
const ADDRESS = 'bc1qegs0t03e6xujm6euysgh76dg7zltw2ama9ymha';
const TXID = '00000051c6465578353e60b976023decfa5c87fd75ea99917f1935ebcd3eff38';

describe('ZELD API client', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    vi.mocked(fetchUTXOs).mockReset().mockRejectedValue(new Error('UTXO discovery failed'));
    setZeldUtxoReadListener(null);
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
    await expect(fetchZeldUtxos(ADDRESS)).rejects.toThrow('UTXO discovery failed');
    get.mockResolvedValueOnce({ data: [] } as never);
    expect(await fetchZeldUtxos(ADDRESS)).toEqual([]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('a manual wallet refresh replaces a cached zero without invalidating another address', async () => {
    get.mockResolvedValue({ data: [] } as never);
    await fetchZeldBalance(ADDRESS);
    await fetchZeldBalance('another-address');
    invalidateAddressBalances(ADDRESS);
    get.mockResolvedValue({ data: [{ balance: 123, txid: TXID, vout: 0 }] } as never);
    expect((await fetchZeldBalance(ADDRESS)).baseUnits).toBe(123n);
    expect((await fetchZeldBalance('another-address')).baseUnits).toBe(0n);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('a failed pre-refresh request cannot evict the fresh answer', async () => {
    let fail!: (error: Error) => void;
    get.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const old = fetchZeldBalance(ADDRESS);
    const rejected = expect(old).rejects.toThrow('UTXO discovery failed');
    invalidateAddressBalances(ADDRESS);
    get.mockResolvedValue({ data: [{ balance: 123, txid: TXID, vout: 0 }] } as never);
    await fetchZeldBalance(ADDRESS);
    fail(new Error('old request failed'));
    await rejected;
    expect((await fetchZeldBalance(ADDRESS)).baseUnits).toBe(123n);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reads one outpoint and treats an unknown one as zero', async () => {
    get.mockResolvedValueOnce({ data: { balance: 42, txid: TXID, vout: 0 } } as never);
    expect(await fetchZeldOutpointBalance(TXID, 0)).toBe(42n);
    get.mockResolvedValueOnce({ data: null } as never);
    expect(await fetchZeldOutpointBalance(TXID, 1)).toBe(0n);
    expect(get.mock.calls[0]?.[0]).toBe(`https://api.zeldhash.com/utxos/${encodeURIComponent(`${TXID}:0`)}`);
  });

  it.each([400, 502, 'TIMEOUT'])('recovers the full balance after address lookup failure %s', async status => {
    get.mockRejectedValue(Object.assign(new Error('address lookup failed'), {
      code: status === 'TIMEOUT' ? 'TIMEOUT' : 'HTTP_ERROR', status,
    }));
    // The reported wallet had 1501 confirmed and 11 unconfirmed Bitcoin outputs.
    const coins = Array.from({ length: 1512 }, (_, vout) => ({
      txid: TXID, vout, value: 546, status: { confirmed: vout < 1501 },
    }));
    vi.mocked(fetchUTXOs).mockResolvedValue(coins as never);
    post.mockImplementation(async (_url, body) => ({ data: (body as { utxos: string[] }).utxos.map(outpoint => ({
      txid: TXID, vout: Number(outpoint.split(':')[1]), balance: outpoint === `${TXID}:1500` ? '409600000000' : 0,
    })) } as never));
    const listener = vi.fn();
    setZeldUtxoReadListener(listener);
    expect((await fetchZeldBalance(ADDRESS)).baseUnits).toBe(409600000000n);
    expect(post).toHaveBeenCalledTimes(16);
    expect(post.mock.calls.every(([url, body]) => url === 'https://api.zeldhash.com/utxos'
      && (body as { utxos: string[] }).utxos.length <= 100)).toBe(true);
    expect(post.mock.calls.flatMap(([, body]) => (body as { utxos: string[] }).utxos)).toHaveLength(1501);
    expect(listener).toHaveBeenCalledExactlyOnceWith(ADDRESS, [{ txid: TXID, vout: 1500, balance: 409600000000n }]);
    await fetchZeldBalance(ADDRESS);
    expect(post).toHaveBeenCalledTimes(16);
  });

  it('does not return or record a partial total when a later batch fails', async () => {
    get.mockRejectedValue(new Error('address limit'));
    vi.mocked(fetchUTXOs).mockResolvedValue(Array.from({ length: 101 }, (_, vout) => ({
      txid: TXID, vout, status: { confirmed: true }, value: 546,
    })) as never);
    post.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, vout) => ({ txid: TXID, vout, balance: 1 })) } as never)
      .mockRejectedValueOnce(new Error('batch down'));
    const listener = vi.fn();
    setZeldUtxoReadListener(listener);
    await expect(fetchZeldBalance(ADDRESS)).rejects.toThrow('batch down');
    expect(listener).not.toHaveBeenCalled();
    get.mockResolvedValueOnce({ data: [] } as never);
    expect((await fetchZeldBalance(ADDRESS)).baseUnits).toBe(0n);
  });

  it.each([
    [],
    [{ txid: TXID, vout: 0, balance: 'invalid' }],
    [{ txid: TXID, vout: 1, balance: 10 }],
    [{ txid: TXID, vout: 0, balance: 10 }, { txid: TXID, vout: 0, balance: 10 }],
  ].map(data => ({ data })))('rejects an incomplete, malformed, unexpected, or duplicate batch response: %j', async ({ data }) => {
    post.mockResolvedValue({ data } as never);
    await expect(fetchZeldOutpointBalances([{ txid: TXID, vout: 0 }])).rejects.toThrow(/batch response/);
  });

  it('counts explicit zero balances and deduplicates inputs without rounding large amounts', async () => {
    post.mockResolvedValue({ data: [
      { txid: TXID, vout: 0, balance: '9007199254740993' }, { txid: TXID, vout: 1, balance: 0 },
    ] } as never);
    expect(await fetchZeldOutpointBalances([{ txid: TXID, vout: 0 }, { txid: TXID.toUpperCase(), vout: 0 }, { txid: TXID, vout: 1 }]))
      .toEqual([{ txid: TXID, vout: 0, balance: 9007199254740993n }]);
    expect(post.mock.calls[0]?.[1]).toEqual({ utxos: [`${TXID}:0`, `${TXID}:1`] });
  });

  it('does not start a fallback after cancellation', async () => {
    const abort = new AbortController();
    abort.abort();
    get.mockRejectedValue(abort.signal.reason);
    await expect(fetchZeldUtxos(ADDRESS, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchUTXOs).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not overwrite the current record with a successful read started before refresh', async () => {
    let resolveOld!: (response: never) => void;
    get.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const listener = vi.fn();
    setZeldUtxoReadListener(listener);
    const old = fetchZeldUtxos(ADDRESS);
    clearZeldCaches(ADDRESS);
    get.mockResolvedValueOnce({ data: [{ txid: TXID, vout: 0, balance: 20 }] } as never);
    await fetchZeldUtxos(ADDRESS);
    resolveOld({ data: [] } as never);
    await old;
    expect(listener).toHaveBeenCalledExactlyOnceWith(ADDRESS, [{ txid: TXID, vout: 0, balance: 20n }]);
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
