/**
 * HD nodes cached beside an unlocked secret are that secret in another form: every key below
 * them derives from them. These tests hold them to the secret's lifetime — cleared, and their
 * private keys zeroed, on every path that clears the secret, and never repopulated by a caller
 * that read the secret before it was cleared.
 */
import { HDKey } from '@scure/bip32';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllUnlockedSecrets,
  clearUnlockedSecret,
  expireSessionIfNeeded,
  initializeSession,
  registerSessionExpiredHandler,
  storeUnlockedSecret,
  unlockedHdNodeCache,
} from '../sessionManager';

const WALLET_A = 'a1b2c3d4e5f678901234567890123456789012345678901234567890123456ef';
const WALLET_B = 'b2c3d4e5f678901234567890123456789012345678901234567890123456efa1';

/** A real node with a real private key, so wiping is observable. */
const freshNode = () => HDKey.fromMasterSeed(new Uint8Array(32).fill(7));

describe('HD nodes held beside unlocked secrets', () => {
  let metadata: { unlockedAt: number; timeout: number; lastActiveTime: number } | undefined;

  beforeEach(async () => {
    metadata = undefined;
    global.chrome = {
      storage: {
        session: {
          get: vi.fn(async () => ({ sessionMetadata: metadata ? { ...metadata } : undefined })),
          set: vi.fn(async (data: { sessionMetadata: typeof metadata }) => { metadata = { ...data.sessionMetadata! }; }),
          remove: vi.fn(async () => { metadata = undefined; }),
        },
      },
      alarms: { create: vi.fn(async () => {}), clear: vi.fn(async () => true) },
    } as any;
    registerSessionExpiredHandler(null);
    await clearAllUnlockedSecrets();
    await initializeSession(5 * 60 * 1000);
  });

  /** Store a secret and cache one node under it; returns the cached node. */
  function cacheNodeFor(walletId: string, secret: string): HDKey {
    storeUnlockedSecret(walletId, secret);
    const node = unlockedHdNodeCache(walletId, secret)('seed:bip39', freshNode);
    expect(node.privateKey).not.toBeNull();
    return node;
  }

  /** Whether a node is cached under this wallet, secret and key right now. */
  function isCached(walletId: string, secret: string, key = 'seed:bip39'): boolean {
    const derive = vi.fn(freshNode);
    unlockedHdNodeCache(walletId, secret)(key, derive);
    return derive.mock.calls.length === 0;
  }

  it('derives once and then reuses the node while the secret is unlocked', () => {
    storeUnlockedSecret(WALLET_A, 'secret-a');
    const derive = vi.fn(freshNode);
    const cache = unlockedHdNodeCache(WALLET_A, 'secret-a');
    const first = cache('seed:bip39', derive);
    expect(cache('seed:bip39', derive)).toBe(first);
    expect(unlockedHdNodeCache(WALLET_A, 'secret-a')('seed:bip39', derive)).toBe(first);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing for a secret that is not the stored one, or a wallet with none stored', () => {
    storeUnlockedSecret(WALLET_A, 'secret-a');
    const derive = vi.fn(freshNode);
    unlockedHdNodeCache(WALLET_A, 'some-other-secret')('seed:bip39', derive);
    unlockedHdNodeCache(WALLET_A, 'some-other-secret')('seed:bip39', derive);
    unlockedHdNodeCache(WALLET_B, 'secret-b')('seed:bip39', derive);
    unlockedHdNodeCache(WALLET_B, 'secret-b')('seed:bip39', derive);
    expect(derive).toHaveBeenCalledTimes(4);
    expect(isCached(WALLET_A, 'secret-a')).toBe(false);
  });

  it('clears and zeroes a wallet\'s nodes when its secret is cleared (switch, removal)', () => {
    const nodeA = cacheNodeFor(WALLET_A, 'secret-a');
    const nodeB = cacheNodeFor(WALLET_B, 'secret-b');
    clearUnlockedSecret(WALLET_A);
    expect(nodeA.privateKey).toBeNull();
    expect(nodeB.privateKey).not.toBeNull();
    storeUnlockedSecret(WALLET_A, 'secret-a');
    expect(isCached(WALLET_A, 'secret-a')).toBe(false);
    expect(isCached(WALLET_B, 'secret-b')).toBe(true);
  });

  it('clears and zeroes every wallet\'s nodes on lock', async () => {
    const nodeA = cacheNodeFor(WALLET_A, 'secret-a');
    const nodeB = cacheNodeFor(WALLET_B, 'secret-b');
    await clearAllUnlockedSecrets();
    expect(nodeA.privateKey).toBeNull();
    expect(nodeB.privateKey).toBeNull();
    await initializeSession(5 * 60 * 1000);
    storeUnlockedSecret(WALLET_A, 'secret-a');
    expect(isCached(WALLET_A, 'secret-a')).toBe(false);
  });

  it('clears the nodes when a different secret is stored under the same wallet ID', () => {
    const node = cacheNodeFor(WALLET_A, 'secret-a');
    storeUnlockedSecret(WALLET_A, 'secret-a');
    expect(node.privateKey).not.toBeNull();
    expect(isCached(WALLET_A, 'secret-a')).toBe(true);
    storeUnlockedSecret(WALLET_A, 'secret-a-replaced');
    expect(node.privateKey).toBeNull();
    expect(isCached(WALLET_A, 'secret-a-replaced')).toBe(false);
  });

  it('stops serving nodes the moment the session expires, and zeroes them in the cleanup', async () => {
    const node = cacheNodeFor(WALLET_A, 'secret-a');
    metadata = { ...metadata!, lastActiveTime: Date.now() - 10 * 60 * 1000, unlockedAt: Date.now() - 10 * 60 * 1000 };
    let servedDuringExpiry: boolean | undefined;
    registerSessionExpiredHandler(async () => {
      // Invalidated but not yet cleaned up: the cache must already refuse to serve.
      servedDuringExpiry = isCached(WALLET_A, 'secret-a');
      await clearAllUnlockedSecrets();
    });
    expect(await expireSessionIfNeeded()).toBe(true);
    expect(servedDuringExpiry).toBe(false);
    expect(node.privateKey).toBeNull();
  });

  it('does not let a caller holding a pre-lock handle repopulate the cache', async () => {
    storeUnlockedSecret(WALLET_A, 'secret-a');
    const staleHandle = unlockedHdNodeCache(WALLET_A, 'secret-a');
    await clearAllUnlockedSecrets();
    const derive = vi.fn(freshNode);
    staleHandle('seed:bip39', derive);
    expect(derive).toHaveBeenCalledTimes(1);

    await initializeSession(5 * 60 * 1000);
    storeUnlockedSecret(WALLET_A, 'secret-a');
    expect(isCached(WALLET_A, 'secret-a')).toBe(false);
  });

  it('clears nodes for a wallet whose secret entry is already gone', () => {
    const node = cacheNodeFor(WALLET_A, 'secret-a');
    clearUnlockedSecret(WALLET_A);
    clearUnlockedSecret(WALLET_A);
    expect(node.privateKey).toBeNull();
  });
});
