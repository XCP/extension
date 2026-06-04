/**
 * Keychain encrypt/decrypt for an already-derived master key. KDF derivation
 * stays with the caller so the unlock path can use the off-thread worker.
 */

import { encryptJsonWithKey, decryptJsonWithKey } from '@/utils/encryption/encryption';
import type { Keychain, KeychainRecord } from '@/types/wallet';

/** Keychain blob schema version. */
export const KEYCHAIN_VERSION = 1;

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
  return decryptJsonWithKey<Keychain>(record.encryptedKeychain, masterKey);
}
