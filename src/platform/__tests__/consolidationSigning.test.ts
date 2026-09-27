/**
 * Bare-multisig consolidation signs through WalletSigner, behind the same signing guard as every
 * other signature.
 *
 * The golden tests prove the batch the wallet service returns is byte for byte the one
 * consolidateBareMultisigBatch builds from the address's key, for mnemonic and private-key
 * wallets alike. The barrier tests park a batch at one of its awaits (the key read, or a yield
 * between signing chunks), lock the wallet or switch the active address while it is parked, then
 * let it continue: the batch must reject with the guard's error and return no transaction.
 *
 * Real WalletManager singleton, wallet service, session manager, vault encryption, derivation and
 * signing, as in signingLockBarriers.test.ts. Only browser storage and the proxy are replaced.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bareMultisigScript, buildPrevTx, counterpartyDataKey, txidOf } from '@/core/bitcoin/__tests__/helpers/bareMultisigFixtures';
import { consolidateBareMultisigBatch } from '@/core/bitcoin/consolidateBatch';
import type { ConsolidationData, ConsolidationUTXO } from '@/core/bitcoin/consolidationApi';
import { getPrivateKeyFromMnemonic } from '@/core/bitcoin/privateKey';
import * as sessionManager from '@/platform/auth/sessionManager';
import { walletManager } from '@/platform/walletManager';
import { getWalletService } from '@/services/walletService';
import type { KeychainRecord } from '@/types/wallet';
import {
  type Barrier, BIP39_MNEMONIC, barrier, buildKeychainRecord, installChromeSession, PASSWORD, WALLET_SPECS, type WalletKey,
  WIKI_PRIVATE_KEY, walletId,
} from './helpers/signingHarness';

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
}));
vi.mock('@/platform/storage/walletStorage', () => ({
  getKeychainRecord: vi.fn(async () => structuredClone(state.record)),
  saveKeychainRecord: vi.fn(async (record: KeychainRecord) => { state.record = structuredClone(record); }),
  assertNoKeychainRecord: vi.fn(async () => {}),
  deleteKeychain: vi.fn(async () => { state.record = null; }),
}));
vi.mock('@/platform/storage/keyStorage', () => ({
  getCachedKeychainMasterKey: vi.fn(async () => state.cachedKey),
  setCachedKeychainMasterKey: vi.fn(async (key: string) => { state.cachedKey = key; }),
  clearCachedKeychainMasterKey: vi.fn(async () => { state.cachedKey = null; }),
}));
vi.mock('@/platform/auth/unlockRateLimiter', () => ({
  assertUnlockAllowed: vi.fn(async () => {}),
  clearUnlockAttempts: vi.fn(async () => {}),
  recordFailedUnlockAttempt: vi.fn(async () => {}),
}));
// The wallet service as the background registers it, called directly rather than over messaging.
vi.mock('@/platform/proxy/server', () => ({
  defineProxyServer: (_name: string, factory: () => unknown) => [factory, factory],
}));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));

const SESSION_CHANGED = 'Wallet session changed; please try again.';
const IDENTITY_CHANGED = 'The signing identity changed after this request was approved.';
const FEE_ADDRESS = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
/** Past 25 inputs, so signing yields at least once mid-batch. */
const YIELDING_BATCH = 30;

/** Parks the next session-storage read (the start of every secret read) until released. */
let sessionBarrier: Barrier | null = null;

async function use(key: WalletKey): Promise<string> {
  await walletManager.selectWallet(walletId(key));
  return walletManager.getActiveWallet()!.addresses[0]!.address;
}

/** The key the address signs with, derived here rather than asked of the wallet. */
function expectedKey(key: WalletKey, path: string): { hex: string; compressed: boolean } {
  if (key === 'privateKeyCompressed' || key === 'privateKeyUncompressed') {
    return { hex: WIKI_PRIVATE_KEY, compressed: key === 'privateKeyCompressed' };
  }
  return { hex: getPrivateKeyFromMnemonic(BIP39_MNEMONIC, path, WALLET_SPECS[key].format), compressed: true };
}

/** A batch of Counterparty 1-of-2 outputs to the given key, with a 2% service fee. */
function batchFor(address: string, pubkey: Uint8Array, count: number): ConsolidationData {
  const script = bareMultisigScript(1, [pubkey, counterpartyDataKey()]);
  const utxos: ConsolidationUTXO[] = Array.from({ length: count }, (_, i) => {
    const prevTx = buildPrevTx([{ amount: 60_000n, script }], i + 1);
    return {
      txid: txidOf(prevTx), vout: 0, amount: 60_000, prev_tx_hex: bytesToHex(prevTx),
      script: bytesToHex(script), position: 0, script_type: 'bare_multisig',
    };
  });
  return {
    address,
    summary: {
      total_utxos: count, total_btc: (count * 60_000) / 1e8, batches_required: 1, current_batch: 1,
      batch_utxos: count, max_batch_utxos: 420,
    },
    fee_config: { fee_address: FEE_ADDRESS, fee_percent: 2, exemption_threshold: 0 },
    utxos,
    mempool_status: { pending_consolidations: 0, pending_utxo_count: 0, can_broadcast_more: true },
    stamp_protection: { protected_utxos: 0, protected_btc: 0, included: false },
  };
}

async function fixtureFor(key: WalletKey, count: number) {
  const address = await use(key);
  const path = walletManager.getActiveWallet()!.addresses[0]!.path;
  const signingKey = expectedKey(key, path);
  const pubkey = secp256k1.getPublicKey(hexToBytes(signingKey.hex), signingKey.compressed);
  return { address, signingKey, batch: batchFor(address, pubkey, count) };
}

/** Park the next yield between signing chunks (a zero-delay timer set while signing) until released. */
function parkNextSigningYield(): Barrier {
  const pending = barrier();
  const realSetTimeout = globalThis.setTimeout;
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, delay?: number) => {
    if (delay === 0 && new Error().stack?.includes('signAndFinalizeBareMultisig')) {
      spy.mockRestore();
      pending.enter();
      void pending.released.then(() => realSetTimeout(handler, 0));
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(handler, delay);
  }) as typeof setTimeout);
  return pending;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  sessionBarrier = null;
  installChromeSession(async () => {
    const pending = sessionBarrier;
    sessionBarrier = null;
    if (pending) { pending.enter(); await pending.released; }
  });
  sessionManager.registerSessionExpiredHandler(null);
  await sessionManager.clearAllUnlockedSecrets();
  state.record ??= await buildKeychainRecord();
  if (await walletManager.isKeychainUnlocked()) await walletManager.lockKeychain();
  await walletManager.unlockKeychain(PASSWORD);
});

describe('consolidation signs exactly as before', () => {
  it.each([
    ['p2pkh', 3],
    ['p2wpkh', 3],
    ['privateKeyCompressed', 3],
    ['privateKeyUncompressed', 3],
    ['p2pkh', YIELDING_BATCH],
  ] as const)('%s, %i inputs: the service returns the batch built from the address key', async (key, count) => {
    const { address, signingKey, batch } = await fixtureFor(key, count);
    const expected = await consolidateBareMultisigBatch(signingKey.hex, address, structuredClone(batch), 7, FEE_ADDRESS);

    const result = await getWalletService().consolidateBareMultisig(address, batch, 7, FEE_ADDRESS);

    expect(result).toEqual(expected);
    expect(result.serviceFee).toBeGreaterThan(0);
  });

  it('refuses an address outside the active wallet before reading a key', async () => {
    const { batch } = await fixtureFor('p2pkh', 1);
    const other = await use('p2wpkh');
    await use('p2pkh');
    const getUnlockedSecret = vi.spyOn(sessionManager, 'getUnlockedSecret');
    await expect(getWalletService().consolidateBareMultisig(other, batch, 7))
      .rejects.toThrow('Source address is not part of the active wallet');
    expect(getUnlockedSecret).not.toHaveBeenCalled();
  });

  it('a Trezor wallet fails as it did, with no key to sign with', async () => {
    const address = await use('trezor');
    const batch = batchFor(address, secp256k1.getPublicKey(hexToBytes(WIKI_PRIVATE_KEY), true), 1);
    // The hardware secret has no `hex`; the batch builder rejects it before building anything.
    const hardwareSecret = JSON.parse(WALLET_SPECS.trezor.secret) as { hex?: string };
    const expected = await consolidateBareMultisigBatch(hardwareSecret.hex as string, address, batch, 7)
      .then(() => null, (error: Error) => error.message);
    expect(expected).toEqual(expect.any(String));
    await expect(getWalletService().consolidateBareMultisig(address, batch, 7)).rejects.toThrow(expected!);
  });
});

describe('a lock or identity change during a consolidation batch', () => {
  it('a lock at a yield between signing chunks stops the batch', async () => {
    const { address, batch } = await fixtureFor('p2pkh', YIELDING_BATCH);
    const pending = parkNextSigningYield();
    const signing = getWalletService().consolidateBareMultisig(address, batch, 7);
    const rejected = expect(signing).rejects.toThrow(SESSION_CHANGED);
    await pending.entered;
    await walletManager.lockKeychain();
    expect(await walletManager.isKeychainUnlocked()).toBe(false);
    pending.release();
    await rejected;
  });

  it('an address switch at a yield between signing chunks stops the batch', async () => {
    await use('p2pkh');
    const second = await walletManager.addAddress(walletId('p2pkh'));
    const { address, batch } = await fixtureFor('p2pkh', YIELDING_BATCH);
    const pending = parkNextSigningYield();
    const signing = getWalletService().consolidateBareMultisig(address, batch, 7);
    const rejected = expect(signing).rejects.toThrow(IDENTITY_CHANGED);
    await pending.entered;
    await walletManager.updateSettings({ lastActiveAddress: second.address });
    pending.release();
    await rejected;
  });

  it('an address switch while the key is read stops the batch before signing', async () => {
    await use('p2pkh');
    const second = await walletManager.addAddress(walletId('p2pkh'));
    const { address, batch } = await fixtureFor('p2pkh', 1);
    const pending = barrier();
    sessionBarrier = pending;
    const signing = getWalletService().consolidateBareMultisig(address, batch, 7);
    const rejected = expect(signing).rejects.toThrow(IDENTITY_CHANGED);
    await pending.entered;
    await walletManager.updateSettings({ lastActiveAddress: second.address });
    pending.release();
    await rejected;
  });
});
