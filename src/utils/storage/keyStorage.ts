/**
 * Storage for encryption keys and salts.
 *
 * Provides Layer 1 abstraction for key material storage,
 * keeping Layer 2 (Encryption) decoupled from chrome.storage APIs.
 *
 * - Salt: Stored in local storage (persistent across browser restarts)
 * - Cached key: Stored in session storage (cleared on browser close)
 */

import { createWriteLock } from './mutex';

const SETTINGS_SALT_KEY = 'settingsEncryptionSalt';
const SETTINGS_KEY = 'settingsEncryptionKey';

// Write lock for salt creation (prevents race conditions)
const withSaltLock = createWriteLock();

/**
 * Gets the settings encryption salt from local storage.
 * Returns null if no salt exists.
 */
export async function getSettingsSalt(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(SETTINGS_SALT_KEY);
    return (result[SETTINGS_SALT_KEY] as string) ?? null;
  } catch (err) {
    console.error('Failed to get settings salt:', err);
    return null;
  }
}

/**
 * Stores the settings encryption salt in local storage.
 * Uses write lock to prevent race conditions during initial creation.
 */
export async function setSettingsSalt(saltBase64: string): Promise<void> {
  return withSaltLock(async () => {
    try {
      await chrome.storage.local.set({ [SETTINGS_SALT_KEY]: saltBase64 });
    } catch (err) {
      console.error('Failed to set settings salt:', err);
      throw new Error('Failed to store settings salt');
    }
  });
}

/**
 * Gets the cached settings encryption key from session storage.
 * Returns null if no key is cached (wallet locked).
 */
export async function getCachedSettingsKey(): Promise<string | null> {
  try {
    const result = await chrome.storage.session.get(SETTINGS_KEY);
    return (result[SETTINGS_KEY] as string) ?? null;
  } catch (err) {
    console.error('Failed to get cached settings key:', err);
    return null;
  }
}

/**
 * Stores the settings encryption key in session storage.
 * Key is automatically cleared when browser closes.
 */
export async function setCachedSettingsKey(keyBase64: string): Promise<void> {
  try {
    await chrome.storage.session.set({ [SETTINGS_KEY]: keyBase64 });
  } catch (err) {
    console.error('Failed to cache settings key:', err);
    throw new Error('Failed to cache settings key');
  }
}

/**
 * Clears the cached settings encryption key from session storage.
 * Call this during wallet lock.
 */
export async function clearCachedSettingsKey(): Promise<void> {
  try {
    await chrome.storage.session.remove(SETTINGS_KEY);
  } catch (err) {
    console.error('Failed to clear cached settings key:', err);
    throw new Error('Failed to clear cached settings key');
  }
}

/**
 * Checks if a settings encryption key is currently cached.
 */
export async function hasSettingsKey(): Promise<boolean> {
  const key = await getCachedSettingsKey();
  return key !== null;
}
