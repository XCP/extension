/**
 * Encryption for application settings.
 *
 * Uses AES-GCM with a key derived from the user's password.
 * The derived key is stored in session storage after unlock,
 * allowing settings to be encrypted/decrypted without re-entering password.
 *
 * ## Security Design
 *
 * **Salt Handling**:
 * - Each wallet installation gets a unique random salt (16 bytes)
 * - Salt is stored in local storage (persistent across browser restarts)
 * - Ensures different users with same password get different derived keys
 *
 * ## Session Storage Threat Model
 *
 * **Storage Location**: `chrome.storage.session`
 *
 * **Security Properties**:
 * - Cleared when browser closes (not persisted to disk in most cases)
 * - Not accessible by web pages or other extensions
 * - Isolated per extension
 * - No sync to cloud (unlike chrome.storage.sync)
 *
 * **Threat Mitigations**:
 * - Key is derived with 600K PBKDF2 iterations (brute force resistant)
 * - Session clears on browser close (limits exposure window)
 * - Only encryption key stored, never raw password
 * - Auto-lock timer clears key after inactivity (1-30 min configurable)
 *
 * **Known Limitations** (see ADR-001 in sessionManager.ts):
 * - Chrome may write session storage to disk for hibernation
 * - Compromised browser/extension has full access
 * - These are platform limitations, not fixable at application level
 *
 * **Why Session Storage (not Memory Only)**:
 * - Service worker can restart, losing in-memory state
 * - Session storage survives restarts within browser session
 * - Better UX: user doesn't re-enter password after SW restart
 */

import type { AppSettings } from '@/utils/storage/settingsStorage';
import {
  getSettingsSalt,
  setSettingsSalt,
  getCachedSettingsKey,
  setCachedSettingsKey,
  clearCachedSettingsKey,
  hasSettingsKey,
} from '@/utils/storage/keyStorage';
import { bufferToBase64, base64ToBuffer, generateRandomBytes } from './buffer';

// Crypto constants
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const PBKDF2_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Gets or creates the per-installation random salt.
 * Uses read-after-write pattern to handle race conditions.
 */
async function getOrCreateSalt(): Promise<Uint8Array<ArrayBuffer>> {
  const stored = await getSettingsSalt();

  if (stored) {
    return base64ToBuffer(stored);
  }

  // Generate new random salt
  const salt = generateRandomBytes(SALT_BYTES);
  await setSettingsSalt(bufferToBase64(salt));

  // Read back to handle race condition - always use what's actually stored
  // (another concurrent call may have stored a different salt)
  const verified = await getSettingsSalt();
  return base64ToBuffer(verified!);
}

/**
 * Derives an encryption key from password and salt.
 */
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: KEY_BITS },
    true, // extractable so we can export it
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives an encryption key from password and stores it in session.
 * Call this during wallet unlock.
 */
export async function initializeSettingsKey(password: string): Promise<void> {
  const salt = await getOrCreateSalt();
  const derivedKey = await deriveKey(password, salt);

  // Export and store the key in session storage
  const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
  const keyBase64 = bufferToBase64(exportedKey);

  await setCachedSettingsKey(keyBase64);
}

/**
 * Clears the settings encryption key from session.
 * Call this during wallet lock.
 */
export async function clearSettingsKey(): Promise<void> {
  await clearCachedSettingsKey();
}

/**
 * Gets the encryption key from session storage.
 * Returns null if not initialized (wallet locked).
 */
async function getKeyFromSession(): Promise<CryptoKey | null> {
  const keyBase64 = await getCachedSettingsKey();

  if (!keyBase64) return null;

  const keyBytes = base64ToBuffer(keyBase64);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Checks if settings encryption is initialized.
 */
export async function isSettingsKeyAvailable(): Promise<boolean> {
  return hasSettingsKey();
}

/**
 * Encrypts settings data.
 * Requires the key to be initialized (wallet unlocked).
 */
export async function encryptSettings(settings: AppSettings): Promise<string> {
  const key = await getKeyFromSession();
  if (!key) {
    throw new Error('Settings key not initialized. Wallet must be unlocked.');
  }

  const iv = generateRandomBytes(IV_BYTES);
  const plaintext = encoder.encode(JSON.stringify(settings));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bufferToBase64(combined);
}

/**
 * Decrypts settings data.
 * Requires the key to be initialized (wallet unlocked).
 * Uses timing attack mitigations for consistency with wallet encryption.
 */
export async function decryptSettings(encrypted: string): Promise<AppSettings> {
  const key = await getKeyFromSession();
  if (!key) {
    throw new Error('Settings key not initialized. Wallet must be unlocked.');
  }

  const combined = base64ToBuffer(encrypted);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  // Always attempt decryption and capture result
  let decryptedBuffer: ArrayBuffer | null = null;
  let decryptionError: Error | null = null;

  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  } catch (err) {
    decryptionError = err instanceof Error ? err : new Error(String(err));
  }

  // Add small random delay to mask timing differences
  const randomDelay = crypto.getRandomValues(new Uint8Array(1))[0] / 255 * 10; // 0-10ms
  await new Promise(resolve => setTimeout(resolve, randomDelay));

  if (decryptionError || !decryptedBuffer) {
    throw new Error('Failed to decrypt settings');
  }

  return JSON.parse(decoder.decode(decryptedBuffer));
}

/**
 * Decrypts settings using a password directly.
 * Used during password change to re-encrypt with new password.
 * Uses timing attack mitigations for consistency with wallet encryption.
 */
export async function decryptSettingsWithPassword(
  encrypted: string,
  password: string
): Promise<AppSettings> {
  const salt = await getOrCreateSalt();
  const derivedKey = await deriveKey(password, salt);

  const combined = base64ToBuffer(encrypted);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  // Always attempt decryption and capture result
  let decryptedBuffer: ArrayBuffer | null = null;
  let decryptionError: Error | null = null;

  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      ciphertext
    );
  } catch (err) {
    decryptionError = err instanceof Error ? err : new Error(String(err));
  }

  // Add small random delay to mask timing differences
  const randomDelay = crypto.getRandomValues(new Uint8Array(1))[0] / 255 * 10; // 0-10ms
  await new Promise(resolve => setTimeout(resolve, randomDelay));

  if (decryptionError || !decryptedBuffer) {
    throw new Error('Failed to decrypt settings');
  }

  return JSON.parse(decoder.decode(decryptedBuffer));
}

/**
 * Encrypts settings using a password directly.
 * Used during password change to re-encrypt with new password.
 */
export async function encryptSettingsWithPassword(
  settings: AppSettings,
  password: string
): Promise<string> {
  const salt = await getOrCreateSalt();
  const derivedKey = await deriveKey(password, salt);

  const iv = generateRandomBytes(IV_BYTES);
  const plaintext = encoder.encode(JSON.stringify(settings));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    plaintext
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bufferToBase64(combined);
}
