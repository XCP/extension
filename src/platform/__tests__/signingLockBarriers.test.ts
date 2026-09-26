/**
 * Lock barriers and identity guards for every signing path.
 *
 * Each barrier test parks a signing call at one of its awaits (a network fetch, prevout
 * verification, a session read, the Trezor init or the device call itself), locks the wallet
 * while it is parked, then lets it continue. The call must reject and no signature may be
 * produced or returned: the signing primitives are spied on, and a device result that arrives
 * after the lock must be withheld.
 *
 * The identity tests pass an expected identity that no longer matches the active wallet or
 * address, and prove the refusal comes before any secret is read.
 *
 * Real WalletManager, session manager, vault encryption, derivation and signing, as in
 * signingGolden.test.ts. Only browser storage, the network and the Trezor adapter are replaced.
 */
import { Transaction } from '@scure/btc-signer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { signMessage as signMessageWithKey } from '@/core/bitcoin/messageSigner';
import { finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { fetchPreviousRawTransaction, fetchUTXOs } from '@/core/bitcoin/utxo';
import { deriveMnemonicAddresses } from '@/core/wallet/addressDeriver';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { KeychainRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';
import {
  type Barrier, BIP39_MNEMONIC, barrier, buildKeychainRecord, HARDWARE_PRIVATE_KEY, installChromeSession, PASSWORD, type SpendFixture,
  spendFixture, type WalletKey, walletId,
} from './helpers/signingHarness';

type NetworkCall = 'fetchUTXOs' | 'fetchPreviousRawTransaction';
const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
  parents: new Map<string, string>(),
  utxos: new Map<string, import('@/core/bitcoin/utxo').UTXO[]>(),
  /** Parks the next call to the named network function until released. */
  networkBarrier: null as { call: 'fetchUTXOs' | 'fetchPreviousRawTransaction'; barrier: import('./helpers/signingHarness').Barrier } | null,
}));
async function parkNetwork(call: NetworkCall): Promise<void> {
  const pending = state.networkBarrier;
  if (pending?.call !== call) return;
  state.networkBarrier = null;
  pending.barrier.enter();
  await pending.barrier.released;
}
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
vi.mock('@/core/bitcoin/utxo', async (original) => ({
  ...(await original<typeof import('@/core/bitcoin/utxo')>()),
  fetchUTXOs: vi.fn(async (address: string) => {
    await parkNetwork('fetchUTXOs');
    return structuredClone(state.utxos.get(address) ?? []);
  }),
  fetchPreviousRawTransaction: vi.fn(async (txid: string) => {
    await parkNetwork('fetchPreviousRawTransaction');
    return state.parents.get(txid) ?? null;
  }),
}));
vi.mock('@/platform/provider/recentBroadcasts', async (original) => ({
  ...(await original<typeof import('@/platform/provider/recentBroadcasts')>()),
  getTrustedBroadcastPrevout: vi.fn(async () => null),
}));
// Real session manager; the secret read is observed, not replaced.
vi.mock('@/platform/auth/sessionManager', async (original) => {
  const actual = await original<typeof import('@/platform/auth/sessionManager')>();
  return { ...actual, getUnlockedSecret: vi.fn(actual.getUnlockedSecret) };
});
// Real message signer, observed.
vi.mock('@/core/bitcoin/messageSigner', async (original) => {
  const actual = await original<typeof import('@/core/bitcoin/messageSigner')>();
  return { ...actual, signMessage: vi.fn(actual.signMessage) };
});
const hardware = vi.hoisted(() => ({ init: vi.fn(), signPsbt: vi.fn(), signMessage: vi.fn() }));
vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: () => hardware }));

const MESSAGE = 'XCP Wallet lock barrier';
const SESSION_CHANGED = 'Wallet session changed; please try again.';
const IDENTITY_CHANGED = 'The signing identity changed after this request was approved.';

let manager: WalletManager;
/** Parks the next session-storage read (the start of every secret read) until released. */
let sessionBarrier: Barrier | null = null;
/** Every ECDSA and Schnorr transaction/PSBT signature goes through Transaction#signIdx. */
let signIdx: ReturnType<typeof vi.spyOn>;

async function use(key: WalletKey): Promise<string> {
  await manager.selectWallet(walletId(key));
  return manager.getActiveWallet()!.addresses[0]!.address;
}
function register(address: string): SpendFixture {
  const fixture = spendFixture(address);
  state.parents.set(fixture.parentTxid, fixture.parentHex);
  state.utxos.set(address, fixture.utxos);
  return fixture;
}
function parkNext(call: NetworkCall): Barrier {
  const pending = barrier();
  state.networkBarrier = { call, barrier: pending };
  return pending;
}
/** Park getPairedAddresses' own secret read: arm the session barrier as it is entered. */
function parkInGetPairedAddresses(): Barrier {
  const pending = barrier();
  const original = manager.getPairedAddresses.bind(manager);
  vi.spyOn(manager, 'getPairedAddresses').mockImplementationOnce(() => {
    sessionBarrier = pending;
    return original();
  });
  return pending;
}
/** A device call that parks until released, then answers with `result`. */
function parkDevice(mock: typeof hardware.init, result?: unknown): Barrier {
  const pending = barrier();
  mock.mockImplementationOnce(async () => {
    pending.enter();
    await pending.released;
    return result;
  });
  return pending;
}

/** Start `signing`, lock while it is parked at `pending`, release it, and expect `message`. */
async function lockWhileParked(signing: Promise<unknown>, pending: Barrier, message: string): Promise<void> {
  const rejected = expect(signing).rejects.toThrow(message);
  await pending.entered;
  await manager.lockKeychain();
  expect(await manager.isKeychainUnlocked()).toBe(false);
  pending.release();
  await rejected;
}

beforeEach(async () => {
  vi.clearAllMocks();
  state.networkBarrier = null;
  sessionBarrier = null;
  installChromeSession(async () => {
    const pending = sessionBarrier;
    sessionBarrier = null;
    if (pending) { pending.enter(); await pending.released; }
  });
  sessionManager.registerSessionExpiredHandler(null);
  await sessionManager.clearAllUnlockedSecrets();
  state.record ??= await buildKeychainRecord();
  manager = new WalletManager();
  await manager.unlockKeychain(PASSWORD);
  hardware.init.mockResolvedValue(undefined);
  signIdx?.mockRestore();
  signIdx = vi.spyOn(Transaction.prototype, 'signIdx');
});

describe('a lock during software transaction signing', () => {
  it.each([
    ['p2wpkh', 'fetchUTXOs'],
    ['p2wpkh', 'fetchPreviousRawTransaction'],
    ['p2pkh', 'fetchUTXOs'],
    ['p2pkh', 'fetchPreviousRawTransaction'],
  ] as const)('%s: parked in %s, holding the key, signs nothing', async (key, call) => {
    const address = await use(key);
    const fixture = register(address);
    const pending = parkNext(call);
    await lockWhileParked(manager.signTransaction(fixture.rawTx, address), pending, SESSION_CHANGED);
    expect(sessionManager.getUnlockedSecret).toHaveBeenCalled();
    expect(signIdx).not.toHaveBeenCalled();
  });
});

describe('a lock during software PSBT signing', () => {
  it.each([
    ['explicit signInputs', true],
    ['best effort', false],
  ] as const)('%s: parked in prevout verification, signs nothing', async (_label, explicit) => {
    const address = await use('p2wpkh');
    const fixture = register(address);
    const pending = parkNext('fetchPreviousRawTransaction');
    const signing = manager.signPsbt(fixture.witnessPsbt, explicit ? { [address]: [0, 1] } : undefined);
    // Parked before any secret is read. No session check follows verification on this path; the
    // lock has emptied the wallet's address list, so the next step finds no address to sign with.
    await lockWhileParked(signing, pending, explicit ? 'No active address' : 'No addresses in wallet');
    expect(signIdx).not.toHaveBeenCalled();
  });

  it('paired address: parked reading the secret for getPairedAddresses, signs nothing', async () => {
    await use('p2pkh');
    const paired = (await manager.getPairedAddresses()).segwit;
    const fixture = register(paired.address);
    const pending = parkInGetPairedAddresses();
    const getPrivateKey = vi.spyOn(manager, 'getPrivateKey');
    const signing = manager.signPsbt(fixture.witnessPsbt, { [paired.address]: [0, 1] });
    await lockWhileParked(signing, pending, 'Wallet is locked');
    expect(getPrivateKey).not.toHaveBeenCalled();
    expect(signIdx).not.toHaveBeenCalled();
  });
});

describe('a lock during software message signing', () => {
  it('paired address: parked reading the secret for getPairedAddresses, signs nothing', async () => {
    await use('p2pkh');
    const paired = (await manager.getPairedAddresses()).segwit;
    const pending = parkInGetPairedAddresses();
    await lockWhileParked(manager.signMessage(MESSAGE, paired.address), pending, 'Wallet is locked');
    expect(signMessageWithKey).not.toHaveBeenCalled();
  });

  it('own address: parked reading the key, signs nothing', async () => {
    const address = await use('p2wpkh');
    // P2WPKH pairs with P2PKH, so the first secret read is again getPairedAddresses'.
    const pending = parkInGetPairedAddresses();
    await lockWhileParked(manager.signMessage(MESSAGE, address), pending, 'Wallet is locked');
    expect(signMessageWithKey).not.toHaveBeenCalled();
  });

  it('own address with no pairing (P2TR): parked reading the key, signs nothing', async () => {
    const address = await use('p2tr');
    sessionBarrier = barrier();
    const pending = sessionBarrier;
    await lockWhileParked(manager.signMessage(MESSAGE, address), pending, `Wallet is locked or secret not available: ${walletId('p2tr')}`);
    expect(signMessageWithKey).not.toHaveBeenCalled();
  });
});

describe('a lock during Trezor signing', () => {
  let address: string;
  let fixture: SpendFixture;
  const signedTx = () => finalizePSBT(signPSBT(fixture.witnessPsbt, HARDWARE_PRIVATE_KEY, [0, 1], AddressFormat.P2WPKH));

  beforeEach(async () => {
    address = await use('trezor');
    fixture = register(address);
  });

  const requests = {
    signTransaction: () => manager.signTransaction(fixture.rawTx, address, {
      psbtHex: fixture.barePsbt, inputValues: fixture.inputValues, lockScripts: fixture.lockScripts,
    }),
    signPsbt: () => manager.signPsbt(fixture.witnessPsbt, { [address]: [0, 1] }),
    signMessage: () => manager.signMessage(MESSAGE, address),
  };

  it.each(['signTransaction', 'signPsbt'] as const)('%s: parked in prevout verification, never reaches the device', async (method) => {
    const pending = parkNext('fetchPreviousRawTransaction');
    // signPsbt checks the session right after verification; signTransaction next reads the
    // device secret, which the lock has removed.
    await lockWhileParked(requests[method](), pending, method === 'signPsbt' ? SESSION_CHANGED : 'Hardware wallet not unlocked');
    expect(hardware.init).not.toHaveBeenCalled();
    expect(hardware.signPsbt).not.toHaveBeenCalled();
  });

  it.each(['signTransaction', 'signPsbt', 'signMessage'] as const)('%s: parked in device init, never asks the device to sign', async (method) => {
    const pending = parkDevice(hardware.init);
    // The transaction paths map input paths from the wallet's addresses before their session
    // check, and the lock has emptied that list; the message path reaches the session check.
    await lockWhileParked(requests[method](), pending,
      method === 'signMessage' ? SESSION_CHANGED : 'PSBT input 0 does not belong to a derived address in this hardware wallet');
    expect(hardware.init).toHaveBeenCalledTimes(1);
    expect(hardware.signPsbt).not.toHaveBeenCalled();
    expect(hardware.signMessage).not.toHaveBeenCalled();
  });

  it.each(['signTransaction', 'signPsbt', 'signMessage'] as const)('%s: a device signature that arrives after the lock is withheld', async (method) => {
    const device = method === 'signMessage' ? hardware.signMessage : hardware.signPsbt;
    const result = method === 'signMessage'
      ? { signature: 'device-signature', address }
      : { signedTxHex: signedTx(), signedPsbtHex: 'device-signed-psbt' };
    const pending = parkDevice(device, result);
    await lockWhileParked(requests[method](), pending, SESSION_CHANGED);
    expect(device).toHaveBeenCalledTimes(1);
  });
});

describe('identity guard: a request bound to another identity reads no secret', () => {
  const requestsFor = (address: string, fixture: SpendFixture, hardwareWallet: boolean) => ({
    signTransaction: (identity: { walletId: string; address: string }) => manager.signTransaction(
      fixture.rawTx, address,
      hardwareWallet ? { psbtHex: fixture.barePsbt, inputValues: fixture.inputValues, lockScripts: fixture.lockScripts } : undefined,
      identity,
    ),
    signPsbt: (identity: { walletId: string; address: string }) =>
      manager.signPsbt(fixture.witnessPsbt, { [address]: [0, 1] }, undefined, identity),
    signMessage: (identity: { walletId: string; address: string }) => manager.signMessage(MESSAGE, address, identity),
  });

  const cases = (['p2wpkh', 'trezor'] as const).flatMap(key =>
    (['signTransaction', 'signPsbt', 'signMessage'] as const).flatMap(method =>
      (['wallet', 'address'] as const).map(mismatch => [key, method, mismatch] as const)));

  it.each(cases)('%s %s: another %s', async (key, method, mismatch) => {
    const address = await use(key);
    const fixture = register(address);
    const other = deriveMnemonicAddresses(BIP39_MNEMONIC, AddressFormat.P2WPKH, 6)[5]!.address;
    const getPrivateKey = vi.spyOn(manager, 'getPrivateKey');
    const getPairedAddresses = vi.spyOn(manager, 'getPairedAddresses');
    vi.mocked(sessionManager.getUnlockedSecret).mockClear();
    const identity = mismatch === 'wallet'
      ? { walletId: walletId(key === 'trezor' ? 'p2wpkh' : 'p2tr'), address }
      : { walletId: walletId(key), address: other };

    await expect(requestsFor(address, fixture, key === 'trezor')[method](identity)).rejects.toThrow(IDENTITY_CHANGED);
    expect(sessionManager.getUnlockedSecret).not.toHaveBeenCalled();
    expect(getPrivateKey).not.toHaveBeenCalled();
    expect(getPairedAddresses).not.toHaveBeenCalled();
    expect(fetchUTXOs).not.toHaveBeenCalled();
    expect(fetchPreviousRawTransaction).not.toHaveBeenCalled();
    expect(hardware.init).not.toHaveBeenCalled();
    expect(signIdx).not.toHaveBeenCalled();
  });

  it.each(['p2wpkh', 'trezor'] as const)('%s: the matching identity (in any letter case) reads the secret and signs', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    if (key === 'trezor') {
      hardware.signMessage.mockResolvedValue({ signature: 'device-signature', address });
    }
    const identity = { walletId: walletId(key), address: address.toUpperCase() };
    await expect(requestsFor(address, fixture, key === 'trezor').signMessage(identity)).resolves.toMatchObject({ signature: expect.any(String) });
    expect(sessionManager.getUnlockedSecret).toHaveBeenCalled();
    if (key === 'p2wpkh') {
      await expect(requestsFor(address, fixture, false).signPsbt(identity)).resolves.toMatch(/^70736274ff/);
      expect(signIdx).toHaveBeenCalled();
    }
  });
});
