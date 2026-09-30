import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { lockedOutpoints, readCoinLocks, resolveCoinLockCandidates, setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import { COIN_LOCK_ORPHAN_SECONDS, type CoinLock, type CoinLockUpdate, coinLocksOf, withCoinLockUpdate } from '@/core/bitcoin/coinLocks';
import { MAX_OUTSPEND_LOOKUPS_PER_PASS, OUTSPEND_SOURCES, resetOutspendChecks } from '@/core/bitcoin/outspend';
import { fetchUTXOs, type UTXO } from '@/core/bitcoin/utxo';

vi.mock('@/core/bitcoin/utxo', () => ({ fetchUTXOs: vi.fn() }));
vi.mock('@/core/api/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/api/client')>(),
  apiClient: { get: vi.fn() },
}));

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const A_TXID = 'a'.repeat(64);
const A = `${A_TXID}:0`;
const B = `${'b'.repeat(64)}:0`;
const [MEMPOOL, BLOCKSTREAM] = OUTSPEND_SOURCES;
const now = () => Math.floor(Date.now() / 1000);
const lock = (outpoint: string, extra: Partial<CoinLock> = {}): CoinLock => ({
  outpoint, address: ADDRESS, kind: 'offer_slot', manual: false, refs: [], valueSats: 1_000,
  origin: 'https://market.example', expiresAt: null, createdAt: now(), seenAt: 1, unlocked: false, ...extra,
});
const handLock = (outpoint: string): CoinLock => lock(outpoint, { kind: 'manual', manual: true, origin: null });
const utxo = (outpoint: string): UTXO => {
  const [txid = '', vout] = outpoint.split(':');
  return { txid, vout: Number(vout), value: 1_000, status: { confirmed: true, block_height: 1, block_hash: '', block_time: 0 } };
};

/** A store that applies updates the way the background does. */
function installStore(initial: CoinLock[]) {
  const store = { entries: initial, updates: [] as CoinLockUpdate[] };
  setCoinLockStore({
    read: async () => coinLocksOf(store.entries, ADDRESS),
    update: async (_address, update) => {
      store.updates.push(update);
      store.entries = withCoinLockUpdate(store.entries, ADDRESS, update, now()) ?? store.entries;
    },
  });
  return store;
}

const NOT_FOUND = { status: 404 };
/** The indexers' answers, per URL; anything unlisted is a network error. */
function chain(replies: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const reply = replies[url];
    if (reply === undefined) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
    if (reply === NOT_FOUND) throw Object.assign(new Error('HTTP 404'), { code: 'HTTP_ERROR', status: 404 });
    return { data: reply, status: 200, statusText: 'OK', headers: {} };
  });
}
const outspendOfA = (source: string) => `${source}/tx/${A_TXID}/outspend/0`;
const confirmedSpend = { spent: true, txid: 'c'.repeat(64), vin: 0, status: { confirmed: true } };
const mempoolSpend = { spent: true, txid: 'c'.repeat(64), vin: 0, status: { confirmed: false } };

/** The chain lookups a read left running have all answered and been recorded. */
async function settled(): Promise<void> {
  await vi.waitFor(async () => {
    await Promise.allSettled(vi.mocked(apiClient.get).mock.results.map(result => result.value));
  });
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

describe('reading locked coins', () => {
  beforeEach(() => { vi.mocked(apiClient.get).mockReset(); resetOutspendChecks(); chain({}); });
  afterEach(() => { setCoinLockStore(null); vi.useRealTimers(); });

  it('reads no locks without a store', async () => {
    expect(await readCoinLocks(ADDRESS)).toEqual([]);
  });

  it('keeps every lock when the UTXO read fails: a failed lookup is not evidence', async () => {
    const store = installStore([lock(A), lock(B)]);
    vi.mocked(fetchUTXOs).mockRejectedValueOnce(new Error('explorer down'));
    expect((await readCoinLocks(ADDRESS)).map(entry => entry.outpoint)).toEqual([A, B]);
    expect(store.updates).toEqual([]);
  });

  it('names what the read saw and missed, keeps the missed coin locked, and writes nothing when nothing changed', async () => {
    const store = installStore([lock(A), lock(B)]);
    const read = await readCoinLocks(ADDRESS, [utxo(B)]);
    expect(read.map(entry => entry.outpoint)).toEqual([A, B]);
    expect(read[0]).toMatchObject({ candidateSince: expect.any(Number) });
    expect(store.updates).toEqual([{ observed: { present: [B], absent: [A] } }]);
    await settled();

    resetOutspendChecks();
    await readCoinLocks(ADDRESS, [utxo(B)]);
    await settled();
    expect(store.updates).toHaveLength(1);
  });

  it.each([
    ['a stale cached read (both indexers say unspent)', { [outspendOfA(MEMPOOL)]: { spent: false }, [outspendOfA(BLOCKSTREAM)]: { spent: false } }],
    ['indexers that disagree', { [outspendOfA(MEMPOOL)]: confirmedSpend, [outspendOfA(BLOCKSTREAM)]: { spent: false } }],
    ['a spend only in the mempool', { [outspendOfA(MEMPOOL)]: mempoolSpend, [outspendOfA(BLOCKSTREAM)]: mempoolSpend }],
    ['both indexers unreachable', {}],
    ['one indexer unreachable', { [outspendOfA(MEMPOOL)]: confirmedSpend }],
  ])('keeps a missed coin locked through %s', async (_case, replies) => {
    const store = installStore([lock(A)]);
    chain(replies);
    expect([...(await lockedOutpoints(ADDRESS, [])).keys()]).toEqual([A]);
    await settled();
    expect(coinLocksOf(store.entries, ADDRESS).map(entry => entry.outpoint)).toEqual([A]);
    expect([...(await lockedOutpoints(ADDRESS, [])).keys()]).toEqual([A]);
  });

  it('drops a lock, offer or hand, once the chain shows its coin spent by a confirmed transaction', async () => {
    const store = installStore([lock(A), handLock(B)]);
    chain({ [outspendOfA(MEMPOOL)]: confirmedSpend, [outspendOfA(BLOCKSTREAM)]: confirmedSpend });
    await readCoinLocks(ADDRESS, [utxo(B)]);
    await settled();
    expect(coinLocksOf(store.entries, ADDRESS).map(entry => entry.outpoint)).toEqual([B]);
    expect(store.updates.at(-1)).toEqual({ observed: { spent: [A], unknown: [] } });

    resetOutspendChecks();
    const hand = installStore([handLock(A)]);
    await readCoinLocks(ADDRESS, []);
    await settled();
    expect(hand.entries).toEqual([]);
  });

  it('drops a coin whose funding both indexers answer 404 for only after a day as a candidate', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = 1_800_000_000_000;
    vi.setSystemTime(start);
    const store = installStore([lock(A)]);
    chain({
      [outspendOfA(MEMPOOL)]: NOT_FOUND, [outspendOfA(BLOCKSTREAM)]: NOT_FOUND,
      [`${MEMPOOL}/tx/${A_TXID}`]: NOT_FOUND, [`${BLOCKSTREAM}/tx/${A_TXID}`]: NOT_FOUND,
    });
    await readCoinLocks(ADDRESS, []);
    await settled();
    expect(coinLocksOf(store.entries, ADDRESS)).toHaveLength(1);

    vi.setSystemTime(start + (COIN_LOCK_ORPHAN_SECONDS - 600) * 1000);
    await readCoinLocks(ADDRESS, []);
    await settled();
    expect(coinLocksOf(store.entries, ADDRESS)).toHaveLength(1);

    vi.setSystemTime(start + COIN_LOCK_ORPHAN_SECONDS * 1000);
    await readCoinLocks(ADDRESS, []);
    await settled();
    expect(coinLocksOf(store.entries, ADDRESS)).toEqual([]);
  });

  it('bounds the chain lookups one read starts', async () => {
    installStore(Array.from({ length: 12 }, (_, index) => lock(`${(index + 1).toString(16).padStart(64, '0')}:0`)));
    await readCoinLocks(ADDRESS, []);
    await settled();
    const outspends = vi.mocked(apiClient.get).mock.calls.filter(([url]) => String(url).includes('/outspend/'));
    expect(outspends).toHaveLength(MAX_OUTSPEND_LOOKUPS_PER_PASS / 2);
  });

  it('never judges a hand lock made while its read was in flight', async () => {
    // A was seen just now and seen again below, so this read has nothing of its own to write.
    const store = installStore([lock(A, { seenAt: now() })]);
    let answer: ((utxos: UTXO[]) => void) | undefined;
    vi.mocked(fetchUTXOs).mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const reading = readCoinLocks(ADDRESS);
    await vi.waitFor(() => expect(answer).toBeDefined());
    // The user locks B while the read is out; the read's (cached) UTXOs predate B entirely.
    store.entries = withCoinLockUpdate(store.entries, ADDRESS, { lock: [{ outpoint: B, valueSats: 1 }] }, now()) ?? store.entries;
    answer?.([utxo(A)]);
    expect((await reading).map(entry => entry.outpoint)).toContain(B);
    await settled();
    const b = coinLocksOf(store.entries, ADDRESS).find(entry => entry.outpoint === B);
    expect(b).toMatchObject({ kind: 'manual', manual: true, unlocked: false });
    expect(b).not.toHaveProperty('candidateSince');
    expect(store.updates).toEqual([]);
  });

  it('records nothing from a lookup that proves nothing, and never throws', async () => {
    const store = installStore([lock(A)]);
    await expect(resolveCoinLockCandidates(ADDRESS, [lock(A)], [A])).resolves.toBeUndefined();
    expect(store.updates).toEqual([]);
  });

  it('enforces only locks that are not unlocked', async () => {
    installStore([lock(A), lock(B, { unlocked: true })]);
    vi.mocked(fetchUTXOs).mockRejectedValueOnce(new Error('explorer down'));
    expect([...(await lockedOutpoints(ADDRESS)).keys()]).toEqual([A]);
  });
});
