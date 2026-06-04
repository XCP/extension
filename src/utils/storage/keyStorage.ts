/**
 * Storage for the keychain master key (session storage).
 *
 * Derived from the password via PBKDF2 and cached in session storage to survive
 * service worker restarts: derived once on unlock, cleared on lock/browser
 * close. Salt is stored inside the encrypted keychain record, not separately.
 */

import { storage } from '#imports';

/**
 * Keychain master key - cached in session storage.
 * Used to decrypt keychain and individual wallet secrets.
 * Cleared when browser closes or keychain locks.
 */
const keychainMasterKeyItem = storage.defineItem<string | null>('session:keychainMasterKey', {
  fallback: null,
});

// ============================================================================
// Keychain Master Key Storage
// ============================================================================

/**
 * Gets the cached keychain master key from session storage.
 * Returns null if no key is cached (keychain locked).
 */
export async function getCachedKeychainMasterKey(): Promise<string | null> {
  try {
    return await keychainMasterKeyItem.getValue();
  } catch (err) {
    console.error('Failed to get cached keychain master key:', err);
    return null;
  }
}

/**
 * Stores the keychain master key in session storage.
 * Key is automatically cleared when browser closes.
 */
export async function setCachedKeychainMasterKey(keyBase64: string): Promise<void> {
  try {
    await keychainMasterKeyItem.setValue(keyBase64);
  } catch (err) {
    console.error('Failed to cache keychain master key:', err);
    throw new Error('Failed to cache keychain master key');
  }
}

/**
 * Clears the cached keychain master key from session storage.
 * Call this during keychain lock.
 */
export async function clearCachedKeychainMasterKey(): Promise<void> {
  try {
    await keychainMasterKeyItem.removeValue();
  } catch (err) {
    console.error('Failed to clear cached keychain master key:', err);
    throw new Error('Failed to clear cached keychain master key');
  }
}

