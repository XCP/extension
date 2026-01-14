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
 * Checks if a keychain exists in storage.
 */
export async function hasKeychain(): Promise<boolean> {
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
