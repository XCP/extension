/**
 * Buffer Utilities - Base64 encoding and cryptographic byte operations
 *
 * Provides shared utilities for encryption modules:
 * - Base64 encoding/decoding with chunked processing for large buffers
 * - Cryptographically secure random byte generation
 * - Buffer concatenation for building crypto payloads (salt + IV + ciphertext)
 *
 * All functions return Uint8Array<ArrayBuffer> for Web Crypto API compatibility.
 */

/**
 * Converts an ArrayBuffer or Uint8Array to a Base64-encoded string.
 * Uses chunked processing to avoid call stack overflow on large buffers.
 */
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // Process in 32KB chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Converts a Base64-encoded string to a Uint8Array.
 * Returns Uint8Array<ArrayBuffer> for Web Crypto API compatibility.
 *
 * @param base64 - Base64-encoded string to decode
 * @throws Error if input is not a valid non-empty base64 string
 */
export function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  if (typeof base64 !== 'string') {
    throw new Error('Invalid base64 input: expected string');
  }
  if (base64.length === 0) {
    throw new Error('Invalid base64 input: string cannot be empty');
  }

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Invalid base64 input: malformed encoding');
  }

  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Maximum bytes that can be generated (64KB is more than enough for any crypto use case)
const MAX_RANDOM_BYTES = 65536;

/**
 * Generates cryptographically random bytes.
 * Returns Uint8Array<ArrayBuffer> for Web Crypto API compatibility.
 *
 * @param length - Number of bytes to generate (must be 1 to 65536)
 * @throws Error if length is invalid
 */
export function generateRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(length) || length < 1 || length > MAX_RANDOM_BYTES) {
    throw new Error(
      `Invalid length for random bytes: must be integer between 1 and ${MAX_RANDOM_BYTES}`
    );
  }
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Combines multiple Uint8Arrays into a single Uint8Array.
 * Returns Uint8Array<ArrayBuffer> for Web Crypto API compatibility.
 */
export function combineBuffers(...buffers: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const buffer = new ArrayBuffer(totalLength);
  const result = new Uint8Array(buffer);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

/**
 * Encodes a string to Uint8Array<ArrayBuffer> for Web Crypto API compatibility.
 *
 * TextEncoder.encode() returns Uint8Array<ArrayBufferLike>, but Web Crypto APIs
 * require Uint8Array<ArrayBuffer>. This wrapper copies the encoded bytes to a
 * new ArrayBuffer-backed Uint8Array to satisfy the stricter type requirements.
 *
 * Note: This is needed when Trezor packages are installed, as their Solana
 * dependencies include stricter TypeScript type definitions.
 */
export function encodeString(str: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(str);
  const buffer = new ArrayBuffer(encoded.length);
  const result = new Uint8Array(buffer);
  result.set(encoded);
  return result;
}
