/**
 * Keychain encrypt/decrypt for an already-derived master key. KDF derivation
 * stays with the caller so the unlock path can use the off-thread worker.
 */

import { AddressFormat } from '@/core/bitcoin/address';
import { decryptJsonWithKey, encryptJsonWithKey } from '@/core/encryption/encryption';
import { type AppSettings, DEFAULT_SETTINGS, MAX_ORDER_EXPIRATION, VALID_AUTO_LOCK_TIMERS } from '@/core/settings';
import { MAX_ADDRESSES_PER_WALLET, MAX_WALLETS } from '@/core/wallet/constants';
import type { Keychain, KeychainRecord, WalletRecord } from '@/types/wallet';

/** Keychain blob schema version. */
export const KEYCHAIN_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidKeychain(): never {
  // Never include decrypted values in an error message.
  throw new Error('Invalid keychain data');
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function parseSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return invalidKeychain();
  // A field absent from an older keychain gets its current default. An explicitly malformed
  // security setting must fail closed rather than acquire JavaScript's truthiness semantics.
  const settings = { ...DEFAULT_SETTINGS, ...value };
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof defaultValue === 'boolean' || typeof defaultValue === 'string') {
      if (typeof settings[key as keyof typeof settings] !== typeof defaultValue) return invalidKeychain();
    }
  }
  if (!VALID_AUTO_LOCK_TIMERS.some(timer => timer === settings.autoLockTimer) ||
      !['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'cny'].includes(settings.fiat) ||
      !['btc', 'sats', 'fiat'].includes(settings.priceUnit) ||
      !Number.isSafeInteger(settings.defaultOrderExpiration) || settings.defaultOrderExpiration < 0 ||
      settings.defaultOrderExpiration > MAX_ORDER_EXPIRATION ||
      !stringArray(settings.connectedWebsites) || !stringArray(settings.pinnedAssets)) return invalidKeychain();
  for (const key of ['lastActiveWalletId', 'lastActiveAddress', 'defaultPoolSlippage'] as const) {
    if (settings[key] !== undefined && typeof settings[key] !== 'string') return invalidKeychain();
  }
  if (settings.trezorEmulatorMode !== undefined && typeof settings.trezorEmulatorMode !== 'boolean') return invalidKeychain();
  if (settings.version !== undefined && (!Number.isSafeInteger(settings.version) || settings.version < 1)) return invalidKeychain();
  if (settings.providerCapabilities !== undefined) {
    if (!isRecord(settings.providerCapabilities)) return invalidKeychain();
    for (const capability of Object.values(settings.providerCapabilities)) {
      if (!isRecord(capability) ||
          (capability.pairedAddresses !== undefined && typeof capability.pairedAddresses !== 'boolean') ||
          (capability.walletId !== undefined && typeof capability.walletId !== 'string') ||
          (capability.address !== undefined && typeof capability.address !== 'string')) return invalidKeychain();
    }
  }
  return structuredClone(settings);
}

function parseWallet(value: unknown): WalletRecord {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.name !== 'string' || typeof value.previewAddress !== 'string' ||
      typeof value.encryptedSecret !== 'string' || value.encryptedSecret.length === 0 ||
      !['mnemonic', 'privateKey', 'hardware'].some(type => type === value.type) ||
      !Object.values(AddressFormat).some(format => format === value.addressFormat) ||
      typeof value.addressCount !== 'number' || !Number.isSafeInteger(value.addressCount) ||
      value.addressCount < 0 || value.addressCount > MAX_ADDRESSES_PER_WALLET ||
      (value.extraPaths !== undefined && !stringArray(value.extraPaths)) ||
      (value.createdAt !== undefined && (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt))) ||
      (value.isTestOnly !== undefined && typeof value.isTestOnly !== 'boolean')) return invalidKeychain();
  return structuredClone(value) as unknown as WalletRecord;
}

/** Validate the decrypted v1 schema before any wallet/session state is published. */
export function parseKeychain(value: unknown): Keychain {
  if (!isRecord(value)) return invalidKeychain();
  if (value.version !== KEYCHAIN_VERSION) {
    throw new Error(`Unsupported keychain version. Expected: ${KEYCHAIN_VERSION}`);
  }
  if (!Array.isArray(value.wallets) || value.wallets.length > MAX_WALLETS) return invalidKeychain();
  const wallets = value.wallets.map(parseWallet);
  if (new Set(wallets.map(wallet => wallet.id)).size !== wallets.length) return invalidKeychain();
  return { version: KEYCHAIN_VERSION, wallets, settings: parseSettings(value.settings) };
}

/** Encrypt a keychain into a storable record. */
export async function encryptKeychainRecord(
  keychain: Keychain,
  masterKey: CryptoKey,
  salt: string,
  iterations: number,
): Promise<KeychainRecord> {
  const encryptedKeychain = await encryptJsonWithKey(keychain, masterKey);
  return {
    version: KEYCHAIN_VERSION,
    kdf: { iterations },
    salt,
    encryptedKeychain,
  };
}

/** Decrypt a keychain record. */
export async function decryptKeychain(record: KeychainRecord, masterKey: CryptoKey): Promise<Keychain> {
  const decrypted = await decryptJsonWithKey<unknown>(record.encryptedKeychain, masterKey);
  return parseKeychain(decrypted);
}
