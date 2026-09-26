/**
 * Fixtures shared by the signing characterization suites (signingGolden, signingLockBarriers).
 *
 * Every wallet, key and transaction here is fixed, so the bytes the wallet signs are a pure
 * function of the code under test. The suites build a real encrypted keychain from these, unlock
 * it with the real WalletManager, and replace only browser storage and the network.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { Address as BtcAddress, OutScript, p2wpkh, Transaction } from '@scure/btc-signer';
import { AddressFormat } from '@/core/bitcoin/address';
import { encodeWIF, getAddressFromPrivateKey, getPrivateKeyFromMnemonic } from '@/core/bitcoin/privateKey';
import type { UTXO } from '@/core/bitcoin/utxo';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey, encryptWithKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { deriveMnemonicAddresses } from '@/core/wallet/addressDeriver';
import { encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import type { KeychainRecord, WalletRecord } from '@/types/wallet';

export const PASSWORD = 'synthetic-vault-password';
const ITERATIONS = 500_000;

/** The BIP39 reference mnemonic (all-zero entropy). */
export const BIP39_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
/** The Counterwallet (Electrum v1 word list) phrase the vault tests already use. */
export const COUNTERWALLET_MNEMONIC = 'like just love know never want time out there make look eye';
/** The Bitcoin wiki's WIF example key, imported once compressed and once uncompressed. */
export const WIKI_PRIVATE_KEY = '0c28fca386c7a227600b2fe50b7cae11ec86d3bf1fbe471be89827e19d72aa1d';
/** The key a Trezor account is modelled on: BIP39_MNEMONIC at m/84'/0'/0'/0/0. */
export const HARDWARE_PATH = "m/84'/0'/0'/0/0";
export const HARDWARE_PRIVATE_KEY = getPrivateKeyFromMnemonic(BIP39_MNEMONIC, HARDWARE_PATH, AddressFormat.P2WPKH);

export type WalletKey =
  | 'p2pkh' | 'p2shP2wpkh' | 'p2wpkh' | 'p2tr'
  | 'counterwallet' | 'counterwalletSegwit' | 'freewallet' | 'freewalletSegwit'
  | 'privateKeyCompressed' | 'privateKeyUncompressed' | 'trezor';

interface WalletSpec {
  type: WalletRecord['type'];
  format: AddressFormat;
  secret: string;
  previewAddress: string;
}

const mnemonicSpec = (mnemonic: string, format: AddressFormat): WalletSpec => ({
  type: 'mnemonic', format, secret: mnemonic, previewAddress: deriveMnemonicAddresses(mnemonic, format, 1)[0]!.address,
});
const privateKeySpec = (compressed: boolean): WalletSpec => ({
  type: 'privateKey',
  format: AddressFormat.P2PKH,
  secret: JSON.stringify({ wif: encodeWIF(WIKI_PRIVATE_KEY, compressed), hex: WIKI_PRIVATE_KEY, compressed }),
  previewAddress: getAddressFromPrivateKey(WIKI_PRIVATE_KEY, AddressFormat.P2PKH, compressed),
});
const hardwarePublicKey = bytesToHex(getPublicKey(hexToBytes(HARDWARE_PRIVATE_KEY), true));

/** Every wallet the signing suites exercise, all in one vault. */
export const WALLET_SPECS: Record<WalletKey, WalletSpec> = {
  p2pkh: mnemonicSpec(BIP39_MNEMONIC, AddressFormat.P2PKH),
  p2shP2wpkh: mnemonicSpec(BIP39_MNEMONIC, AddressFormat.P2SH_P2WPKH),
  p2wpkh: mnemonicSpec(BIP39_MNEMONIC, AddressFormat.P2WPKH),
  p2tr: mnemonicSpec(BIP39_MNEMONIC, AddressFormat.P2TR),
  counterwallet: mnemonicSpec(COUNTERWALLET_MNEMONIC, AddressFormat.Counterwallet),
  counterwalletSegwit: mnemonicSpec(COUNTERWALLET_MNEMONIC, AddressFormat.CounterwalletSegwit),
  freewallet: mnemonicSpec(BIP39_MNEMONIC, AddressFormat.FreewalletBIP39),
  freewalletSegwit: mnemonicSpec(BIP39_MNEMONIC, AddressFormat.FreewalletBIP39Segwit),
  privateKeyCompressed: privateKeySpec(true),
  privateKeyUncompressed: privateKeySpec(false),
  trezor: {
    type: 'hardware',
    format: AddressFormat.P2WPKH,
    secret: JSON.stringify({
      deviceType: 'trezor', publicKey: hardwarePublicKey, derivationPath: HARDWARE_PATH, accountIndex: 0, usePassphrase: false,
    }),
    previewAddress: p2wpkh(hexToBytes(hardwarePublicKey)).address!,
  },
};

/** A stable, valid (64 hex) wallet id per fixture wallet. */
export const walletId = (key: WalletKey): string => bytesToHex(sha256(utf8ToBytes(`signing-golden:${key}`)));

/** The encrypted vault holding every fixture wallet, P2WPKH active. */
export async function buildKeychainRecord(): Promise<KeychainRecord> {
  const salt = new Uint8Array(16).fill(7);
  const key = await deriveKey(PASSWORD, salt, ITERATIONS);
  const wallets: WalletRecord[] = [];
  for (const [name, spec] of Object.entries(WALLET_SPECS) as [WalletKey, WalletSpec][]) {
    wallets.push({
      id: walletId(name), name, type: spec.type, addressFormat: spec.format, addressCount: 1,
      encryptedSecret: await encryptWithKey(spec.secret, key), previewAddress: spec.previewAddress, createdAt: 1,
    });
  }
  return encryptKeychainRecord(
    { version: 1, wallets, settings: { ...DEFAULT_SETTINGS, lastActiveWalletId: walletId('p2wpkh') } },
    key, bufferToBase64(salt), ITERATIONS,
  );
}

/** Session storage backed by a variable, with an optional one-shot barrier on the next read. */
export function installChromeSession(onGet?: () => Promise<void>): void {
  let metadata: SessionMetadata | undefined;
  globalThis.chrome = {
    ...globalThis.chrome,
    alarms: { create: async () => {}, clear: async () => true },
    storage: { session: {
      get: async () => {
        await onGet?.();
        return { sessionMetadata: metadata ? { ...metadata } : undefined };
      },
      set: async (data: { sessionMetadata: SessionMetadata }) => { metadata = { ...data.sessionMetadata }; },
      remove: async () => { metadata = undefined; },
    } },
  } as unknown as typeof chrome;
}

export interface Barrier {
  entered: Promise<void>;
  released: Promise<void>;
  enter: () => void;
  release: () => void;
}
export function barrier(): Barrier {
  let enter = () => {};
  let release = () => {};
  return {
    entered: new Promise<void>(resolve => { enter = resolve; }),
    released: new Promise<void>(resolve => { release = resolve; }),
    enter: () => enter(),
    release: () => release(),
  };
}

/** The scriptPubKey an address commits to. */
export const scriptOf = (address: string): Uint8Array => OutScript.encode(BtcAddress().decode(address));

/** Payee of every fixture spend: P2WPKH of private key 0x00...02. */
export const RECIPIENT = p2wpkh(getPublicKey(hexToBytes('02'.padStart(64, '0')), true));

/**
 * One fixed spend from `address`: a parent paying it 100 000 and 50 000 sats (outputs 0 and 1),
 * and a child spending both to RECIPIENT (120 000) with change back (29 000), fee 1 000.
 * Version 2, lock time 0, sequence 0xfffffffd on both inputs.
 */
export function spendFixture(address: string) {
  const script = scriptOf(address);
  const parent = new Transaction({ version: 2, allowUnknownOutputs: true });
  parent.addInput({ txid: 'aa'.repeat(32), index: 0, sequence: 0xffffffff });
  parent.addOutput({ script, amount: 100_000n });
  parent.addOutput({ script, amount: 50_000n });
  const values = [100_000n, 50_000n];

  const build = (utxo: 'witness' | 'nonWitness' | 'none') => {
    const tx = new Transaction({ version: 2, lockTime: 0, allowUnknownOutputs: true });
    values.forEach((amount, index) => {
      tx.addInput({
        txid: parent.id, index, sequence: 0xfffffffd,
        ...(utxo === 'witness' ? { witnessUtxo: { script, amount } } : {}),
        ...(utxo === 'nonWitness' ? { nonWitnessUtxo: parent.unsignedTx } : {}),
      });
    });
    tx.addOutput({ script: RECIPIENT.script, amount: 120_000n });
    tx.addOutput({ script, amount: 29_000n });
    return tx;
  };

  const utxos: UTXO[] = values.map((value, vout) => ({
    txid: parent.id, vout, value: Number(value),
    status: { confirmed: true, block_height: 800_000, block_hash: '00'.repeat(32), block_time: 1_700_000_000 },
  }));
  return {
    script,
    scriptHex: bytesToHex(script),
    parentTxid: parent.id,
    parentHex: bytesToHex(parent.unsignedTx),
    utxos,
    /** The reviewed unsigned transaction signTransaction receives. */
    rawTx: bytesToHex(build('none').unsignedTx),
    inputValues: values.map(Number),
    lockScripts: values.map(() => bytesToHex(script)),
    /** A PSBT whose inputs carry only witnessUtxo, so prevout verification fetches the parent. */
    witnessPsbt: bytesToHex(build('witness').toPSBT()),
    /** A PSBT whose inputs carry the full parent, as legacy inputs must. */
    nonWitnessPsbt: bytesToHex(build('nonWitness').toPSBT()),
    /** The witnessUtxo-only PSBT with no metadata, as a compose API returns it. */
    barePsbt: bytesToHex(build('none').toPSBT()),
  };
}
export type SpendFixture = ReturnType<typeof spendFixture>;
