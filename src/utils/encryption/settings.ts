/**
 * Encryption for application settings.
 *
 * Uses AES-GCM with a key derived from the user's password.
 * The derived key is stored in session storage after unlock,
 * allowing settings to be encrypted/decrypted without re-entering password.
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

const SETTINGS_KEY = 'settingsEncryptionKey';
const IV_BYTES = 12;
const KEY_BITS = 256;
const PBKDF2_ITERATIONS = 600_000;
const SALT = 'xcp-wallet-settings-v2';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derives an encryption key from password and stores it in session.
 * Call this during wallet unlock.
 */
export async function initializeSettingsKey(password: string): Promise<void> {
  const salt = encoder.encode(SALT);

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: KEY_BITS },
    true, // extractable so we can export it
    ['encrypt', 'decrypt']
  );

  // Export and store the key in session storage
  const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
  const keyBase64 = bufferToBase64(exportedKey);

  await chrome.storage.session.set({ [SETTINGS_KEY]: keyBase64 });
}

/**
 * Clears the settings encryption key from session.
 * Call this during wallet lock.
 */
export async function clearSettingsKey(): Promise<void> {
  await chrome.storage.session.remove(SETTINGS_KEY);
}

/**
 * Gets the encryption key from session storage.
 * Returns null if not initialized (wallet locked).
 */
async function getKeyFromSession(): Promise<CryptoKey | null> {
  const result = await chrome.storage.session.get(SETTINGS_KEY);
  const keyBase64 = result[SETTINGS_KEY] as string | undefined;

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
  const result = await chrome.storage.session.get(SETTINGS_KEY);
  return !!result[SETTINGS_KEY];
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

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
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
 */
export async function decryptSettings(encrypted: string): Promise<AppSettings> {
  const key = await getKeyFromSession();
  if (!key) {
    throw new Error('Settings key not initialized. Wallet must be unlocked.');
  }

  const combined = base64ToBuffer(encrypted);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Failed to decrypt settings');
  }
}

/**
 * Decrypts settings using a password directly.
 * Used during password change to re-encrypt with new password.
 */
export async function decryptSettingsWithPassword(
  encrypted: string,
  password: string
): Promise<AppSettings> {
  const salt = encoder.encode(SALT);

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['decrypt']
  );

  const combined = base64ToBuffer(encrypted);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      ciphertext
    );

    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Failed to decrypt settings');
  }
}

/**
 * Encrypts settings using a password directly.
 * Used during password change to re-encrypt with new password.
 */
export async function encryptSettingsWithPassword(
  settings: AppSettings,
  password: string
): Promise<string> {
  const salt = encoder.encode(SALT);

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
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

// Helper functions
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}
