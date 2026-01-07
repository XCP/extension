/**
 * Encryption for sensitive settings data.
 *
 * Uses AES-GCM with a key derived from the user's password.
 * The derived key is stored in session storage after unlock,
 * allowing settings to be encrypted/decrypted without re-entering password.
 */

const SENSITIVE_SETTINGS_KEY = 'sensitiveSettingsKey';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const PBKDF2_ITERATIONS = 600_000; // Match main encryption

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Sensitive settings that should be encrypted.
 */
export interface SensitiveSettings {
  lastActiveAddress?: string;
  connectedWebsites: string[];
  pinnedAssets: string[];
}

/**
 * Default values for sensitive settings (used when locked).
 */
export const DEFAULT_SENSITIVE_SETTINGS: SensitiveSettings = {
  lastActiveAddress: undefined,
  connectedWebsites: [],
  pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
};

/**
 * Derives an encryption key from password and stores it in session.
 * Call this during wallet unlock.
 */
export async function initializeSensitiveSettingsKey(password: string): Promise<void> {
  // Use a fixed salt for settings (different from wallet encryption)
  // This is acceptable because the password itself provides entropy
  const salt = encoder.encode('xcp-wallet-settings-v1');

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

  await chrome.storage.session.set({ [SENSITIVE_SETTINGS_KEY]: keyBase64 });
}

/**
 * Clears the sensitive settings key from session.
 * Call this during wallet lock.
 */
export async function clearSensitiveSettingsKey(): Promise<void> {
  await chrome.storage.session.remove(SENSITIVE_SETTINGS_KEY);
}

/**
 * Gets the encryption key from session storage.
 * Returns null if not initialized (wallet locked).
 */
async function getKeyFromSession(): Promise<CryptoKey | null> {
  const result = await chrome.storage.session.get(SENSITIVE_SETTINGS_KEY);
  const keyBase64 = result[SENSITIVE_SETTINGS_KEY] as string | undefined;

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
 * Checks if sensitive settings encryption is initialized.
 */
export async function isSensitiveSettingsKeyAvailable(): Promise<boolean> {
  const result = await chrome.storage.session.get(SENSITIVE_SETTINGS_KEY);
  return !!result[SENSITIVE_SETTINGS_KEY];
}

/**
 * Encrypts sensitive settings data.
 * Requires the key to be initialized (wallet unlocked).
 */
export async function encryptSensitiveSettings(settings: SensitiveSettings): Promise<string> {
  const key = await getKeyFromSession();
  if (!key) {
    throw new Error('Sensitive settings key not initialized. Wallet must be unlocked.');
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
 * Decrypts sensitive settings data.
 * Requires the key to be initialized (wallet unlocked).
 */
export async function decryptSensitiveSettings(encrypted: string): Promise<SensitiveSettings> {
  const key = await getKeyFromSession();
  if (!key) {
    throw new Error('Sensitive settings key not initialized. Wallet must be unlocked.');
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
    // Decryption failed - likely wrong password or corrupted data
    throw new Error('Failed to decrypt sensitive settings');
  }
}

/**
 * Decrypts sensitive settings using a password directly.
 * Used during password change to re-encrypt with new password.
 */
export async function decryptSensitiveSettingsWithPassword(
  encrypted: string,
  password: string
): Promise<SensitiveSettings> {
  const salt = encoder.encode('xcp-wallet-settings-v1');

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
    throw new Error('Failed to decrypt sensitive settings');
  }
}

/**
 * Encrypts sensitive settings using a password directly.
 * Used during password change to re-encrypt with new password.
 */
export async function encryptSensitiveSettingsWithPassword(
  settings: SensitiveSettings,
  password: string
): Promise<string> {
  const salt = encoder.encode('xcp-wallet-settings-v1');

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
