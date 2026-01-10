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
 */
export function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates cryptographically random bytes.
 * Returns Uint8Array<ArrayBuffer> for Web Crypto API compatibility.
 */
export function generateRandomBytes(length: number): Uint8Array<ArrayBuffer> {
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
