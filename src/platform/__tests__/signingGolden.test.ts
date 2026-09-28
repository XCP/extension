/**
 * Golden signatures for every signing path.
 *
 * A characterization suite: each expected value below was recorded once from the wallet's own
 * output and is asserted byte for byte. Any change to what the wallet signs (sighash, key
 * selection, derivation path, script, sequence, lock time, witness layout, signature grinding)
 * changes one of these values, and must be made on purpose by re-recording it in review.
 *
 * Real WalletManager, session manager, vault encryption, derivation and signing. Only browser
 * storage, the network (parent transactions and UTXO lists, served from fixed fixtures) and the
 * Trezor adapter are replaced.
 *
 * Taproot: BIP340 signing mixes 32 bytes of auxiliary randomness into the nonce. Both signers the
 * wallet reaches (@scure/btc-signer for transactions, bip322.ts for BIP322 messages) use
 * @noble/curves, which draws it from `crypto.getRandomValues`, so every case runs with that call
 * pinned to a fixed pattern for the duration of the signing call. That makes the Taproot bytes
 * goldenable; the ECDSA paths are RFC 6979 deterministic and need no pin. @noble/curves also draws
 * blinding values (never 32 bytes) for secret scalar arithmetic; they cannot change any output,
 * and the pin covers them too. Each case counts the 32-byte (aux) draws: exactly one per Schnorr
 * signature and none on any ECDSA path. Independently of the golden, every Schnorr signature is
 * verified with a second implementation (@noble/secp256k1, a test-only dependency) against a
 * BIP341 sighash computed here and the prevout's output key, so a recorded golden cannot hide a
 * signature that does not verify.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { hashes, schnorr } from '@noble/secp256k1';
import { SigHash, Transaction } from '@scure/btc-signer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { verifyMessage } from '@/core/bitcoin/messageVerifier/verifier';
import { finalizePSBT, signPSBT } from '@/core/bitcoin/psbt';
import { fetchPreviousRawTransaction, fetchUTXOs } from '@/core/bitcoin/utxo';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { KeychainRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';
import {
  buildKeychainRecord, HARDWARE_PRIVATE_KEY, installChromeSession, PASSWORD, type SpendFixture, spendFixture,
  type WalletKey, walletId,
} from './helpers/signingHarness';

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
  parents: new Map<string, string>(),
  utxos: new Map<string, import('@/core/bitcoin/utxo').UTXO[]>(),
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
// The network: parents and UTXO lists come only from the registered fixtures.
vi.mock('@/core/bitcoin/utxo', async (original) => ({
  ...(await original<typeof import('@/core/bitcoin/utxo')>()),
  fetchUTXOs: vi.fn(async (address: string) => structuredClone(state.utxos.get(address) ?? [])),
  fetchPreviousRawTransaction: vi.fn(async (txid: string) => state.parents.get(txid) ?? null),
}));
// No locally journalled broadcasts: every prevout goes through the fetch path.
vi.mock('@/platform/provider/recentBroadcasts', async (original) => ({
  ...(await original<typeof import('@/platform/provider/recentBroadcasts')>()),
  getTrustedBroadcastPrevout: vi.fn(async () => null),
}));
const hardware = vi.hoisted(() => ({ init: vi.fn(), signPsbt: vi.fn(), signMessage: vi.fn() }));
vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: () => hardware }));

// The independent Schnorr verifier (@noble/secp256k1) needs its hash wired; the wallet signs with @noble/curves.
if (!hashes.sha256) hashes.sha256 = (msg) => new Uint8Array(sha256(msg));

const MESSAGE = 'XCP Wallet golden signature: every signing path, byte for byte.';
const AUX_RAND_BYTE = 0x42;

/** Assert a recorded golden. `name` keys GOLDEN at the end of this file. */
function golden(name: string, actual: unknown): void {
  const recorded: Record<string, unknown> = { ...GOLDEN, ...TREZOR_GOLDEN };
  expect(Object.hasOwn(recorded, name), `a golden is recorded for ${name}`).toBe(true);
  expect(actual, name).toStrictEqual(recorded[name]);
}

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

let manager: WalletManager;

/** Make a fixture wallet active and return its first address. */
async function use(key: WalletKey): Promise<string> {
  await manager.selectWallet(walletId(key));
  return manager.getActiveWallet()!.addresses[0]!.address;
}

/** Serve a fixture's parent and UTXOs from the mocked network. */
function register(address: string): SpendFixture {
  const fixture = spendFixture(address);
  state.parents.set(fixture.parentTxid, fixture.parentHex);
  state.utxos.set(address, fixture.utxos);
  return fixture;
}

/**
 * Run one signing call with `crypto.getRandomValues` pinned to a fixed pattern, and count the
 * 32-byte draws: BIP340 aux randomness, one per Schnorr signature.
 */
async function pinnedRandomness<T>(run: () => Promise<T>): Promise<{ result: T; draws: number }> {
  const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<A extends ArrayBufferView | null>(array: A): A => {
    if (array) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(AUX_RAND_BYTE);
    return array;
  });
  try {
    const result = await run();
    return { result, draws: spy.mock.calls.filter(([array]) => array?.byteLength === 32).length };
  } finally {
    spy.mockRestore();
  }
}

/** BIP341 key-path check: `signature` is valid for input `index` under the prevout's output key. */
function verifyTaprootKeySpend(tx: Transaction, index: number, signature: Uint8Array, fixture: SpendFixture): void {
  const sighash = signature.length === 65 ? signature[64]! : SigHash.DEFAULT;
  const scripts = fixture.inputValues.map(() => fixture.script);
  const amounts = fixture.inputValues.map(BigInt);
  const message = tx.preimageWitnessV1(index, scripts, sighash, amounts);
  const outputKey = fixture.script.slice(2);
  expect(schnorr.verify(signature.slice(0, 64), message, outputKey), `taproot input ${index}`).toBe(true);
}

const SOFTWARE_WALLETS: WalletKey[] = [
  'p2pkh', 'p2shP2wpkh', 'p2wpkh', 'p2tr', 'counterwallet', 'counterwalletSegwit', 'freewallet', 'freewalletSegwit',
  'privateKeyCompressed', 'privateKeyUncompressed',
];
const LEGACY_WALLETS = new Set<WalletKey>(['p2pkh', 'counterwallet', 'freewallet', 'privateKeyCompressed', 'privateKeyUncompressed']);
/** Every software wallet signs PSBTs, the uncompressed key included (its own P2PKH inputs). */
const PSBT_WALLETS = SOFTWARE_WALLETS;
/**
 * One wallet per script type for the sighash variants; the others differ only in key derivation.
 * The uncompressed key is here too: it signs through its own legacy signer, not btc-signer's.
 */
const SIGHASH_WALLETS: WalletKey[] = ['p2pkh', 'p2shP2wpkh', 'p2wpkh', 'p2tr', 'privateKeyUncompressed'];
const psbtFor = (key: WalletKey, fixture: SpendFixture) =>
  LEGACY_WALLETS.has(key) ? fixture.nonWitnessPsbt : fixture.witnessPsbt;

beforeAll(async () => {
  installChromeSession();
  sessionManager.registerSessionExpiredHandler(null);
  await sessionManager.clearAllUnlockedSecrets();
  state.record = await buildKeychainRecord();
  manager = new WalletManager();
  await manager.unlockKeychain(PASSWORD);
});

beforeEach(() => {
  vi.mocked(fetchUTXOs).mockClear();
  vi.mocked(fetchPreviousRawTransaction).mockClear();
  hardware.init.mockReset().mockResolvedValue(undefined);
  hardware.signPsbt.mockReset();
  hardware.signMessage.mockReset();
});

// ---------------------------------------------------------------------------------------------
// Software wallets
// ---------------------------------------------------------------------------------------------

describe('signTransaction golden bytes', () => {
  it.each(SOFTWARE_WALLETS)('%s: prevouts fetched from the network', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    const { result, draws } = await pinnedRandomness(() => manager.signTransaction(fixture.rawTx, address));
    golden(`signTransaction/${key}`, result);
    expect(draws).toBe(key === 'p2tr' ? 2 : 0);
    expect(fetchPreviousRawTransaction).toHaveBeenCalledWith(fixture.parentTxid);
    if (key === 'p2tr') {
      const signed = Transaction.fromRaw(hexToBytes(result), { allowUnknownOutputs: true });
      for (const index of [0, 1]) verifyTaprootKeySpend(signed, index, signed.getInput(index).finalScriptWitness![0]!, fixture);
    }
  });

  it.each(SOFTWARE_WALLETS)('%s: compose API input values and lock scripts', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    const { result } = await pinnedRandomness(() => manager.signTransaction(fixture.rawTx, address, {
      inputValues: fixture.inputValues, lockScripts: fixture.lockScripts,
    }));
    // The same prevouts, so the same bytes as the fetch path. Legacy formats ignore the API data and
    // still fetch each full parent; SegWit formats use it and fetch nothing.
    golden(`signTransaction/${key}`, result);
    if (LEGACY_WALLETS.has(key)) expect(fetchPreviousRawTransaction).toHaveBeenCalled();
    else expect(fetchPreviousRawTransaction).not.toHaveBeenCalled();
  });
});

describe('signPsbt golden bytes', () => {
  /**
   * The request's sighash list. Taproot asks for SIGHASH_DEFAULT explicitly here (so the PSBT records
   * it); with no sighash anywhere it signs DEFAULT too, and records nothing (pinned below).
   * the request or the PSBT the wallet resolves ALL, which the Taproot signer refuses (pinned below).
   */
  const defaultSighash = (key: WalletKey) => (key === 'p2tr' ? [0x00, 0x00] : undefined);

  it.each(PSBT_WALLETS)('%s: explicit signInputs for both inputs', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    const { result, draws } = await pinnedRandomness(() =>
      manager.signPsbt(psbtFor(key, fixture), { [address]: [0, 1] }, defaultSighash(key)));
    golden(`signPsbt/${key}/explicit`, result);
    expect(draws).toBe(key === 'p2tr' ? 2 : 0);
    if (key === 'p2tr') {
      const signed = Transaction.fromPSBT(hexToBytes(result));
      for (const index of [0, 1]) verifyTaprootKeySpend(signed, index, signed.getInput(index).tapKeySig!, fixture);
    }
  });

  it.each(PSBT_WALLETS)('%s: best effort without signInputs', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    const { result } = await pinnedRandomness(() => manager.signPsbt(psbtFor(key, fixture), undefined, defaultSighash(key)));
    // Best effort signs exactly what explicit signInputs for the active address signs.
    golden(`signPsbt/${key}/explicit`, result);
  });

  it.each([
    ['explicit signInputs', true],
    ['best effort', false],
  ] as const)('p2tr: no sighash in the request or the PSBT signs SIGHASH_DEFAULT (%s)', async (_label, explicit) => {
    const address = await use('p2tr');
    const fixture = register(address);
    const { result, draws } = await pinnedRandomness(() =>
      manager.signPsbt(fixture.witnessPsbt, explicit ? { [address]: [0, 1] } : undefined));
    golden('signPsbt/p2tr/no-sighash', result);
    expect(draws).toBe(2);
    const signed = Transaction.fromPSBT(hexToBytes(result));
    const requestedDefault = Transaction.fromPSBT(hexToBytes(GOLDEN['signPsbt/p2tr/explicit']));
    for (const index of [0, 1]) {
      const input = signed.getInput(index);
      // BIP 341/371: a 64-byte DEFAULT signature and no PSBT_IN_SIGHASH_TYPE record.
      expect(input.tapKeySig).toHaveLength(64);
      expect(input.sighashType).toBeUndefined();
      verifyTaprootKeySpend(signed, index, input.tapKeySig!, fixture);
      // The same signature an explicit DEFAULT request produces; only that request's record differs.
      expect(input.tapKeySig).toStrictEqual(requestedDefault.getInput(index).tapKeySig);
      expect(requestedDefault.getInput(index).sighashType).toBe(SigHash.DEFAULT);
    }
  });

  it.each([...LEGACY_WALLETS])('%s: its PSBT signatures finalize to the signTransaction golden', (key) => {
    // Same key, prevouts, sighash (ALL) and RFC 6979 nonces, so the finalized PSBT is byte for byte
    // the raw transaction signTransaction produces. For the uncompressed key this proves the PSBT
    // signer and the transaction signer's hybrid path agree.
    expect(finalizePSBT(GOLDEN[`signPsbt/${key}/explicit` as keyof typeof GOLDEN] as string))
      .toBe(GOLDEN[`signTransaction/${key}` as keyof typeof GOLDEN]);
  });

  it.each(SIGHASH_WALLETS)('%s: SIGHASH_ALL|ANYONECANPAY (0x81) on both inputs', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    const { result } = await pinnedRandomness(() => manager.signPsbt(psbtFor(key, fixture), { [address]: [0, 1] }, [0x81, 0x81]));
    golden(`signPsbt/${key}/0x81`, result);
    if (key === 'p2tr') {
      const signed = Transaction.fromPSBT(hexToBytes(result));
      for (const index of [0, 1]) {
        expect(signed.getInput(index).tapKeySig![64]).toBe(0x81);
        verifyTaprootKeySpend(signed, index, signed.getInput(index).tapKeySig!, fixture);
      }
    }
  });

  it.each(SIGHASH_WALLETS)('%s: SIGHASH_SINGLE|ANYONECANPAY (0x83) on input 0 only', async (key) => {
    const address = await use(key);
    const fixture = register(address);
    const { result } = await pinnedRandomness(() => manager.signPsbt(psbtFor(key, fixture), { [address]: [0] }, [0x83]));
    golden(`signPsbt/${key}/0x83`, result);
    if (key === 'p2tr') {
      const signed = Transaction.fromPSBT(hexToBytes(result));
      expect(signed.getInput(0).tapKeySig![64]).toBe(0x83);
      expect(signed.getInput(1).tapKeySig).toBeUndefined();
      verifyTaprootKeySpend(signed, 0, signed.getInput(0).tapKeySig!, fixture);
    }
  });

  it.each([
    ['p2pkh', 'segwit'],
    ['p2wpkh', 'legacy'],
    ['counterwallet', 'segwit'],
    ['counterwalletSegwit', 'legacy'],
    ['freewallet', 'segwit'],
    ['freewalletSegwit', 'legacy'],
  ] as const)('%s: its paired %s address', async (key, side) => {
    await use(key);
    const paired = (await manager.getPairedAddresses())[side];
    const fixture = register(paired.address);
    const psbt = side === 'legacy' ? fixture.nonWitnessPsbt : fixture.witnessPsbt;
    golden(`signPsbt/${key}/paired-${side}`, await manager.signPsbt(psbt, { [paired.address]: [0, 1] }));
  });
});

describe('signMessage golden signatures', () => {
  it.each(SOFTWARE_WALLETS)('%s: its own address', async (key) => {
    const address = await use(key);
    const { result, draws } = await pinnedRandomness(() => manager.signMessage(MESSAGE, address));
    golden(`signMessage/${key}`, result);
    expect(draws).toBe(key === 'p2tr' ? 1 : 0);
    expect((await verifyMessage(MESSAGE, result.signature, address, { strict: true })).valid).toBe(true);
  });

  it.each([
    ['p2pkh', 'segwit'],
    ['p2wpkh', 'legacy'],
    ['counterwallet', 'segwit'],
    ['freewalletSegwit', 'legacy'],
  ] as const)('%s: its paired %s address', async (key, side) => {
    await use(key);
    const paired = (await manager.getPairedAddresses())[side];
    const result = await manager.signMessage(MESSAGE, paired.address);
    golden(`signMessage/${key}/paired-${side}`, result);
    expect((await verifyMessage(MESSAGE, result.signature, paired.address, { strict: true })).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Hardware (Trezor): the exact request handed to the device adapter
// ---------------------------------------------------------------------------------------------

describe('Trezor request goldens', () => {
  /** The adapter request with its Map made comparable. */
  const requestOf = (mock: typeof hardware.signPsbt) => {
    expect(mock).toHaveBeenCalledTimes(1);
    const request = mock.mock.calls[0]![0] as { inputPaths: Map<number, number[]> } & Record<string, unknown>;
    return { ...request, inputPaths: [...request.inputPaths.entries()] };
  };

  it('signTransaction: a compose PSBT completed from verified parents', async () => {
    const address = await use('trezor');
    const fixture = register(address);
    const signedTxHex = finalizePSBT(signPSBT(fixture.witnessPsbt, HARDWARE_PRIVATE_KEY, [0, 1], AddressFormat.P2WPKH));
    hardware.signPsbt.mockResolvedValue({ signedTxHex });
    await expect(manager.signTransaction(fixture.rawTx, address, {
      psbtHex: fixture.barePsbt, inputValues: fixture.inputValues, lockScripts: fixture.lockScripts,
    })).resolves.toBe(signedTxHex);
    expect(hardware.init).toHaveBeenCalledTimes(1);
    golden('trezor/signTransaction', requestOf(hardware.signPsbt));
  });

  it('signPsbt: explicit inputs, default sighash, signed PSBT result', async () => {
    const address = await use('trezor');
    const fixture = register(address);
    hardware.signPsbt.mockResolvedValue({ signedTxHex: 'unused', signedPsbtHex: 'device-signed-psbt' });
    await expect(manager.signPsbt(fixture.witnessPsbt, { [address]: [0, 1] })).resolves.toBe('device-signed-psbt');
    golden('trezor/signPsbt', requestOf(hardware.signPsbt));
  });

  it('signPsbt: explicit SIGHASH_ALL on input 1 only', async () => {
    const address = await use('trezor');
    const fixture = register(address);
    hardware.signPsbt.mockResolvedValue({ signedTxHex: 'unused', signedPsbtHex: 'device-signed-psbt' });
    const presigned = signPSBT(fixture.witnessPsbt, HARDWARE_PRIVATE_KEY, [0], AddressFormat.P2WPKH);
    await expect(manager.signPsbt(presigned, { [address]: [1] }, [0x01, 0x01])).resolves.toBe('device-signed-psbt');
    golden('trezor/signPsbt/presigned-input-0', requestOf(hardware.signPsbt));
  });

  it('signMessage: message and parsed path', async () => {
    const address = await use('trezor');
    hardware.signMessage.mockResolvedValue({ signature: 'device-signature', address });
    await expect(manager.signMessage(MESSAGE, address)).resolves.toStrictEqual({ signature: 'device-signature', address });
    expect(hardware.signMessage).toHaveBeenCalledTimes(1);
    golden('trezor/signMessage', hardware.signMessage.mock.calls[0]![0]);
  });
});

// ---------------------------------------------------------------------------------------------
// Golden values, recorded from main. A change here is a change to what the wallet signs.
// ---------------------------------------------------------------------------------------------

const GOLDEN = {
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. Legacy: every parent fetched as nonWitnessUtxo. */
  'signTransaction/p2pkh': '020000000299f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa000000006a4730440220234425034295addc257a6bc9240b214458b6395991fe6a545dc62fbf35b0e36f02201f587accf36f289b59c3c8b5637471771af280b2ac5cdccacf5e17ae85d381cd012103aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5efdffffff99f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa010000006a47304402206ba588c3d67490d826f616157867db5c2d2a382f644d3fd132561ed9fd65ac0b02203a71c0e2df991bff3e7d8aff1475b65da2bbc09fe92ae6918a75d7f55b77db3d012103aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5efdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000',
  /** P2SH-P2WPKH, BIP39 reference mnemonic at m/49'/0'/0'/0/0. Fetched parents and compose API values give these same bytes. */
  'signTransaction/p2shP2wpkh': '0200000000010293cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370000000017160014f990679acafe25c27615373b40bf22446d24ff44fdffffff93cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370100000017160014f990679acafe25c27615373b40bf22446d24ff44fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc487100000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b870247304402204ce5fa3b5b49e3861decce8ccdffec6f0ec442bf13f2cd7acaf3a4d06b0da61602205d1919107a07786eaad5011665887e69b6f846603cbc769507f8dcf07ec204060121039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c2402473044022047a2032c8faa932eb6d5e5a14e7a51ff7c8cdb7373923a9dee4b47e8dbab3dd302204ee8c0c40652b7271be4fe6ac4332b582ce55ae591756e81b4c11eb6f1d277c80121039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c2400000000',
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. Fetched parents and compose API values give these same bytes. */
  'signTransaction/p2wpkh': '0200000000010286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e20247304402203577388860de9f298c7ef9db56d0b2d91750eb36bd80f31e14421bca55ab932f022014d1d7792c2cfcddfd14544e0cb9b98cbef129e6aba2e771c65f0811ead4a88d01210330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c0247304402204b715772d62bccc353e0b5cf9abb18a527e6e6f8547e168e3713bca4a3ff6f4602204ad90bc2a0c83ce7ec35d3c4a87046ce19579bd614053090640d448cd80dba4601210330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c00000000',
  /** P2TR key path, BIP39 reference mnemonic at m/86'/0'/0'/0/0, aux randomness pinned to 0x42. Fetched parents and compose API values give these same bytes. */
  'signTransaction/p2tr': '020000000001021dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290000000000fdffffff1dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c01402aab3a15c79e1703d61978f944cbafbc82e0e329cb6493c8b5d87245326a0c3ca869d0b61d99043a200369c226d62457dc49e4b9ca26b85c37d8e277cd18c3de01400c7eb28d7354baae1546902012f10ae03fdca4a2c9e502c27a1a9a4c8126d961a4a211cd94cacadfbe54096f0391c612cb10ae25fddcd53a6897b06067d1b51600000000',
  /** Counterwallet (P2PKH), Counterwallet phrase at m/0'/0/0. Legacy: every parent fetched as nonWitnessUtxo. */
  'signTransaction/counterwallet': '0200000002aa42590e527ed49c32eeb541b9892d753ca3f51a970421ebf23095780a717862000000006a473044022043b21d7fee3bc157328b674a00086069de95b62330bc867024d4011b9ffb417702203316af4e0fe41b7a46efee679018c3c6aaf72e811ae51b15e9f1aebc9ca32b9c0121024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24bfdffffffaa42590e527ed49c32eeb541b9892d753ca3f51a970421ebf23095780a717862010000006a47304402201853f5e8194140413089b162f419e9e799a6c93beaecb61f63488b16e951678a022018a3d0a3ac60be31574c07a9da309dc4d649adc7021b6d5545f9fd7631ef2fc00121024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24bfdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac00000000',
  /** Counterwallet SegWit (P2WPKH), Counterwallet phrase at m/0'/0/0. Fetched parents and compose API values give these same bytes. */
  'signTransaction/counterwalletSegwit': '0200000000010233827e3bb5cb192612a7f5edc1d8f4115ad4d08806faa5e6c67ebef2577e8e5c0000000000fdffffff33827e3bb5cb192612a7f5edc1d8f4115ad4d08806faa5e6c67ebef2577e8e5c0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b20247304402206dd61e630b8be0986a8fc0b9515c0ca12bbf3e91f52b081f42b15fc0bd290a9402204ac8c9d62119b9c542e387743a74187bf935891481bc21e1baee023327648a700121024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b0247304402206beb4c49666313403e263bc5f9d990abbcc919c73f613f59848cb9a549746c5002207dbb1f00058eea42eb464e9d45342403865ca60f0ea0fb776f8e2d3b948145af0121024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b00000000',
  /** Freewallet BIP39 (P2PKH), reference mnemonic's raw entropy as seed, m/0'/0/0. Legacy: every parent fetched as nonWitnessUtxo. */
  'signTransaction/freewallet': '0200000002120b0a9b4f9e6d0cae54ca941752d49393bade42f437883631d685d97521a7ef000000006a47304402201b6fa3a14c090052139ced2cd4a1b440a88ae9e0129c7aea46fa1b3a9a6496e5022053ed40370f4a155950edef9c70a24429d743da474abe0d6e3812eb2bc2f68fdd0121038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa842fdffffff120b0a9b4f9e6d0cae54ca941752d49393bade42f437883631d685d97521a7ef010000006a473044022049e2e6bdd149ac092761910d46f0bb64aa45d0e9d5a73dfbd21cc65b4c4dde6202206b2fe7606faf36912feaa85688b937a63acf7a7ebddd47fceb436dcfb244c7f70121038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa842fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac00000000',
  /** Freewallet BIP39 SegWit (P2WPKH), reference mnemonic's raw entropy as seed, m/0'/0/0. Fetched parents and compose API values give these same bytes. */
  'signTransaction/freewalletSegwit': '02000000000102eec5aa0ef8ce2af1a2a5d09a9e189eb6d518905946a4d9254cba97a9140993200000000000fdffffffeec5aa0ef8ce2af1a2a5d09a9e189eb6d518905946a4d9254cba97a9140993200100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b74828102473044022049a69e2d6f3f8df745ab70796949fecdb8f7f929eb0c77358a1c5c1b4119fc24022059796acc5340e8ec24fdb080d58816c2daaa589e1d96de885b3aee12a82d3e860121038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa8420247304402207188ca772762f1bf0aa693cc49c95cb9cc73980cc122799772c062c4399b86a70220332f283dda14d0c35c41083d2eb25c3ebede46cb978e52594e6098a4307b1ba40121038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa84200000000',
  /** private-key wallet, wiki key compressed, P2PKH. Legacy: every parent fetched as nonWitnessUtxo. */
  'signTransaction/privateKeyCompressed': '020000000217b76361f8ed1bd027b12d2c5f3a5a7a79365d067b3762d4cfb72292ea5e2f51000000006a4730440220253102746f83580ff0b7a56673712721f5f9398e6a2f91abb90410b79f4cfb8702200744d9fbf3483454ed1d3771fe61d4f6f47df25495246077cf2680a41dcf9663012102d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cfdffffff17b76361f8ed1bd027b12d2c5f3a5a7a79365d067b3762d4cfb72292ea5e2f51010000006a47304402206a9d7689ea8b53856491b2b7250cc49632ea89300011c0b6ece35851454f43a302206c8a5adfb5187a725b2a9038a86846ad3390252c6eaa303f0ecbc03f21e737bf012102d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cfdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d9351dcbad5b8f3b8bfa2f2cdc85c28118ca932688ac00000000',
  /** private-key wallet, wiki key uncompressed, P2PKH (hybrid signer). Legacy: every parent fetched as nonWitnessUtxo. */
  'signTransaction/privateKeyUncompressed': '0200000002c3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a26000000008a47304402206594b930d52e3bdf0d2499d457501987fb9e1314ba97c9a95ad37d38dc759daa0220386d38360090372a225c18d5ecd43800140a556d564583c17d076353b2efb019014104d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0afdffffffc3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a26010000008a47304402203f483b7bfe6aa77deeb97736ea5685ec89ae4aea88d09acd3bb246828f7f8305022021db2df8f010f3284c1a2bb97d362843d3f7ea41194b5def591658981ed613dc014104d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0afdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000',
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/p2pkh/explicit': '70736274ff01009d020000000299f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0000000000fdffffff99f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e4730440220234425034295addc257a6bc9240b214458b6395991fe6a545dc62fbf35b0e36f02201f587accf36f289b59c3c8b5637471771af280b2ac5cdccacf5e17ae85d381cd01000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e47304402206ba588c3d67490d826f616157867db5c2d2a382f644d3fd132561ed9fd65ac0b02203a71c0e2df991bff3e7d8aff1475b65da2bbc09fe92ae6918a75d7f55b77db3d01000000',
  /** P2SH-P2WPKH, BIP39 reference mnemonic at m/49'/0'/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/p2shP2wpkh/explicit': '70736274ff01009b020000000293cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370000000000fdffffff93cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc487100000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b870000000000010120a08601000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b872202039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c2447304402204ce5fa3b5b49e3861decce8ccdffec6f0ec442bf13f2cd7acaf3a4d06b0da61602205d1919107a07786eaad5011665887e69b6f846603cbc769507f8dcf07ec20406010104160014f990679acafe25c27615373b40bf22446d24ff440001012050c300000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b872202039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c24473044022047a2032c8faa932eb6d5e5a14e7a51ff7c8cdb7373923a9dee4b47e8dbab3dd302204ee8c0c40652b7271be4fe6ac4332b582ce55ae591756e81b4c11eb6f1d277c8010104160014f990679acafe25c27615373b40bf22446d24ff44000000',
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/p2wpkh/explicit': '70736274ff01009a020000000286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000000001011fa086010000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c47304402203577388860de9f298c7ef9db56d0b2d91750eb36bd80f31e14421bca55ab932f022014d1d7792c2cfcddfd14544e0cb9b98cbef129e6aba2e771c65f0811ead4a88d010001011f50c3000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c47304402204b715772d62bccc353e0b5cf9abb18a527e6e6f8547e168e3713bca4a3ff6f4602204ad90bc2a0c83ce7ec35d3c4a87046ce19579bd614053090640d448cd80dba4601000000',
  /** P2TR key path, BIP39 reference mnemonic at m/86'/0'/0'/0/0, aux randomness pinned to 0x42. Both inputs, default sighash (DEFAULT requested); best effort gives the same bytes. */
  'signPsbt/p2tr/explicit': '70736274ff0100a602000000021dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290000000000fdffffff1dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c000000000001012ba086010000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c010304000000000113402aab3a15c79e1703d61978f944cbafbc82e0e329cb6493c8b5d87245326a0c3ca869d0b61d99043a200369c226d62457dc49e4b9ca26b85c37d8e277cd18c3de011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc1150001012b50c3000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c010304000000000113400c7eb28d7354baae1546902012f10ae03fdca4a2c9e502c27a1a9a4c8126d961a4a211cd94cacadfbe54096f0391c612cb10ae25fddcd53a6897b06067d1b516011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115000000',
  /** P2TR key path, BIP39 reference mnemonic at m/86'/0'/0'/0/0, aux randomness pinned to 0x42. Both inputs, no sighash in the request or the PSBT: SIGHASH_DEFAULT, 64-byte signatures identical to signPsbt/p2tr/explicit's, and no sighash record; best effort gives the same bytes. */
  'signPsbt/p2tr/no-sighash': '70736274ff0100a602000000021dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290000000000fdffffff1dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c000000000001012ba086010000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c0113402aab3a15c79e1703d61978f944cbafbc82e0e329cb6493c8b5d87245326a0c3ca869d0b61d99043a200369c226d62457dc49e4b9ca26b85c37d8e277cd18c3de011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc1150001012b50c3000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c0113400c7eb28d7354baae1546902012f10ae03fdca4a2c9e502c27a1a9a4c8126d961a4a211cd94cacadfbe54096f0391c612cb10ae25fddcd53a6897b06067d1b516011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115000000',
  /** Counterwallet (P2PKH), Counterwallet phrase at m/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/counterwallet/explicit': '70736274ff01009d0200000002aa42590e527ed49c32eeb541b9892d753ca3f51a970421ebf23095780a7178620000000000fdffffffaa42590e527ed49c32eeb541b9892d753ca3f51a970421ebf23095780a7178620100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac50c30000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac000000002202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b473044022043b21d7fee3bc157328b674a00086069de95b62330bc867024d4011b9ffb417702203316af4e0fe41b7a46efee679018c3c6aaf72e811ae51b15e9f1aebc9ca32b9c01000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac50c30000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac000000002202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b47304402201853f5e8194140413089b162f419e9e799a6c93beaecb61f63488b16e951678a022018a3d0a3ac60be31574c07a9da309dc4d649adc7021b6d5545f9fd7631ef2fc001000000',
  /** Counterwallet SegWit (P2WPKH), Counterwallet phrase at m/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/counterwalletSegwit/explicit': '70736274ff01009a020000000233827e3bb5cb192612a7f5edc1d8f4115ad4d08806faa5e6c67ebef2577e8e5c0000000000fdffffff33827e3bb5cb192612a7f5edc1d8f4115ad4d08806faa5e6c67ebef2577e8e5c0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b2000000000001011fa086010000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b22202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b47304402206dd61e630b8be0986a8fc0b9515c0ca12bbf3e91f52b081f42b15fc0bd290a9402204ac8c9d62119b9c542e387743a74187bf935891481bc21e1baee023327648a70010001011f50c3000000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b22202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b47304402206beb4c49666313403e263bc5f9d990abbcc919c73f613f59848cb9a549746c5002207dbb1f00058eea42eb464e9d45342403865ca60f0ea0fb776f8e2d3b948145af01000000',
  /** Freewallet BIP39 (P2PKH), reference mnemonic's raw entropy as seed, m/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/freewallet/explicit': '70736274ff01009d0200000002120b0a9b4f9e6d0cae54ca941752d49393bade42f437883631d685d97521a7ef0000000000fdffffff120b0a9b4f9e6d0cae54ca941752d49393bade42f437883631d685d97521a7ef0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac50c30000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac000000002202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa84247304402201b6fa3a14c090052139ced2cd4a1b440a88ae9e0129c7aea46fa1b3a9a6496e5022053ed40370f4a155950edef9c70a24429d743da474abe0d6e3812eb2bc2f68fdd01000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac50c30000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac000000002202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa842473044022049e2e6bdd149ac092761910d46f0bb64aa45d0e9d5a73dfbd21cc65b4c4dde6202206b2fe7606faf36912feaa85688b937a63acf7a7ebddd47fceb436dcfb244c7f701000000',
  /** Freewallet BIP39 SegWit (P2WPKH), reference mnemonic's raw entropy as seed, m/0'/0/0. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/freewalletSegwit/explicit': '70736274ff01009a0200000002eec5aa0ef8ce2af1a2a5d09a9e189eb6d518905946a4d9254cba97a9140993200000000000fdffffffeec5aa0ef8ce2af1a2a5d09a9e189eb6d518905946a4d9254cba97a9140993200100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b748281000000000001011fa086010000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b7482812202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa842473044022049a69e2d6f3f8df745ab70796949fecdb8f7f929eb0c77358a1c5c1b4119fc24022059796acc5340e8ec24fdb080d58816c2daaa589e1d96de885b3aee12a82d3e86010001011f50c3000000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b7482812202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa84247304402207188ca772762f1bf0aa693cc49c95cb9cc73980cc122799772c062c4399b86a70220332f283dda14d0c35c41083d2eb25c3ebede46cb978e52594e6098a4307b1ba401000000',
  /** private-key wallet, wiki key compressed, P2PKH. Both inputs, default sighash (ALL); best effort gives the same bytes. */
  'signPsbt/privateKeyCompressed/explicit': '70736274ff01009d020000000217b76361f8ed1bd027b12d2c5f3a5a7a79365d067b3762d4cfb72292ea5e2f510000000000fdffffff17b76361f8ed1bd027b12d2c5f3a5a7a79365d067b3762d4cfb72292ea5e2f510100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d9351dcbad5b8f3b8bfa2f2cdc85c28118ca932688ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d9351dcbad5b8f3b8bfa2f2cdc85c28118ca932688ac50c30000000000001976a914d9351dcbad5b8f3b8bfa2f2cdc85c28118ca932688ac00000000220202d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645c4730440220253102746f83580ff0b7a56673712721f5f9398e6a2f91abb90410b79f4cfb8702200744d9fbf3483454ed1d3771fe61d4f6f47df25495246077cf2680a41dcf966301000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d9351dcbad5b8f3b8bfa2f2cdc85c28118ca932688ac50c30000000000001976a914d9351dcbad5b8f3b8bfa2f2cdc85c28118ca932688ac00000000220202d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645c47304402206a9d7689ea8b53856491b2b7250cc49632ea89300011c0b6ece35851454f43a302206c8a5adfb5187a725b2a9038a86846ad3390252c6eaa303f0ecbc03f21e737bf01000000',
  /** private-key wallet, wiki key uncompressed, P2PKH, signed with the 65-byte key. Both inputs, default sighash (ALL); best effort gives the same bytes, and it finalizes to signTransaction/privateKeyUncompressed. */
  'signPsbt/privateKeyUncompressed/explicit': '70736274ff01009d0200000002c3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a260000000000fdffffffc3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a260100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac50c30000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000420204d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0a47304402206594b930d52e3bdf0d2499d457501987fb9e1314ba97c9a95ad37d38dc759daa0220386d38360090372a225c18d5ecd43800140a556d564583c17d076353b2efb01901000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac50c30000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000420204d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0a47304402203f483b7bfe6aa77deeb97736ea5685ec89ae4aea88d09acd3bb246828f7f8305022021db2df8f010f3284c1a2bb97d362843d3f7ea41194b5def591658981ed613dc01000000',
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. Both inputs, SIGHASH_ALL|ANYONECANPAY. */
  'signPsbt/p2pkh/0x81': '70736274ff01009d020000000299f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0000000000fdffffff99f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e4730440220695c35abed9f517f2551c778b37a3653ab1b1278090e3c105287895b1ad554f7022055cdd6ce11aff5f8fc2c2e2dc3041335c1000c9483b46a75675229bc095f18bc8101030481000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e47304402207d931c7a9575bc2954ffe21a5e29d1fb22f1c10a56e91b9a14a36afbf3953d6802203585e3b06db918a4666e9742ea0dc0279a588cbf29ef7c9364104796c9c5eb408101030481000000000000',
  /** P2SH-P2WPKH, BIP39 reference mnemonic at m/49'/0'/0'/0/0. Both inputs, SIGHASH_ALL|ANYONECANPAY. */
  'signPsbt/p2shP2wpkh/0x81': '70736274ff01009b020000000293cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370000000000fdffffff93cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc487100000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b870000000000010120a08601000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b872202039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c2447304402200652577d812ad444d36bb00dc7ebbe80db04feadd234118108a6ca6ffd1015f202200bda7d5f30f9efe32197ffe3abebf7a9cc4df26dd1dfa1c73b6fb67e73e492dd81010304810000000104160014f990679acafe25c27615373b40bf22446d24ff440001012050c300000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b872202039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c2447304402201c3c3b2521334465d70d2d8aa0dcbb5b56c83029dad1d55318870bf6a421d3400220598fd517f16c8a98e73782268e55266da79dbb95a35f68445defd9347b72bc5b81010304810000000104160014f990679acafe25c27615373b40bf22446d24ff44000000',
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. Both inputs, SIGHASH_ALL|ANYONECANPAY. */
  'signPsbt/p2wpkh/0x81': '70736274ff01009a020000000286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000000001011fa086010000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c4730440220108ee88038f6ff701a9ba5171b0bd111cf821486c49814ed6f89898be219a22902201bcd433b80a77181c496819ea4d6ca9c05e991c650a083a8d5c53b8c5aecde7781010304810000000001011f50c3000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c4730440220657bf4952e683f181270b9a6dfe0607d0470a84fd31803bd4eed3e583009ad12022042e296c5364691d8308116eb9ba95cea3cad6d2edba9f1f6c3fc452030e1c4128101030481000000000000',
  /** P2TR key path, BIP39 reference mnemonic at m/86'/0'/0'/0/0, aux randomness pinned to 0x42. Both inputs, SIGHASH_ALL|ANYONECANPAY. */
  'signPsbt/p2tr/0x81': '70736274ff0100a602000000021dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290000000000fdffffff1dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c000000000001012ba086010000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c010304810000000113415a981ffe9a2d2813c22c79bfcd07ebfc1f45b3c6f025a1d06cbb3ea25ac6a74115eb1e4ebbab02e1dfb05ae69da9c1167ab40669515344e11d3d8b7209973ece81011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc1150001012b50c3000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c0103048100000001134132526b82824b58ba4e9e7ce0ecd91587ad968efbd2b155b3b784d99766be3d0a75f7a391db73480ecfd369db3bafbb329e1a62ef54deed43b2b3967b23f7a96c81011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115000000',
  /** private-key wallet, wiki key uncompressed, P2PKH. Both inputs, SIGHASH_ALL|ANYONECANPAY. */
  'signPsbt/privateKeyUncompressed/0x81': '70736274ff01009d0200000002c3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a260000000000fdffffffc3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a260100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac50c30000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000420204d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0a47304402200fb58d441628dd4828c25393011e62e2f3deb15dbc6b23c6e64ac0089ad5cade0220039d774445778c7e41257a9c7cb2125549862b5010f2e67c6d45697c24952c608101030481000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac50c30000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000420204d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0a47304402204de2b32115487ff8f323dad89f23fbc201deeb40d777404163bf7b0d8195446802202469b2a74641ca20e408403a722ea78961b281919294b91b372a709670ae638c8101030481000000000000',
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. Input 0 only, SIGHASH_SINGLE|ANYONECANPAY; input 1 left unsigned. */
  'signPsbt/p2pkh/0x83': '70736274ff01009d020000000299f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0000000000fdffffff99f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e473044022041b2195b93eb58538a116ddc9482f7f72cc7ad86437dfd1431a4196f6ec19d6202205bbc3d6e270baa612769e6751ce6248a58218ce64ca23c1492a2e602330a2ef08301030483000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000000000',
  /** P2SH-P2WPKH, BIP39 reference mnemonic at m/49'/0'/0'/0/0. Input 0 only, SIGHASH_SINGLE|ANYONECANPAY; input 1 left unsigned. */
  'signPsbt/p2shP2wpkh/0x83': '70736274ff01009b020000000293cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370000000000fdffffff93cb0adc60f9330b35cacf462f4feaf1341c0765bc697da2de32931bfcb090370100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc487100000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b870000000000010120a08601000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b872202039b3b694b8fc5b5e07fb069c783cac754f5d38c3e08bed1960e31fdb1dda35c2447304402204550845a121c05b8be4466293d51b7dabf82c81766ee862610235b46764c45ed02202f9d2a9d62a9178c896f035be3525c1e5bcfc84986ec3ffe2eec703bfd6f63ee83010304830000000104160014f990679acafe25c27615373b40bf22446d24ff440001012050c300000000000017a9143fb6e95812e57bb4691f9a4a628862a61a4f769b87000000',
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. Input 0 only, SIGHASH_SINGLE|ANYONECANPAY; input 1 left unsigned. */
  'signPsbt/p2wpkh/0x83': '70736274ff01009a020000000286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000000001011fa086010000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c473044022001e263affcb0e81c132381bce400f9d4f90c528476637e592af82dd32b9fe78a0220245c79165faab7a961a424b1faa4b1ff85cba590f445b20fcd2f8b1a73ba35e583010304830000000001011f50c3000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000',
  /** P2TR key path, BIP39 reference mnemonic at m/86'/0'/0'/0/0, aux randomness pinned to 0x42. Input 0 only, SIGHASH_SINGLE|ANYONECANPAY; input 1 left unsigned. */
  'signPsbt/p2tr/0x83': '70736274ff0100a602000000021dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290000000000fdffffff1dd4fb48cc0f8c1d4bbb1605f935bb1b473137cdf55f56fb2089743a3c0dc1290100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c000000000001012ba086010000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c01030483000000011341cf9481f4582307d3cd4964f38ece43859121b1ad41435d48cb6f609f5863ba282c9c711af6be487bd72c03c609dfd0c30d6fe1bf1c676d94400832d89427214283011720cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc1150001012b50c3000000000000225120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c000000',
  /** private-key wallet, wiki key uncompressed, P2PKH. Input 0 only, SIGHASH_SINGLE|ANYONECANPAY; input 1 left unsigned. */
  'signPsbt/privateKeyUncompressed/0x83': '70736274ff01009d0200000002c3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a260000000000fdffffffc3e23ddf566f2c3dee18c1ffcda0f2fa6fe73e92999acebb758ab1ee0fb82a260100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac50c30000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000420204d0de0aaeaefad02b8bdc8a01a1b8b11c696bd3d66a2c5f10780d95b7df42645cd85228a6fb29940e858e7e55842ae2bd115d1ed7cc0e82d934e929c97648cb0a47304402207ab2b9efe2f80d7c374107b711aeb79e896bf6a070a5204a6ea36af6510f55e3022033ba8912cabca8370ae5ac58600552420a83a46f0685a746cb5b527b9d8f5c8f8301030483000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac50c30000000000001976a914a65d1a239d4ec666643d350c7bb8fc44d288112888ac00000000000000',
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. Both inputs of its paired segwit address, signed through signInputs. */
  'signPsbt/p2pkh/paired-segwit': '70736274ff01009a020000000286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000000001011fa086010000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c47304402203577388860de9f298c7ef9db56d0b2d91750eb36bd80f31e14421bca55ab932f022014d1d7792c2cfcddfd14544e0cb9b98cbef129e6aba2e771c65f0811ead4a88d010001011f50c3000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c47304402204b715772d62bccc353e0b5cf9abb18a527e6e6f8547e168e3713bca4a3ff6f4602204ad90bc2a0c83ce7ec35d3c4a87046ce19579bd614053090640d448cd80dba4601000000',
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. Both inputs of its paired legacy address, signed through signInputs. */
  'signPsbt/p2wpkh/paired-legacy': '70736274ff01009d020000000299f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0000000000fdffffff99f31903abf71ead923001d606e8fc5d536865c4980159ea324df81345a7e8aa0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e4730440220234425034295addc257a6bc9240b214458b6395991fe6a545dc62fbf35b0e36f02201f587accf36f289b59c3c8b5637471771af280b2ac5cdccacf5e17ae85d381cd01000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac50c30000000000001976a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac00000000220203aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e47304402206ba588c3d67490d826f616157867db5c2d2a382f644d3fd132561ed9fd65ac0b02203a71c0e2df991bff3e7d8aff1475b65da2bbc09fe92ae6918a75d7f55b77db3d01000000',
  /** Counterwallet (P2PKH), Counterwallet phrase at m/0'/0/0. Both inputs of its paired segwit address, signed through signInputs. */
  'signPsbt/counterwallet/paired-segwit': '70736274ff01009a020000000233827e3bb5cb192612a7f5edc1d8f4115ad4d08806faa5e6c67ebef2577e8e5c0000000000fdffffff33827e3bb5cb192612a7f5edc1d8f4115ad4d08806faa5e6c67ebef2577e8e5c0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b2000000000001011fa086010000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b22202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b47304402206dd61e630b8be0986a8fc0b9515c0ca12bbf3e91f52b081f42b15fc0bd290a9402204ac8c9d62119b9c542e387743a74187bf935891481bc21e1baee023327648a70010001011f50c3000000000000160014ab058b457deb1dd99aa0999af87237a9ca0f84b22202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b47304402206beb4c49666313403e263bc5f9d990abbcc919c73f613f59848cb9a549746c5002207dbb1f00058eea42eb464e9d45342403865ca60f0ea0fb776f8e2d3b948145af01000000',
  /** Counterwallet SegWit (P2WPKH), Counterwallet phrase at m/0'/0/0. Both inputs of its paired legacy address, signed through signInputs. */
  'signPsbt/counterwalletSegwit/paired-legacy': '70736274ff01009d0200000002aa42590e527ed49c32eeb541b9892d753ca3f51a970421ebf23095780a7178620000000000fdffffffaa42590e527ed49c32eeb541b9892d753ca3f51a970421ebf23095780a7178620100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac50c30000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac000000002202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b473044022043b21d7fee3bc157328b674a00086069de95b62330bc867024d4011b9ffb417702203316af4e0fe41b7a46efee679018c3c6aaf72e811ae51b15e9f1aebc9ca32b9c01000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac50c30000000000001976a914ab058b457deb1dd99aa0999af87237a9ca0f84b288ac000000002202024ef944bd8c2ef4d77faeca609166adb1c4fadb5430e941e0e2b302b09c63b24b47304402201853f5e8194140413089b162f419e9e799a6c93beaecb61f63488b16e951678a022018a3d0a3ac60be31574c07a9da309dc4d649adc7021b6d5545f9fd7631ef2fc001000000',
  /** Freewallet BIP39 (P2PKH), reference mnemonic's raw entropy as seed, m/0'/0/0. Both inputs of its paired segwit address, signed through signInputs. */
  'signPsbt/freewallet/paired-segwit': '70736274ff01009a0200000002eec5aa0ef8ce2af1a2a5d09a9e189eb6d518905946a4d9254cba97a9140993200000000000fdffffffeec5aa0ef8ce2af1a2a5d09a9e189eb6d518905946a4d9254cba97a9140993200100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b748281000000000001011fa086010000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b7482812202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa842473044022049a69e2d6f3f8df745ab70796949fecdb8f7f929eb0c77358a1c5c1b4119fc24022059796acc5340e8ec24fdb080d58816c2daaa589e1d96de885b3aee12a82d3e86010001011f50c3000000000000160014ad0bab3ce0a83ce6b18349708fd711bf5b7482812202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa84247304402207188ca772762f1bf0aa693cc49c95cb9cc73980cc122799772c062c4399b86a70220332f283dda14d0c35c41083d2eb25c3ebede46cb978e52594e6098a4307b1ba401000000',
  /** Freewallet BIP39 SegWit (P2WPKH), reference mnemonic's raw entropy as seed, m/0'/0/0. Both inputs of its paired legacy address, signed through signInputs. */
  'signPsbt/freewalletSegwit/paired-legacy': '70736274ff01009d0200000002120b0a9b4f9e6d0cae54ca941752d49393bade42f437883631d685d97521a7ef0000000000fdffffff120b0a9b4f9e6d0cae54ca941752d49393bade42f437883631d685d97521a7ef0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc48710000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac00000000000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac50c30000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac000000002202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa84247304402201b6fa3a14c090052139ced2cd4a1b440a88ae9e0129c7aea46fa1b3a9a6496e5022053ed40370f4a155950edef9c70a24429d743da474abe0d6e3812eb2bc2f68fdd01000100770200000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000ffffffff02a0860100000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac50c30000000000001976a914ad0bab3ce0a83ce6b18349708fd711bf5b74828188ac000000002202038e966133356b8e010e7b290518096b59b59d54f876ad1991c675e71805aaa842473044022049e2e6bdd149ac092761910d46f0bb64aa45d0e9d5a73dfbd21cc65b4c4dde6202206b2fe7606faf36912feaa85688b937a63acf7a7ebddd47fceb436dcfb244c7f701000000',
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/p2pkh': { signature: 'AkcwRAIgECKyClyf+Km3lKurPoTbHe+oe2XExmpTzD8W3vjZ3cMCIHJnRmhIW4NRVlYODYjjOUIfWrlG0LJ3p/EmInD9fUmgASEDqutS3XSUw2EEneZ8xoDoPry7vb6xNjfZLNhF9wMIr14=', address: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA' },
  /** P2SH-P2WPKH, BIP39 reference mnemonic at m/49'/0'/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/p2shP2wpkh': { signature: 'AkcwRAIgd+8HNLj3J+9byse+no5XoMPB79vICvBVOZ0oRFtXZx4CIGwW4YP40/dB/GrMmsGP48p832wZgRD23KxEjwX4PIifASEDmztpS4/FteB/sGnHg8rHVPXTjD4IvtGWDjH9sd2jXCQ=', address: '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf' },
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/p2wpkh': { signature: 'AkgwRQIhAPg3uf9Quls2fQ0AKW0UX0l9X4FrzbD0qL1M/0pBzT80AiAqLbHA0BGnXkMEpmPBvjMLY1//ZxD0hbRlngvFaMuUewEhAzDVT9DdQgpuX402JPXzSCyuNQ951fB1O/W+75wtka88', address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu' },
  /** P2TR key path, BIP39 reference mnemonic at m/86'/0'/0'/0/0, aux randomness pinned to 0x42. BIP322 over MESSAGE for its own address. */
  'signMessage/p2tr': { signature: 'AUC8H2KZ0Pe3wTNu5DYbmT3zBVb78eLa9bh2KoEmYFP/4ZSr8/4uyZBFiYou+QMmPVvDWXsqDtTaIn+dHrCyKkSE', address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr' },
  /** Counterwallet (P2PKH), Counterwallet phrase at m/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/counterwallet': { signature: 'AkgwRQIhAKor8G8KKNAB/qTEV66ZTNTiLPRHykjZtsldKCOaxk1hAiBJ1NlA0JX0p1nIxUJDv+F/ma+Ydli/qtXme8vfhBtWGAEhAk75RL2MLvTXf67KYJFmrbHE+ttUMOlB4OKzArCcY7JL', address: '1GbHC1Ww2ALBivAXdnykDtBcdogaw6AVDa' },
  /** Counterwallet SegWit (P2WPKH), Counterwallet phrase at m/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/counterwalletSegwit': { signature: 'AkgwRQIhAN2IQJBPGobzRgmi6+YhBYmkhzHqikCua5P/FsPD52X8AiAtkTGitsqtiVhruzoimVyK2yCzT33UaPwnDcloidMmCwEhAk75RL2MLvTXf67KYJFmrbHE+ttUMOlB4OKzArCcY7JL', address: 'bc1q4vzck3taavwanx4qnxd0su3h489qlp9j733hus' },
  /** Freewallet BIP39 (P2PKH), reference mnemonic's raw entropy as seed, m/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/freewallet': { signature: 'AkgwRQIhAM+m9wnL0YRpDURzWbvfSi+5Pvkjh/vbM78B62splJ8hAiAsRDr48LDYzxBPKsb40PF6MEbc09/nCL49pDNmcspO/wEhA46WYTM1a44BDnspBRgJa1m1nVT4dq0ZkcZ15xgFqqhC', address: '1GmysxSbtZEvUAmPRube3grdjtnyVbP3Rx' },
  /** Freewallet BIP39 SegWit (P2WPKH), reference mnemonic's raw entropy as seed, m/0'/0/0. BIP322 over MESSAGE for its own address. */
  'signMessage/freewalletSegwit': { signature: 'AkgwRQIhAL6LQZQ8qSwpXMW1xULHgvd1Mq1h5m5n8Sr8MKOkk1sEAiBymdEyfhnn8m3enWpUCaR2PaIscFL9fJ4PqLgDYhPsBwEhA46WYTM1a44BDnspBRgJa1m1nVT4dq0ZkcZ15xgFqqhC', address: 'bc1q4596k08q4q7wdvvrf9cgl4c3hadhfq5p9w7e90' },
  /** private-key wallet, wiki key compressed, P2PKH. BIP322 over MESSAGE for its own address. */
  'signMessage/privateKeyCompressed': { signature: 'AkcwRAIgT3NiQwhbMXfLtw2i4EMUtJaj3Z98IKqrB8PQ9dhRjnMCIDhqLzvzbYpaDHKhFuTHONfq56s6uXYhjwcShARrepf+ASEC0N4Krq760CuL3IoBobixHGlr09ZqLF8QeA2Vt99CZFw=', address: '1LoVGDgRs9hTfTNJNuXKSpywcbdvwRXpmK' },
  /** private-key wallet, wiki key uncompressed, P2PKH (hybrid signer). BIP322 over MESSAGE for its own address. */
  'signMessage/privateKeyUncompressed': { signature: 'AkgwRQIhAMwmf3gY41SilipMoXrko04n8oKVRfJJgsuVM9d0l/5hAiBNonqJl5jbotIhNdxxeRojUFffomlEuPdRsN96HlkJEwFBBNDeCq6u+tAri9yKAaG4sRxpa9PWaixfEHgNlbffQmRc2FIopvsplA6Fjn5VhCrivRFdHtfMDoLZNOkpyXZIywo=', address: '1GAehh7TsJAHuUAeKZcXf5CnwuGuGgyX2S' },
  /** P2PKH, BIP39 reference mnemonic at m/44'/0'/0'/0/0. BIP322 over MESSAGE for its paired segwit address. */
  'signMessage/p2pkh/paired-segwit': { signature: 'AkgwRQIhAPg3uf9Quls2fQ0AKW0UX0l9X4FrzbD0qL1M/0pBzT80AiAqLbHA0BGnXkMEpmPBvjMLY1//ZxD0hbRlngvFaMuUewEhAzDVT9DdQgpuX402JPXzSCyuNQ951fB1O/W+75wtka88', address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu' },
  /** P2WPKH, BIP39 reference mnemonic at m/84'/0'/0'/0/0. BIP322 over MESSAGE for its paired legacy address. */
  'signMessage/p2wpkh/paired-legacy': { signature: 'AkcwRAIgECKyClyf+Km3lKurPoTbHe+oe2XExmpTzD8W3vjZ3cMCIHJnRmhIW4NRVlYODYjjOUIfWrlG0LJ3p/EmInD9fUmgASEDqutS3XSUw2EEneZ8xoDoPry7vb6xNjfZLNhF9wMIr14=', address: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA' },
  /** Counterwallet (P2PKH), Counterwallet phrase at m/0'/0/0. BIP322 over MESSAGE for its paired segwit address. */
  'signMessage/counterwallet/paired-segwit': { signature: 'AkgwRQIhAN2IQJBPGobzRgmi6+YhBYmkhzHqikCua5P/FsPD52X8AiAtkTGitsqtiVhruzoimVyK2yCzT33UaPwnDcloidMmCwEhAk75RL2MLvTXf67KYJFmrbHE+ttUMOlB4OKzArCcY7JL', address: 'bc1q4vzck3taavwanx4qnxd0su3h489qlp9j733hus' },
  /** Freewallet BIP39 SegWit (P2WPKH), reference mnemonic's raw entropy as seed, m/0'/0/0. BIP322 over MESSAGE for its paired legacy address. */
  'signMessage/freewalletSegwit/paired-legacy': { signature: 'AkgwRQIhAM+m9wnL0YRpDURzWbvfSi+5Pvkjh/vbM78B62splJ8hAiAsRDr48LDYzxBPKsb40PF6MEbc09/nCL49pDNmcspO/wEhA46WYTM1a44BDnspBRgJa1m1nVT4dq0ZkcZ15xgFqqhC', address: '1GmysxSbtZEvUAmPRube3grdjtnyVbP3Rx' },
} as const;

/** Hardened BIP32 index. */
const H = 0x80000000;
/** m/84'/0'/0'/0/0, the Trezor account's only address, as the adapter receives it. */
const TREZOR_PATH = [H + 84, H + 0, H + 0, 0, 0];
/**
 * The PSBT handed to the device for the fixture spend: both inputs completed with witnessUtxo
 * (amount and script) taken from the verified parent, nothing else added.
 */
const TREZOR_COMPLETED_PSBT = '70736274ff01009a020000000286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000000001011fa086010000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e20001011f50c3000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000';
/** As TREZOR_COMPLETED_PSBT, with input 0 already carrying the software key's SIGHASH_ALL signature. */
const TREZOR_PRESIGNED_PSBT = '70736274ff01009a020000000286dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0000000000fdffffff86dda36eec7b6757f3bb122d0d2aad3c7213b15c15d460b3063051e20877a6eb0100000000fdffffff02c0d401000000000016001406afd46bcdfd22ef94ac122aa11f241244a37ecc4871000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000000001011fa086010000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e222020330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c47304402203577388860de9f298c7ef9db56d0b2d91750eb36bd80f31e14421bca55ab932f022014d1d7792c2cfcddfd14544e0cb9b98cbef129e6aba2e771c65f0811ead4a88d010001011f50c3000000000000160014c0cebcd6c3d3ca8c75dc5ec62ebe55330ef910e2000000';

const TREZOR_GOLDEN = {
  /** signTransaction: the completed PSBT and a path per input; no sighash list, raw transaction result. */
  'trezor/signTransaction': { psbtHex: TREZOR_COMPLETED_PSBT, inputPaths: [[0, TREZOR_PATH], [1, TREZOR_PATH]] },
  /** signPsbt, both inputs requested with no sighash list: a signed PSBT result. */
  'trezor/signPsbt': {
    psbtHex: TREZOR_COMPLETED_PSBT, inputPaths: [[0, TREZOR_PATH], [1, TREZOR_PATH]], sighashTypes: undefined, resultFormat: 'signed_psbt',
  },
  /** signPsbt, input 1 requested with explicit SIGHASH_ALL; presigned input 0 gets no path. */
  'trezor/signPsbt/presigned-input-0': {
    psbtHex: TREZOR_PRESIGNED_PSBT, inputPaths: [[1, TREZOR_PATH]], sighashTypes: [0x01, 0x01], resultFormat: 'signed_psbt',
  },
  /** signMessage: the message verbatim and the address path. */
  'trezor/signMessage': { message: MESSAGE, path: TREZOR_PATH },
};
