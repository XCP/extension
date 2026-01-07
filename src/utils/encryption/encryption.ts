/**
 * Encryption version. Increment if the scheme changes.
 */
const ENCRYPTION_VERSION = 1;

/**
 * Cryptographic configuration constants.
 */
const CRYPTO_CONFIG = {
  SALT_BYTES: 16,
  IV_BYTES: 12,
  KEY_BITS: 256,
  PBKDF2_ITERATIONS: 600_000, // OWASP 2024 recommendation for SHA-256
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
  const encryptionSalt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.SALT_BYTES));
  const authSalt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.IV_BYTES));

  const masterKey = await deriveMasterKey(password, encryptionSalt, CRYPTO_CONFIG.PBKDF2_ITERATIONS);
  const encryptionKey = await deriveEncryptionKey(masterKey, encryptionSalt);
  const authKey = await deriveAuthenticationKey(masterKey, authSalt);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: CRYPTO_CONFIG.TAG_LENGTH },
    encryptionKey,
    data
  );

  const authMessageBytes = encoder.encode(CRYPTO_CONFIG.AUTH_MESSAGE);
  const signatureBuffer = await crypto.subtle.sign('HMAC', authKey, authMessageBytes);
  const authSignature = bufferToBase64(signatureBuffer);

  const combined = combineBuffers(encryptionSalt, authSalt, iv, new Uint8Array(encryptedBuffer));
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

  const combined = base64ToBuffer(parsed.encryptedData);
  if (combined.byteLength < CRYPTO_CONFIG.SALT_BYTES * 2 + CRYPTO_CONFIG.IV_BYTES) {
    throw new DecryptionError('Invalid encrypted payload (incomplete data)');
  }

  const encryptionSalt = new Uint8Array(combined.slice(0, CRYPTO_CONFIG.SALT_BYTES));
  const authSalt = new Uint8Array(combined.slice(CRYPTO_CONFIG.SALT_BYTES, 2 * CRYPTO_CONFIG.SALT_BYTES));
  const iv = new Uint8Array(combined.slice(2 * CRYPTO_CONFIG.SALT_BYTES, 2 * CRYPTO_CONFIG.SALT_BYTES + CRYPTO_CONFIG.IV_BYTES));
  const ciphertext = new Uint8Array(combined.slice(2 * CRYPTO_CONFIG.SALT_BYTES + CRYPTO_CONFIG.IV_BYTES));

  try {
    // Always perform all crypto operations to prevent timing attacks
    const masterKey = await deriveMasterKey(password, encryptionSalt, parsed.iterations);
    const encryptionKey = await deriveEncryptionKey(masterKey, encryptionSalt);
    const authKey = await deriveAuthenticationKey(masterKey, authSalt);

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
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    passwordKey,
    CRYPTO_CONFIG.KEY_BITS
  );

  return crypto.subtle.importKey('raw', derivedBits, 'HKDF', false, ['deriveKey']);
}

/**
 * Derives an AES-GCM key for encryption/decryption using HKDF.
 *
 * @param masterKey - The HKDF master key to derive from.
 * @param salt - The salt for HKDF derivation.
 * @returns A Promise that resolves to an AES-GCM CryptoKey for encryption and decryption.
 */
async function deriveEncryptionKey(masterKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, info: encoder.encode('encryption') },
    masterKey,
    { name: 'AES-GCM', length: CRYPTO_CONFIG.KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives an HMAC key for authentication using HKDF.
 *
 * @param masterKey - The HKDF master key to derive from.
 * @param salt - The salt for HKDF derivation.
 * @returns A Promise that resolves to an HMAC CryptoKey for signing and verification.
 */
async function deriveAuthenticationKey(masterKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, info: encoder.encode('authentication') },
    masterKey,
    { name: 'HMAC', hash: 'SHA-256', length: CRYPTO_CONFIG.KEY_BITS },
    true,
    ['sign', 'verify']
  );
}

/**
 * Combines multiple Uint8Arrays into a single Uint8Array.
 *
 * @param buffers - Variable number of Uint8Array buffers to combine.
 * @returns A single Uint8Array containing all input buffers concatenated in order.
 */
function combineBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

/**
 * Converts an ArrayBuffer (or TypedArray buffer) to a Base64-encoded string.
 *
 * @param buffer - The ArrayBuffer or TypedArray buffer to encode.
 * @returns A Base64-encoded string representation of the buffer.
 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Converts a Base64-encoded string to an ArrayBuffer.
 *
 * @param base64 - The Base64 string to decode.
 * @returns An ArrayBuffer containing the decoded bytes.
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
