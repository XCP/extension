/**
 * Key-Based Encryption - Shared AES-GCM encryption utilities
 *
 * Provides key-based encryption/decryption for both settings and wallet vault.
 * Keys are derived once from password via PBKDF2, then stored in session.
 *
 * Used by:
 * - settings.ts: encrypts/decrypts application settings
 * - walletManager.ts: encrypts/decrypts wallet vault and secrets
 */

import { bufferToBase64, base64ToBuffer, generateRandomBytes, combineBuffers } from './buffer';

// Crypto constants (shared with settings.ts)
const IV_BYTES = 12;
const KEY_BITS = 256;
const GCM_TAG_BYTES = 16;
const GCM_TAG_LENGTH = 128; // bits
const PBKDF2_ITERATIONS = 600_000;

// Minimum size: IV (12) + at least 1 byte ciphertext + GCM tag (16) = 29 bytes
const MIN_ENCRYPTED_SIZE = IV_BYTES + 1 + GCM_TAG_BYTES;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derives an encryption key from password and salt using PBKDF2.
 * Key is extractable so it can be exported to session storage.
 *
 * @param password - User password
 * @param salt - Random salt (16 bytes recommended)
 * @param iterations - PBKDF2 iterations (defaults to 600K)
 * @returns Extractable CryptoKey for AES-GCM
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: KEY_BITS },
    true, // extractable - needed for session storage
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to base64 string for session storage.
 *
 * @param key - The CryptoKey to export
 * @returns Base64-encoded raw key bytes
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(exported);
}

/**
 * Imports a CryptoKey from base64 string (from session storage).
 *
 * @param keyBase64 - Base64-encoded raw key bytes
 * @returns CryptoKey for AES-GCM encryption/decryption
 */
export async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyBytes = base64ToBuffer(keyBase64);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: KEY_BITS },
    false, // not extractable after import (security)
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string using AES-GCM with the provided key.
 * Output format: base64(IV + ciphertext)
 *
 * @param data - The plaintext string to encrypt
 * @param key - The AES-GCM CryptoKey
 * @returns Base64-encoded IV + ciphertext
 */
export async function encryptWithKey(data: string, key: CryptoKey): Promise<string> {
  const iv = generateRandomBytes(IV_BYTES);
  const plaintext = encoder.encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: GCM_TAG_LENGTH },
    key,
    plaintext
  );

  // Combine IV + ciphertext
  const combined = combineBuffers(iv, new Uint8Array(ciphertext));
  return bufferToBase64(combined);
}

/**
 * Decrypts a string using AES-GCM with the provided key.
 * Input format: base64(IV + ciphertext)
 *
 * Uses timing attack mitigations for consistency with wallet encryption.
 *
 * @param encrypted - Base64-encoded IV + ciphertext
 * @param key - The AES-GCM CryptoKey
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails
 */
export async function decryptWithKey(encrypted: string, key: CryptoKey): Promise<string> {
  let combined: Uint8Array;
  try {
    combined = base64ToBuffer(encrypted);
  } catch {
    throw new Error('Failed to decrypt: invalid format');
  }

  // Validate minimum size before processing
  if (combined.byteLength < MIN_ENCRYPTED_SIZE) {
    throw new Error('Failed to decrypt: invalid format');
  }

  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  // Always attempt decryption and capture result
  let decryptedBuffer: ArrayBuffer | null = null;
  let decryptionError: Error | null = null;

  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: GCM_TAG_LENGTH },
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
    throw new Error('Failed to decrypt: invalid password or corrupted data');
  }

  return decoder.decode(decryptedBuffer);
}

/**
 * Encrypts a JSON-serializable object using AES-GCM.
 *
 * @param obj - The object to encrypt
 * @param key - The AES-GCM CryptoKey
 * @returns Base64-encoded encrypted data
 */
export async function encryptJsonWithKey<T>(obj: T, key: CryptoKey): Promise<string> {
  const json = JSON.stringify(obj);
  return encryptWithKey(json, key);
}

/**
 * Decrypts and parses a JSON object using AES-GCM.
 *
 * @param encrypted - Base64-encoded encrypted data
 * @param key - The AES-GCM CryptoKey
 * @returns The decrypted and parsed object
 * @throws Error if decryption or JSON parsing fails
 */
export async function decryptJsonWithKey<T>(encrypted: string, key: CryptoKey): Promise<T> {
  const json = await decryptWithKey(encrypted, key);

  // Parse JSON with error handling to avoid leaking decrypted content in error messages
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('Failed to decrypt: invalid data format');
  }
}

/**
 * Default PBKDF2 iterations for key derivation.
 * Exported for use by callers who need to store KDF params.
 */
export const DEFAULT_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS;

// ============================================================================
// Web Worker Key Derivation (Non-blocking)
// ============================================================================

/** Singleton worker instance */
let kdfWorker: Worker | null = null;

/**
 * Gets or creates the KDF worker instance.
 * Returns null if workers are not available (e.g., in tests).
 */
function getKdfWorker(): Worker | null {
  if (kdfWorker) return kdfWorker;

  try {
    // Vite handles the worker bundling with this syntax
    kdfWorker = new Worker(new URL('./kdf-worker.ts', import.meta.url), {
      type: 'module',
    });
    return kdfWorker;
  } catch {
    // Workers not available (tests, unsupported environment)
    return null;
  }
}

interface WorkerResponse {
  success: boolean;
  keyBase64?: string;
  error?: string;
}

/**
 * Derives an encryption key using a Web Worker (non-blocking).
 * Falls back to main thread if workers are unavailable.
 *
 * This is cryptographically identical to deriveKey() - just runs off main thread
 * to keep UI responsive during the ~1-2 second key derivation.
 *
 * @param password - User password
 * @param salt - Random salt (16 bytes recommended)
 * @param iterations - PBKDF2 iterations (defaults to 600K)
 * @returns Extractable CryptoKey for AES-GCM
 */
export async function deriveKeyAsync(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const worker = getKdfWorker();

  // Fallback to main thread if no worker
  if (!worker) {
    return deriveKey(password, salt, iterations);
  }

  const saltBase64 = bufferToBase64(salt);

  return new Promise((resolve, reject) => {
    const handleMessage = async (e: MessageEvent<WorkerResponse>) => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);

      if (e.data.success && e.data.keyBase64) {
        try {
          const key = await importKey(e.data.keyBase64);
          // Re-import as extractable for session storage
          const exported = await crypto.subtle.exportKey('raw', key);
          const extractableKey = await crypto.subtle.importKey(
            'raw',
            exported,
            { name: 'AES-GCM', length: KEY_BITS },
            true, // extractable
            ['encrypt', 'decrypt']
          );
          resolve(extractableKey);
        } catch (err) {
          reject(new Error('Failed to import derived key'));
        }
      } else {
        reject(new Error(e.data.error || 'Key derivation failed'));
      }
    };

    const handleError = (e: ErrorEvent) => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      reject(new Error(`Worker error: ${e.message}`));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    worker.postMessage({ password, salt: saltBase64, iterations });
  });
}
