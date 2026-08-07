/**
 * Keychain Storage
 *
 * Stores the encrypted keychain in local storage.
 * The keychain contains all wallet metadata and encrypted secrets.
 */

import { storage } from '#imports';
import type { KeychainRecord } from '@/types/wallet';

/**
 * Storage key for keychain.
 * In test environments, uses a unique key to avoid test interference.
 */
const KEYCHAIN_STORAGE_KEY = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
  ? 'local:keychainRecord_test'
  : 'local:keychainRecord';

const keychainRecordItem = storage.defineItem<KeychainRecord | null>(KEYCHAIN_STORAGE_KEY, {
  fallback: null,
});

/**
 * Validates that a value is a valid KeychainRecord.
 * Returns false for corrupted or schema-incompatible data.
 */
function isValidKeychainRecord(value: unknown): value is KeychainRecord {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.version === 'number' &&
    typeof obj.salt === 'string' &&
    typeof obj.encryptedKeychain === 'string' &&
    obj.kdf !== null &&
    typeof obj.kdf === 'object' &&
    typeof (obj.kdf as Record<string, unknown>).iterations === 'number'
  );
}

/**
 * Retrieves the keychain record from storage.
 * Returns null if no keychain exists or if data is corrupted.
 */
export async function getKeychainRecord(): Promise<KeychainRecord | null> {
  try {
    const record = await keychainRecordItem.getValue();
    if (record && !isValidKeychainRecord(record)) {
      console.error('Keychain record failed validation - corrupted data');
      return null;
    }
    return record;
  } catch (err) {
    console.error('Failed to get keychain record:', err);
    return null;
  }
}

/**
 * Saves the keychain record to storage.
 * Overwrites any existing keychain.
 */
export async function saveKeychainRecord(record: KeychainRecord): Promise<void> {
  try {
    await keychainRecordItem.setValue(record);
  } catch (err) {
    console.error('Failed to save keychain record:', err);
    throw new Error('Failed to save keychain');
  }
}

/**
 * Calls back whenever the stored keychain changes, from this surface or any other.
 *
 * Settings live inside the keychain record, so this fires for a settings change as well as a wallet
 * one — and the record is encrypted, so the change itself says nothing about what moved. It is a
 * signal to re-read, not a source of values. A popup and a side panel are separate documents that
 * each hold their own copy of whatever they loaded on mount, and this is what tells the one that is
 * merely open that the other changed something.
 *
 * @returns An unsubscribe function.
 */
export function watchKeychainRecord(onChange: () => void): () => void {
  return keychainRecordItem.watch(() => onChange());
}

/**
 * Checks if a keychain exists in storage.
 * Used to determine onboarding vs unlock routing.
 */
export async function keychainExists(): Promise<boolean> {
  const keychain = await getKeychainRecord();
  return keychain !== null;
}

/**
 * Deletes the keychain from storage.
 * Used during keychain reset.
 */
export async function deleteKeychain(): Promise<void> {
  try {
    await keychainRecordItem.setValue(null);
  } catch (err) {
    console.error('Failed to delete keychain:', err);
    throw new Error('Failed to delete keychain');
  }
}
