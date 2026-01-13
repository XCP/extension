/**
 * Binary Reading Utilities
 *
 * Provides utilities for reading packed binary data from Counterparty messages.
 * All values are big-endian (network byte order) as used by Python's struct module.
 */

/**
 * Error thrown when binary reading fails
 */
export class BinaryReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinaryReadError';
  }
}

/**
 * Binary reader for Counterparty message payloads.
 * Tracks read position and provides methods for reading various data types.
 */
export class BinaryReader {
  private readonly data: Uint8Array;
  private position: number = 0;

  constructor(data: Uint8Array | ArrayBuffer) {
    this.data = data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  /** Get current read position */
  get offset(): number {
    return this.position;
  }

  /** Get remaining bytes */
  get remaining(): number {
    return this.data.length - this.position;
  }

  /** Get total length */
  get length(): number {
    return this.data.length;
  }

  /** Check if we've reached the end */
  get isEof(): boolean {
    return this.position >= this.data.length;
  }

  /**
   * Read a single byte.
   */
  readUint8(): number {
    if (this.remaining < 1) {
      throw new BinaryReadError('Buffer underflow: cannot read uint8');
    }
    return this.data[this.position++];
  }

  /**
   * Read a 16-bit unsigned integer (big-endian).
   */
  readUint16BE(): number {
    if (this.remaining < 2) {
      throw new BinaryReadError('Buffer underflow: cannot read uint16');
    }
    const value = (this.data[this.position] << 8) | this.data[this.position + 1];
    this.position += 2;
    return value;
  }

  /**
   * Read a 32-bit unsigned integer (big-endian).
   */
  readUint32BE(): number {
    if (this.remaining < 4) {
      throw new BinaryReadError('Buffer underflow: cannot read uint32');
    }
    const value =
      (this.data[this.position] << 24) |
      (this.data[this.position + 1] << 16) |
      (this.data[this.position + 2] << 8) |
      this.data[this.position + 3];
    this.position += 4;
    return value >>> 0; // Convert to unsigned
  }

  /**
   * Read a 64-bit unsigned integer (big-endian) as bigint.
   */
  readUint64BE(): bigint {
    if (this.remaining < 8) {
      throw new BinaryReadError('Buffer underflow: cannot read uint64');
    }
    let value = 0n;
    for (let i = 0; i < 8; i++) {
      value = (value << 8n) | BigInt(this.data[this.position + i]);
    }
    this.position += 8;
    return value;
  }

  /**
   * Read raw bytes.
   */
  readBytes(length: number): Uint8Array {
    if (this.remaining < length) {
      throw new BinaryReadError(`Buffer underflow: cannot read ${length} bytes (only ${this.remaining} remaining)`);
    }
    const result = this.data.slice(this.position, this.position + length);
    this.position += length;
    return result;
  }

  /**
   * Read remaining bytes.
   */
  readRemaining(): Uint8Array {
    const result = this.data.slice(this.position);
    this.position = this.data.length;
    return result;
  }

  /**
   * Peek at upcoming bytes without advancing position.
   */
  peek(length: number): Uint8Array {
    const end = Math.min(this.position + length, this.data.length);
    return this.data.slice(this.position, end);
  }

  /**
   * Skip bytes.
   */
  skip(length: number): void {
    if (this.remaining < length) {
      throw new BinaryReadError(`Buffer underflow: cannot skip ${length} bytes`);
    }
    this.position += length;
  }

  /**
   * Seek to a specific position.
   */
  seek(position: number): void {
    if (position < 0 || position > this.data.length) {
      throw new BinaryReadError(`Invalid seek position: ${position}`);
    }
    this.position = position;
  }

  /**
   * Read a UTF-8 string of specified length.
   */
  readUtf8(length: number): string {
    const bytes = this.readBytes(length);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * Read a pipe-delimited string and parse fields.
   */
  readPipeDelimited(): string[] {
    const remaining = this.readRemaining();
    const text = new TextDecoder('utf-8').decode(remaining);
    return text.split('|');
  }
}

/**
 * Convert a hex string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (cleanHex.length % 2 !== 0) {
    throw new BinaryReadError('Invalid hex string: odd length');
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) {
      throw new BinaryReadError(`Invalid hex character at position ${i * 2}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare two byte arrays for equality.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
