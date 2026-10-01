import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import {
  checkOutspend,
  checkOutspends,
  MAX_OUTSPEND_LOOKUPS_PER_PASS,
  OUTSPEND_RECHECK_MS,
  OUTSPEND_SOURCES,
  OUTSPEND_TIMEOUT_MS,
  resetOutspendChecks,
} from '@/core/bitcoin/outspend';

vi.mock('@/core/api/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/api/client')>(),
  apiClient: { get: vi.fn() },
}));

const TXID = 'a'.repeat(64);
const OUTPOINT = `${TXID}:1`;
const [MEMPOOL, BLOCKSTREAM] = OUTSPEND_SOURCES;

type Reply = unknown;
const NOT_FOUND = { status: 404 };
/** Answers per URL; anything unlisted is a network error. */
function serve(replies: Record<string, Reply>) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const reply = replies[url];
    if (reply === undefined) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
    if (reply === NOT_FOUND) throw Object.assign(new Error('HTTP 404'), { code: 'HTTP_ERROR', status: 404 });
    return { data: reply, status: 200, statusText: 'OK', headers: {} };
  });
}
const outspend = (source: string, txid = TXID) => `${source}/tx/${txid}/outspend/1`;
const tx = (source: string) => `${source}/tx/${TXID}`;
const spentConfirmed = { spent: true, txid: 'c'.repeat(64), vin: 0, status: { confirmed: true, block_height: 900_000 } };
const spentInMempool = { spent: true, txid: 'c'.repeat(64), vin: 0, status: { confirmed: false } };
const unspent = { spent: false };

describe('asking the chain whether a missed locked coin is gone', () => {
  beforeEach(() => { vi.mocked(apiClient.get).mockReset(); resetOutspendChecks(); });

  it('says spent when the sources show a confirmed spend, asking each fresh with its own short clock', async () => {
    serve({ [outspend(MEMPOOL)]: spentConfirmed, [outspend(BLOCKSTREAM)]: spentConfirmed });
    expect(await checkOutspend(OUTPOINT)).toBe('spent');
    expect(vi.mocked(apiClient.get).mock.calls.map(([url]) => url)).toEqual([outspend(MEMPOOL), outspend(BLOCKSTREAM)]);
    expect(vi.mocked(apiClient.get).mock.calls[0]![1]).toMatchObject({ timeout: OUTSPEND_TIMEOUT_MS, retries: 0, cache: 'no-store' });
  });

  it('keeps the lock when one source confirms a spend but the other cannot answer', async () => {
    serve({ [outspend(BLOCKSTREAM)]: spentConfirmed });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
    serve({ [outspend(MEMPOOL)]: spentConfirmed, [outspend(BLOCKSTREAM)]: { ...spentConfirmed, txid: 'd'.repeat(64) } });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
  });

  it('keeps a coin spent only in the mempool, which may yet be replaced', async () => {
    serve({ [outspend(MEMPOOL)]: spentInMempool, [outspend(BLOCKSTREAM)]: spentInMempool });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
    serve({ [outspend(MEMPOOL)]: spentInMempool, [outspend(BLOCKSTREAM)]: spentConfirmed });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
  });

  it('keeps a coin the sources disagree about', async () => {
    serve({ [outspend(MEMPOOL)]: spentConfirmed, [outspend(BLOCKSTREAM)]: unspent, [tx(MEMPOOL)]: {}, [tx(BLOCKSTREAM)]: {} });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
  });

  it('keeps a coin when every lookup fails or answers nonsense', async () => {
    serve({});
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
    serve({ [outspend(MEMPOOL)]: { spent: 'yes' }, [outspend(BLOCKSTREAM)]: { spent: true } });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
    expect(await checkOutspend('not-an-outpoint')).toBe('keep');
  });

  it('says unknown only when both sources answer 404 for the funding transaction', async () => {
    serve({ [outspend(MEMPOOL)]: NOT_FOUND, [outspend(BLOCKSTREAM)]: NOT_FOUND, [tx(MEMPOOL)]: NOT_FOUND, [tx(BLOCKSTREAM)]: NOT_FOUND });
    expect(await checkOutspend(OUTPOINT)).toBe('unknown');
    serve({ [outspend(MEMPOOL)]: NOT_FOUND, [outspend(BLOCKSTREAM)]: NOT_FOUND, [tx(MEMPOOL)]: NOT_FOUND, [tx(BLOCKSTREAM)]: {} });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
    // A timeout is not a 404.
    serve({ [tx(MEMPOOL)]: NOT_FOUND });
    expect(await checkOutspend(OUTPOINT)).toBe('keep');
  });

  it('checks a bounded number of coins per pass, and each again only after a while', async () => {
    serve({});
    const perPass = MAX_OUTSPEND_LOOKUPS_PER_PASS / (OUTSPEND_SOURCES.length * 2);
    const candidates = Array.from({ length: perPass + 3 }, (_, index) => `${index.toString(16).padStart(64, '0')}:1`);
    const outspendCalls = () => vi.mocked(apiClient.get).mock.calls.filter(([url]) => String(url).includes('/outspend/')).length;

    await checkOutspends(candidates, 0);
    expect(outspendCalls()).toBe(perPass * OUTSPEND_SOURCES.length);
    // The next pass reaches the rest, not the ones just checked.
    vi.mocked(apiClient.get).mockClear();
    await checkOutspends(candidates, 1_000);
    expect(outspendCalls()).toBe(3 * OUTSPEND_SOURCES.length);
    vi.mocked(apiClient.get).mockClear();
    await checkOutspends(candidates, 2_000);
    expect(outspendCalls()).toBe(0);
    await checkOutspends(candidates, OUTSPEND_RECHECK_MS);
    expect(outspendCalls()).toBe(perPass * OUTSPEND_SOURCES.length);
  });

  it('reports each coin\'s verdict', async () => {
    const other = 'b'.repeat(64);
    serve({
      [outspend(MEMPOOL)]: spentConfirmed, [outspend(BLOCKSTREAM)]: spentConfirmed,
      [outspend(MEMPOOL, other)]: NOT_FOUND, [outspend(BLOCKSTREAM, other)]: NOT_FOUND,
      [`${MEMPOOL}/tx/${other}`]: NOT_FOUND, [`${BLOCKSTREAM}/tx/${other}`]: NOT_FOUND,
    });
    expect(await checkOutspends([OUTPOINT, `${other}:1`], 0)).toEqual({ spent: [OUTPOINT], unknown: [`${other}:1`] });
  });

  it('bounds every request including orphan checks and reaches later coins on infrequent reads', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(Object.assign(new Error('missing'), { code: 'HTTP_ERROR', status: 404 }));
    const perPass = MAX_OUTSPEND_LOOKUPS_PER_PASS / (OUTSPEND_SOURCES.length * 2);
    const candidates = Array.from({ length: perPass * 2 }, (_, index) => `${index.toString(16).padStart(64, '0')}:1`);
    const first = await checkOutspends(candidates, 0);
    expect(first.unknown).toEqual(candidates.slice(0, perPass));
    expect(apiClient.get).toHaveBeenCalledTimes(MAX_OUTSPEND_LOOKUPS_PER_PASS);
    vi.mocked(apiClient.get).mockClear();
    const second = await checkOutspends(candidates, OUTSPEND_RECHECK_MS + 1);
    expect(second.unknown).toEqual(candidates.slice(perPass));
    expect(apiClient.get).toHaveBeenCalledTimes(MAX_OUTSPEND_LOOKUPS_PER_PASS);
  });
});
