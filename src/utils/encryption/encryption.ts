/**
 * Encryption version. Increment if the scheme changes.
 */
const ENCRYPTION_VERSION = 1;

/**
 * Cryptographic constants.
 */
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const PBKDF2_ITERATIONS = 420_690;

/**
 * A constant authentication message used for generating and verifying HMAC.
 */
const AUTH_MESSAGE = 'authentication message';

/**
 * Reusable encoder and decoder for UTF-8.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Custom error class for decryption errors.
 */
export class DecryptionError extends Error {
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
 * @param password - The password to use.
 * @returns A Promise that resolves to a JSON string containing the encrypted payload.
 * @throws Error if the password is empty.
 */
export async function encryptString(
  plaintext: string,
  password: string
): Promise<string> {
  if (!password) {
    throw new Error('Password cannot be empty');
  }

  // Convert plaintext to bytes.
  const data = encoder.encode(plaintext);

  // Generate random salts and IV.
  const encryptionSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const authSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  // Derive keys.
  const masterKey = await deriveMasterKey(password, encryptionSalt, PBKDF2_ITERATIONS);
  const encryptionKey = await deriveEncryptionKey(masterKey, encryptionSalt);
  const authKey = await deriveAuthenticationKey(masterKey, authSalt);

  // Encrypt data with AES-GCM.
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    encryptionKey,
    data
  );

  // Sign the static authentication message.
  const authMessageBytes = encoder.encode(AUTH_MESSAGE);
  const signatureBuffer = await crypto.subtle.sign('HMAC', authKey, authMessageBytes);
  const authSignature = bufferToBase64(new Uint8Array(signatureBuffer));

  // Combine salts, IV, and ciphertext into one blob.
  const combinedLength =
    encryptionSalt.length + authSalt.length + iv.length + encryptedBuffer.byteLength;
  const combined = new Uint8Array(combinedLength);
  let offset = 0;
  combined.set(encryptionSalt, offset);
  offset += encryptionSalt.length;
  combined.set(authSalt, offset);
  offset += authSalt.length;
  combined.set(iv, offset);
  offset += iv.length;
  combined.set(new Uint8Array(encryptedBuffer), offset);

  const payload: EncryptedPayload = {
    version: ENCRYPTION_VERSION,
    iterations: PBKDF2_ITERATIONS,
    encryptedData: bufferToBase64(combined),
    authSignature,
  };

  return JSON.stringify(payload);
}

/**
 * Decrypts a JSON-encoded encrypted payload produced by encryptString().
 *
 * @param encryptedJson - The JSON payload as a string.
 * @param password - The password for decryption.
 * @returns A Promise that resolves to the decrypted plaintext string.
 * @throws DecryptionError if the payload is invalid, the version is unsupported, or decryption fails.
 */
export async function decryptString(
  encryptedJson: string,
  password: string
): Promise<string> {
  if (!password) {
    throw new DecryptionError('Password cannot be empty');
  }

  let parsed: EncryptedPayload;
  try {
    parsed = JSON.parse(encryptedJson);
  } catch {
    throw new DecryptionError('Invalid encrypted payload (not valid JSON)');
  }

  if (parsed.version !== ENCRYPTION_VERSION) {
    throw new DecryptionError('Unsupported encryption version');
  }

  // Decode the combined binary blob.
  const combined = new Uint8Array(base64ToBuffer(parsed.encryptedData));
  if (combined.length < SALT_BYTES * 2 + IV_BYTES) {
    throw new DecryptionError('Invalid encrypted payload (incomplete data)');
  }

  const encryptionSalt = combined.slice(0, SALT_BYTES);
  const authSalt = combined.slice(SALT_BYTES, 2 * SALT_BYTES);
  const iv = combined.slice(2 * SALT_BYTES, 2 * SALT_BYTES + IV_BYTES);
  const ciphertext = combined.slice(2 * SALT_BYTES + IV_BYTES);

  try {
    // Derive keys using the stored iteration count.
    const masterKey = await deriveMasterKey(password, encryptionSalt, parsed.iterations);
    const encryptionKey = await deriveEncryptionKey(masterKey, encryptionSalt);
    const authKey = await deriveAuthenticationKey(masterKey, authSalt);

    // Verify the HMAC signature.
    const authMessageBytes = encoder.encode(AUTH_MESSAGE);
    const valid = await crypto.subtle.verify(
      'HMAC',
      authKey,
      base64ToBuffer(parsed.authSignature),
      authMessageBytes
    );
    if (!valid) {
      throw new DecryptionError('Invalid password or corrupted data');
    }

    // Decrypt the ciphertext.
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      encryptionKey,
      ciphertext
    );
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error('Decryption failed:', err);
    if (err instanceof DecryptionError) {
      throw err;
    }
    throw new DecryptionError('Failed to decrypt data');
  }
}

/**
 * Derives a master key from a password and salt using PBKDF2, then imports it as an HKDF key.
 *
 * @param password - The user's password.
 * @param salt - The salt as a Uint8Array.
 * @param iterations - The PBKDF2 iteration count.
 * @returns A Promise that resolves to a CryptoKey usable for HKDF.
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
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_BITS
  );

  return crypto.subtle.importKey('raw', derivedBits, 'HKDF', false, ['deriveKey']);
}

/**
 * Derives an AES-GCM key for encryption/decryption using HKDF.
 *
 * @param masterKey - The HKDF master key.
 * @param salt - The salt for this derivation.
 * @returns A Promise that resolves to an AES-GCM CryptoKey.
 */
async function deriveEncryptionKey(
  masterKey: CryptoKey,
  salt: Uint8Array
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode('encryption'),
    },
    masterKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives an HMAC key for authentication using HKDF.
 *
 * @param masterKey - The HKDF master key.
 * @param salt - The salt for this derivation.
 * @returns A Promise that resolves to an HMAC CryptoKey.
 */
async function deriveAuthenticationKey(
  masterKey: CryptoKey,
  salt: Uint8Array
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode('authentication'),
    },
    masterKey,
    { name: 'HMAC', hash: 'SHA-256', length: KEY_BITS },
    true,
    ['sign', 'verify']
  );
}

/**
 * Converts an ArrayBuffer (or TypedArray buffer) to a Base64-encoded string.
 *
 * @param buffer - The buffer to encode.
 * @returns A Base64 string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  // Use String.fromCharCode with spread operator in chunks to avoid call stack limits.
  const bytes = new Uint8Array(buffer);
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
 * @param base64 - The Base64 string.
 * @returns An ArrayBuffer.
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
