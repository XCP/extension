/**
 * Wallet Encryption
 *
 * Provides AES-256-GCM encryption for wallet data with PBKDF2 key derivation.
 * Uses Web Crypto API for all cryptographic operations.
 *
 * Security properties:
 * - 600,000 PBKDF2 iterations for key derivation
 * - Random salt and IV per encryption
 * - Authentication via GCM mode
 */

import { bufferToBase64, base64ToBuffer, combineBuffers, generateRandomBytes } from './buffer';

/**
 * Encryption version. Increment if the scheme changes.
 * v1: Original format with separate authSalt
 * v2: Simplified format - single salt for PBKDF2, empty salt for HKDF
 */
const ENCRYPTION_VERSION = 2;

/**
 * Cryptographic configuration constants.
 */
const CRYPTO_CONFIG = {
  SALT_BYTES: 16,
  IV_BYTES: 12,
  KEY_BITS: 256,
  PBKDF2_ITERATIONS: 600_000, // Reasonable security vs performance tradeoff
  AUTH_MESSAGE: 'authentication message for wallet encryption',
  TAG_LENGTH: 128,
};

/**
 * Reusable encoder and decoder for UTF-8.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Custom error class for decryption errors.
 */
export class DecryptionError extends Error {
  /**
   * Creates a new DecryptionError instance.
   * @param message - The error message describing the decryption failure.
   */
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Interface for the JSON payload returned by encryptString().
 */
interface EncryptedPayload {
  version: number;
  iterations: number;
  encryptedData: string; // Base64-encoded combined blob.
  authSignature: string; // Base64-encoded HMAC signature.
}

/**
 * Encrypts an arbitrary plaintext string with a password.
 *
 * @param plaintext - The text to encrypt.
 * @param password - The password to use for encryption.
 * @returns A Promise that resolves to a JSON string containing the encrypted payload.
 * @throws {Error} If the password or plaintext is empty.
 */
export async function encryptString(
  plaintext: string,
  password: string
): Promise<string> {
  if (!password) throw new Error('Password cannot be empty');
  if (!plaintext) throw new Error('Plaintext cannot be empty');

  const data = encoder.encode(plaintext);
  const salt = generateRandomBytes(CRYPTO_CONFIG.SALT_BYTES);
  const iv = generateRandomBytes(CRYPTO_CONFIG.IV_BYTES);

  const masterKey = await deriveMasterKey(password, salt, CRYPTO_CONFIG.PBKDF2_ITERATIONS);
  const encryptionKey = await deriveEncryptionKey(masterKey);
  const authKey = await deriveAuthenticationKey(masterKey);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: CRYPTO_CONFIG.TAG_LENGTH },
    encryptionKey,
    data
  );

  const authMessageBytes = encoder.encode(CRYPTO_CONFIG.AUTH_MESSAGE);
  const signatureBuffer = await crypto.subtle.sign('HMAC', authKey, authMessageBytes);
  const authSignature = bufferToBase64(signatureBuffer);

  // Format: salt (16 bytes) + iv (12 bytes) + ciphertext
  const combined = combineBuffers(salt, iv, new Uint8Array(encryptedBuffer));
  const payload: EncryptedPayload = {
    version: ENCRYPTION_VERSION,
    iterations: CRYPTO_CONFIG.PBKDF2_ITERATIONS,
    encryptedData: bufferToBase64(combined),
    authSignature,
  };

  return JSON.stringify(payload);
}

/**
 * Decrypts a JSON-encoded encrypted payload produced by encryptString().
 *
 * @param encryptedJson - The JSON payload as a string, containing encrypted data and metadata.
 * @param password - The password used for decryption.
 * @returns A Promise that resolves to the decrypted plaintext string.
 * @throws {DecryptionError} If the payload is invalid, the version is unsupported, or decryption fails.
 */
export async function decryptString(
  encryptedJson: string,
  password: string
): Promise<string> {
  if (!password) throw new DecryptionError('Password cannot be empty');
  if (!encryptedJson) throw new DecryptionError('Encrypted payload cannot be empty');

  let parsed: EncryptedPayload;
  try {
    parsed = JSON.parse(encryptedJson);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new DecryptionError(`Invalid encrypted payload (not valid JSON): ${errorMessage}`);
  }

  if (parsed.version !== ENCRYPTION_VERSION) {
    throw new DecryptionError(`Unsupported encryption version: ${parsed.version}`);
  }

  // Validate iterations to prevent cryptic errors from invalid payload
  if (
    typeof parsed.iterations !== 'number' ||
    !Number.isInteger(parsed.iterations) ||
    parsed.iterations < 1
  ) {
    throw new DecryptionError('Invalid encrypted payload (invalid iterations)');
  }

  let combined: Uint8Array;
  try {
    combined = base64ToBuffer(parsed.encryptedData);
  } catch {
    throw new DecryptionError('Invalid encrypted payload (invalid format)');
  }
  // Minimum size: salt (16) + iv (12) + at least 1 byte ciphertext + GCM tag (16)
  if (combined.byteLength < CRYPTO_CONFIG.SALT_BYTES + CRYPTO_CONFIG.IV_BYTES + 17) {
    throw new DecryptionError('Invalid encrypted payload (incomplete data)');
  }

  // Format: salt (16 bytes) + iv (12 bytes) + ciphertext
  const salt = new Uint8Array(combined.slice(0, CRYPTO_CONFIG.SALT_BYTES));
  const iv = new Uint8Array(combined.slice(CRYPTO_CONFIG.SALT_BYTES, CRYPTO_CONFIG.SALT_BYTES + CRYPTO_CONFIG.IV_BYTES));
  const ciphertext = new Uint8Array(combined.slice(CRYPTO_CONFIG.SALT_BYTES + CRYPTO_CONFIG.IV_BYTES));

  try {
    // Always perform all crypto operations to prevent timing attacks
    const masterKey = await deriveMasterKey(password, salt, parsed.iterations);
    const encryptionKey = await deriveEncryptionKey(masterKey);
    const authKey = await deriveAuthenticationKey(masterKey);

    const authMessageBytes = encoder.encode(CRYPTO_CONFIG.AUTH_MESSAGE);
    const valid = await crypto.subtle.verify(
      'HMAC',
      authKey,
      base64ToBuffer(parsed.authSignature),
      authMessageBytes
    );
    
    // Always attempt decryption to maintain constant timing
    let decryptedBuffer: ArrayBuffer | null = null;
    let decryptionError: Error | null = null;
    
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: CRYPTO_CONFIG.TAG_LENGTH },
        encryptionKey,
        ciphertext
      );
    } catch (err) {
      decryptionError = err instanceof Error ? err : new Error(String(err));
    }
    
    // Add small random delay to mask any remaining timing differences
    const randomDelay = crypto.getRandomValues(new Uint8Array(1))[0] / 255 * 10; // 0-10ms
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    // Check validation after all operations complete
    if (!valid || decryptionError || !decryptedBuffer) {
      throw new DecryptionError('Invalid password or corrupted data');
    }

    return decoder.decode(decryptedBuffer);
  } catch (err) {
    // Don't log or expose internal crypto error details - could leak information
    // All decryption failures surface as the same generic message
    if (err instanceof DecryptionError) {
      throw err; // Re-throw our own errors (already sanitized)
    }
    throw new DecryptionError('Invalid password or corrupted data');
  }
}

/**
 * Derives a master key from a password and salt using PBKDF2, then imports it as an HKDF key.
 *
 * @param password - The user's password to derive the key from.
 * @param salt - The salt as a Uint8Array for PBKDF2.
 * @param iterations - The number of PBKDF2 iterations to perform.
 * @returns A Promise that resolves to a CryptoKey usable for HKDF derivation.
 */
async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    passwordKey,
    CRYPTO_CONFIG.KEY_BITS
  );

  return crypto.subtle.importKey('raw', derivedBits, 'HKDF', false, ['deriveKey']);
}

/**
 * Empty salt for HKDF derivation.
 * Since the masterKey from PBKDF2 is already uniformly random,
 * HKDF salt isn't needed for entropy - the 'info' parameter provides domain separation.
 * Using empty salt follows best practice for HKDF when input key material is already random.
 */
const HKDF_EMPTY_SALT = new Uint8Array(0);

/**
 * Derives an AES-GCM key for encryption/decryption using HKDF.
 *
 * @param masterKey - The HKDF master key to derive from (output of PBKDF2).
 * @returns A Promise that resolves to an AES-GCM CryptoKey for encryption and decryption.
 */
async function deriveEncryptionKey(masterKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_EMPTY_SALT, info: encoder.encode('encryption') },
    masterKey,
    { name: 'AES-GCM', length: CRYPTO_CONFIG.KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives an HMAC key for authentication using HKDF.
 *
 * @param masterKey - The HKDF master key to derive from (output of PBKDF2).
 * @returns A Promise that resolves to an HMAC CryptoKey for signing and verification.
 */
async function deriveAuthenticationKey(masterKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_EMPTY_SALT, info: encoder.encode('authentication') },
    masterKey,
    { name: 'HMAC', hash: 'SHA-256', length: CRYPTO_CONFIG.KEY_BITS },
    false, // Non-extractable for security (key is only used for sign/verify)
    ['sign', 'verify']
  );
}

