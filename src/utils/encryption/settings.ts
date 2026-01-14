/**
 * Settings Encryption
 *
 * Provides encryption/decryption for application settings using AES-GCM.
 * Follows the same pattern as wallet vault encryption:
 * - Master key derived from password via PBKDF2
 * - Salt stored inside the encrypted record (not separately)
 * - Key cached in session storage for service worker restarts
 *
 * ## Pattern (matches wallet)
 *
 * At rest (local storage):
 *   SettingsRecord { version, kdf: { iterations }, salt, encryptedSettings }
 *
 * In session:
 *   session:settingsMasterKey (base64 key bytes)
 */

import type { AppSettings } from '@/utils/storage/settingsStorage';
import {
  getCachedSettingsMasterKey,
  setCachedSettingsMasterKey,
  clearCachedSettingsMasterKey,
  hasSettingsMasterKey,
} from '@/utils/storage/keyStorage';
import {
  deriveKey,
  exportKey,
  importKey,
  encryptJsonWithKey,
  decryptJsonWithKey,
  DEFAULT_PBKDF2_ITERATIONS,
} from './keyBased';
import { base64ToBuffer, generateRandomBytes, bufferToBase64 } from './buffer';

// Re-export for use by settingsStorage
export { DEFAULT_PBKDF2_ITERATIONS };

/**
 * Derives a master key from password and salt.
 * Used both for initial creation and unlock.
 */
export async function deriveSettingsMasterKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  if (!password) {
    throw new Error('Password cannot be empty');
  }
  return deriveKey(password, salt, iterations);
}

/**
 * Generates a new random salt for settings encryption.
 */
export function generateSettingsSalt(): Uint8Array<ArrayBuffer> {
  return generateRandomBytes(16);
}

/**
 * Stores the settings master key in session storage.
 * Call this after deriving the key on unlock.
 */
export async function storeSettingsMasterKey(key: CryptoKey): Promise<void> {
  const keyBase64 = await exportKey(key);
  await setCachedSettingsMasterKey(keyBase64);
}

/**
 * Clears the settings master key from session.
 * Call this during keychain lock.
 */
export async function clearSettingsMasterKey(): Promise<void> {
  await clearCachedSettingsMasterKey();
}

/**
 * Checks if settings master key is available in session.
 */
export async function isSettingsMasterKeyAvailable(): Promise<boolean> {
  return hasSettingsMasterKey();
}

/**
 * Gets the settings master key from session storage.
 * Returns null if not available (keychain locked).
 */
export async function getSettingsMasterKey(): Promise<CryptoKey | null> {
  const keyBase64 = await getCachedSettingsMasterKey();
  if (!keyBase64) return null;

  try {
    return await importKey(keyBase64);
  } catch {
    // Corrupted key in session - treat as not initialized
    return null;
  }
}

/**
 * Encrypts settings using the session master key.
 * Requires key to be initialized (keychain unlocked).
 */
export async function encryptSettings(settings: AppSettings): Promise<string> {
  const key = await getSettingsMasterKey();
  if (!key) {
    throw new Error('Settings master key not initialized. Keychain must be unlocked.');
  }
  return encryptJsonWithKey(settings, key);
}

/**
 * Decrypts settings using the session master key.
 * Requires key to be initialized (keychain unlocked).
 */
export async function decryptSettings(encrypted: string): Promise<AppSettings> {
  const key = await getSettingsMasterKey();
  if (!key) {
    throw new Error('Settings master key not initialized. Keychain must be unlocked.');
  }

  try {
    return await decryptJsonWithKey<AppSettings>(encrypted, key);
  } catch {
    throw new Error('Failed to decrypt settings');
  }
}

/**
 * Encrypts settings with a password directly (derives key internally).
 * Used during password change to re-encrypt with new password.
 */
export async function encryptSettingsWithPassword(
  settings: AppSettings,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<string> {
  const key = await deriveSettingsMasterKey(password, salt, iterations);
  return encryptJsonWithKey(settings, key);
}

/**
 * Decrypts settings with a password directly (derives key internally).
 * Used during password change to decrypt with old password.
 */
export async function decryptSettingsWithPassword(
  encrypted: string,
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<AppSettings> {
  const key = await deriveSettingsMasterKey(password, salt, iterations);

  try {
    return await decryptJsonWithKey<AppSettings>(encrypted, key);
  } catch {
    throw new Error('Failed to decrypt settings');
  }
}

// Re-export buffer utilities for settingsStorage
export { bufferToBase64, base64ToBuffer };
