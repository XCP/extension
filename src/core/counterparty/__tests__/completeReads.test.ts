import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { clearSpentUtxoCache } from '@/core/bitcoin/spentUtxoCache';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import {
  clearApiCache, fetchAddressFairmintTotal, fetchMempoolDispenses,
  fetchMempoolLedgerEvents, fetchMempoolOpenOrders, fetchMempoolStatusEvents,
  fetchOpenBookOrders, fetchTokenBalance, fetchTokenUtxos, fetchUtxosWithBalances,
} from '../api';
import { fetchInputsAttachedAssets } from '../inputAssets';
import { selectUtxosForTransaction } from '../utxoSelection';

vi.mock('@/core/api/client');
vi.mock('@/core/bitcoin/utxo', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/bitcoin/utxo')>(), fetchUTXOs: vi.fn(),
}));
vi.mock('@/core/settings', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/settings')>(),
  getActiveSettings: vi.fn(() => ({ counterpartyApiBase: 'https://node.test' })),
}));

const get = vi.mocked(apiClient.get);
const reply = (data: unknown) => ({ data, status: 200 }) as never;

/** Model Core's cursor (the first row of the NEXT page), including a smaller server limit. */
function serve(rows: unknown[], serverLimit = 100) {
  get.mockImplementation(async (_url, config) => {
    const offset = Number(config?.params?.cursor ?? config?.params?.offset ?? 0);
    const limit = Math.min(Number(config?.params?.limit), serverLimit);
    const end = offset + limit;
    return reply({ result: rows.slice(offset, end), result_count: rows.length,
      next_cursor: end < rows.length ? end : null });
  });
}

beforeEach(() => { vi.resetAllMocks(); clearApiCache(); clearSpentUtxoCache(); });

describe('complete wallet reads through the real API client wrapper', () => {
  it('includes the eleventh and later attached assets in transaction approval', async () => {
    serve(Array.from({ length: 237 }, (_, i) => ({ asset: `ASSET${i}`, quantity: i + 1,
      quantity_normalized: String(i + 1), utxo: 'tx:0' })), 10);
    const summary = await fetchInputsAttachedAssets([{ index: 0, txid: 'tx', vout: 0 }]);
    expect(summary[0]?.assets).toHaveLength(237);
    expect(summary[0]?.assets.at(-1)?.asset).toBe('ASSET236');
    expect(get).toHaveBeenCalledTimes(24);
    expect(get.mock.calls[1]?.[1]?.params).toMatchObject({ cursor: 10 });
  });

  it('marks an input unknown when a later asset page fails', async () => {
    get.mockResolvedValueOnce(reply({ result: [{ asset: 'XCP', quantity_normalized: '1' }], result_count: 2, next_cursor: 7 }))
      .mockRejectedValueOnce(new Error('offline'));
    const summary = await fetchInputsAttachedAssets([{ index: 0, txid: 'tx', vout: 0 }]);
    expect(summary[0]).toMatchObject({ lookupFailed: true });
  });

  it('sums all 501 fairmints exactly and never returns a partial allowance', async () => {
    serve(Array.from({ length: 501 }, (_, i) => ({ tx_hash: String(i), earn_quantity_normalized: '0.00000001' })));
    expect(await fetchAddressFairmintTotal('address', 'ASSET')).toBe('0.00000501');
    clearApiCache();
    get.mockReset().mockResolvedValueOnce(reply({ result: [{ earn_quantity_normalized: '1' }], next_cursor: 0, result_count: 2 }))
      .mockRejectedValueOnce(new Error('offline'));
    expect(await fetchAddressFairmintTotal('address', 'ASSET')).toBeNull();
    expect(get.mock.calls[1]?.[1]?.params).toMatchObject({ cursor: 0 });
  });

  it('aggregates all token balances and attached outputs beyond 100', async () => {
    serve(Array.from({ length: 201 }, (_, i) => ({ asset: 'ASSET', utxo: `tx:${i}`, quantity: '1', quantity_normalized: '1' })));
    expect((await fetchTokenBalance('address', 'ASSET')).quantity_normalized).toBe('201');
    expect(await fetchTokenUtxos('address', 'ASSET')).toHaveLength(201);
  });

  it.each([fetchMempoolLedgerEvents, fetchMempoolStatusEvents])('reads every address event with cursors only', async read => {
    serve(Array.from({ length: 205 }, (_, i) => ({ tx_hash: String(i), event: 'DEBIT', params: { address: 'address' } })));
    expect((await read(['address'])).result).toHaveLength(205);
    for (const call of get.mock.calls) expect(call[1]?.params).not.toHaveProperty('offset');
  });

  it('reads address-specific competing dispenses and filters the LIKE superset', async () => {
    serve(Array.from({ length: 205 }, (_, i) => ({ tx_hash: String(i), params: { source: i === 204 ? 'address' : 'address-extra' } })));
    expect(await fetchMempoolDispenses('address')).toHaveLength(1);
    expect(get.mock.calls[0]?.[0]).toBe('https://node.test/v2/addresses/mempool');
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ addresses: 'address', event_name: 'DISPENSE' });
  });

  it('does not truncate pending orders or the resting book used for quotes', async () => {
    serve(Array.from({ length: 1001 }, (_, i) => ({ tx_hash: String(i), params: { status: 'open' } })));
    expect(await fetchMempoolOpenOrders()).toHaveLength(1001);
    expect(await fetchOpenBookOrders('XCP', 'ASSET')).toHaveLength(1001);
  });

  it('fails on a repeated cursor or prematurely ended list instead of claiming completeness', async () => {
    get.mockResolvedValue(reply({ result: [{ tx_hash: 'tx' }], next_cursor: 7, result_count: 3 }));
    await expect(fetchMempoolLedgerEvents(['address'])).rejects.toThrow(/repeated/);
    clearApiCache();
    get.mockResolvedValue(reply({ result: [], next_cursor: null, result_count: 1 }));
    await expect(fetchMempoolLedgerEvents(['address'])).rejects.toThrow(/incomplete/);
  });

  it('uses offsets on older nodes without cursor metadata, respecting their smaller pages', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ asset: 'ASSET', utxo: `tx:${i}`, quantity_normalized: '1' }));
    get.mockImplementation(async (_url, config) => {
      const offset = Number(config?.params?.offset ?? 0);
      return reply({ result: rows.slice(offset, offset + 3), result_count: rows.length });
    });
    expect(await fetchTokenUtxos('address', 'ASSET')).toHaveLength(7);
    expect(get.mock.calls.map(call => call[1]?.params?.offset)).toEqual([undefined, 3, 6]);
  });

  it('checks more than 100 candidates in bounded batches before forming the wallet inputs_set', async () => {
    const utxos = Array.from({ length: 121 }, (_, i) => ({ txid: i.toString(16).padStart(64, '0'), vout: 0,
      value: i + 1000, status: { confirmed: true, block_height: 1, block_hash: '', block_time: 0 } }));
    vi.mocked(fetchUTXOs).mockResolvedValue(utxos);
    const held = `${utxos[120]!.txid}:0`;
    get.mockImplementation(async (url, config) => {
      expect(url).toBe('https://node.test/v2/utxos/withbalances');
      const batch = String(config?.params?.utxos).split(',');
      expect(batch.length).toBeLessThanOrEqual(20);
      return reply({ result: Object.fromEntries(batch.map(utxo => [utxo, utxo === held])) });
    });
    const selected = await selectUtxosForTransaction('address');
    expect(selected.excludedWithAssets).toBe(1);
    expect(selected.inputsSet).not.toContain(held);
    expect(selected.utxos[0]?.txid).toBe(utxos[119]?.txid);
    expect(get).toHaveBeenCalledTimes(7);
  });

  it('never assumes an omitted membership result means no attached assets', async () => {
    get.mockResolvedValue(reply({ result: {} }));
    await expect(fetchUtxosWithBalances(['tx:0'])).rejects.toThrow('Unable to verify');
  });
});
