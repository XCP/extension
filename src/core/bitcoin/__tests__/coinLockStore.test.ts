import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockedOutpoints, readCoinLocks, setCoinLockStore } from '@/core/bitcoin/coinLockStore';
import type { CoinLock, CoinLockUpdate } from '@/core/bitcoin/coinLocks';
import { fetchUTXOs } from '@/core/bitcoin/utxo';

vi.mock('@/core/bitcoin/utxo', () => ({ fetchUTXOs: vi.fn() }));

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const A = `${'a'.repeat(64)}:0`;
const B = `${'b'.repeat(64)}:0`;
const lock = (outpoint: string, extra: Partial<CoinLock> = {}): CoinLock => ({
  outpoint, address: ADDRESS, kind: 'offer_slot', manual: false, refs: [], valueSats: 1_000,
  origin: 'https://market.example', expiresAt: null, createdAt: Math.floor(Date.now() / 1000), seenAt: 1, unlocked: false, ...extra,
});

describe('reading locked coins', () => {
  afterEach(() => setCoinLockStore(null));

  it('reads no locks without a store', async () => {
    expect(await readCoinLocks(ADDRESS)).toEqual([]);
  });

  it('keeps every lock when the UTXO read fails: a failed lookup is not evidence', async () => {
    const updates: CoinLockUpdate[] = [];
    setCoinLockStore({ read: async () => [lock(A), lock(B)], update: async (_a, update) => { updates.push(update); } });
    vi.mocked(fetchUTXOs).mockRejectedValueOnce(new Error('explorer down'));
    expect((await readCoinLocks(ADDRESS)).map(entry => entry.outpoint)).toEqual([A, B]);
    expect(updates).toEqual([]);
  });

  it('drops a spent lock from what it returns and tells the store, with no write when nothing changed', async () => {
    const updates: CoinLockUpdate[] = [];
    setCoinLockStore({ read: async () => [lock(A), lock(B)], update: async (_a, update) => { updates.push(update); } });
    const present = [{ txid: 'a'.repeat(64), vout: 0, value: 1_000, status: { confirmed: true, block_height: 1, block_hash: '', block_time: 0 } }];
    expect((await readCoinLocks(ADDRESS, present)).map(entry => entry.outpoint)).toEqual([A]);
    expect(updates).toEqual([{ observed: { present: [A] } }]);

    setCoinLockStore({ read: async () => [lock(A, { seenAt: Math.floor(Date.now() / 1000) })], update: async (_a, update) => { updates.push(update); } });
    await readCoinLocks(ADDRESS, present);
    expect(updates).toHaveLength(1);
  });

  it('enforces only locks that are not unlocked', async () => {
    setCoinLockStore({ read: async () => [lock(A), lock(B, { unlocked: true })], update: async () => {} });
    vi.mocked(fetchUTXOs).mockRejectedValueOnce(new Error('explorer down'));
    expect([...(await lockedOutpoints(ADDRESS)).keys()]).toEqual([A]);
  });
});
