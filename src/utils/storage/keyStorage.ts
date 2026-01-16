/**
 * Storage for master keys (session storage).
 *
 * Master keys are derived from password via PBKDF2 and cached in session
 * storage to survive service worker restarts. Both settings and wallet
 * use the same pattern: derive once on unlock, cache until lock/browser close.
 *
 * Salt is stored inside each encrypted record (SettingsRecord, WalletVaultRecord),
 * not separately, for atomic storage operations.
 */

import { storage } from '#imports';

/**
 * Settings master key - cached in session storage.
 * Cleared when browser closes or keychain locks.
 */
const settingsMasterKeyItem = storage.defineItem<string | null>('session:settingsMasterKey', {
  fallback: null,
});

/**
 * Keychain master key - cached in session storage.
 * Used to decrypt keychain and individual wallet secrets.
 * Cleared when browser closes or keychain locks.
 */
const keychainMasterKeyItem = storage.defineItem<string | null>('session:keychainMasterKey', {
  fallback: null,
});

// ============================================================================
// Settings Master Key
// ============================================================================

/**
 * Gets the cached settings master key from session storage.
 * Returns null if no key is cached (keychain locked).
 */
export async function getCachedSettingsMasterKey(): Promise<string | null> {
  try {
    return await settingsMasterKeyItem.getValue();
  } catch (err) {
    console.error('Failed to get cached settings master key:', err);
    return null;
  }
}

/**
 * Stores the settings master key in session storage.
 * Key is automatically cleared when browser closes.
 */
export async function setCachedSettingsMasterKey(keyBase64: string): Promise<void> {
  try {
    await settingsMasterKeyItem.setValue(keyBase64);
  } catch (err) {
    console.error('Failed to cache settings master key:', err);
    throw new Error('Failed to cache settings master key');
  }
}

/**
 * Clears the cached settings master key from session storage.
 * Call this during keychain lock.
 */
export async function clearCachedSettingsMasterKey(): Promise<void> {
  try {
    await settingsMasterKeyItem.removeValue();
  } catch (err) {
    console.error('Failed to clear cached settings master key:', err);
    throw new Error('Failed to clear cached settings master key');
  }
}

/**
 * Checks if a settings master key is currently cached.
 */
export async function hasSettingsMasterKey(): Promise<boolean> {
  const key = await getCachedSettingsMasterKey();
  return key !== null;
}

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

