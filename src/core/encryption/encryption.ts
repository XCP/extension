import { base64ToBuffer, bufferToBase64, combineBuffers, generateRandomBytes } from '@/core/encryption/buffer';

// Crypto constants
const IV_BYTES = 12;
export const AES_KEY_BITS = 256;
const GCM_TAG_BYTES = 16;
const GCM_TAG_LENGTH = 128; // bits
const PBKDF2_ITERATIONS = 600_000;

// Minimum size: IV (12) + GCM tag (16) = 28 bytes (empty plaintext is valid)
const MIN_ENCRYPTED_SIZE = IV_BYTES + GCM_TAG_BYTES;

export const MIN_PASSWORD_LENGTH = 8;
const MIN_ITERATIONS = 500_000;
const MIN_SALT_BYTES = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function validateKeyDerivation(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!salt || salt.byteLength < MIN_SALT_BYTES) {
    throw new Error(`Salt must be at least ${MIN_SALT_BYTES} bytes`);
  }
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${MIN_ITERATIONS}`);
  }
}

/** Extractable so the background can retain the key in session storage. */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  validateKeyDerivation(password, salt, iterations);

  const passwordBytes = encoder.encode(password);
  try {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      passwordBytes as BufferSource,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      passwordKey,
      { name: 'AES-GCM', length: AES_KEY_BITS },
      true, // extractable - needed for session storage
      ['encrypt', 'decrypt']
    );
  } finally {
    passwordBytes.fill(0);
  }
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
    { name: 'AES-GCM', length: AES_KEY_BITS },
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
    { name: 'AES-GCM', iv, tagLength: GCM_TAG_LENGTH },
    key,
    plaintext as BufferSource
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

  // Timing attack mitigation: Add random delay to mask timing differences.
  // Note: This is a basic mitigation suitable for a browser extension where:
  // - The attacker cannot make high-volume automated requests (UI-gated)
  // - AES-GCM provides authenticated encryption with integrity verification
  // - The primary threat is local/disk attackers, not network timing analysis
  // For higher-security applications, constant-time comparison would be preferred.
  const randomDelay = crypto.getRandomValues(new Uint8Array(1))[0]! / 255 * 10; // 0-10ms
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
