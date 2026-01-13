import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bufferToBase64,
  base64ToBuffer,
  generateRandomBytes,
  combineBuffers,
} from '../buffer';

describe('buffer.ts', () => {
  describe('bufferToBase64', () => {
    it('should convert Uint8Array to Base64', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = bufferToBase64(bytes);
      expect(result).toBe('SGVsbG8=');
    });

    it('should convert ArrayBuffer to Base64', () => {
      const buffer = new ArrayBuffer(5);
      const view = new Uint8Array(buffer);
      view.set([72, 101, 108, 108, 111]); // "Hello"

      const result = bufferToBase64(buffer);
      expect(result).toBe('SGVsbG8=');
    });

    it('should handle empty array', () => {
      const bytes = new Uint8Array(0);
      const result = bufferToBase64(bytes);
      expect(result).toBe('');
    });

    it('should handle single byte', () => {
      const bytes = new Uint8Array([65]); // "A"
      const result = bufferToBase64(bytes);
      expect(result).toBe('QQ==');
    });

    it('should handle binary data with all byte values', () => {
      // Test with bytes 0-255
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        bytes[i] = i;
      }

      const base64 = bufferToBase64(bytes);
      const decoded = base64ToBuffer(base64);

      expect(decoded).toEqual(bytes);
    });

    it('should handle large buffers without stack overflow', () => {
      // Create a 100KB buffer (larger than typical stack)
      const largeBuffer = new Uint8Array(100 * 1024);
      for (let i = 0; i < largeBuffer.length; i++) {
        largeBuffer[i] = i % 256;
      }

      // Should not throw stack overflow
      expect(() => bufferToBase64(largeBuffer)).not.toThrow();

      const base64 = bufferToBase64(largeBuffer);
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
    });
  });

  describe('base64ToBuffer', () => {
    it('should convert Base64 to Uint8Array', () => {
      const base64 = 'SGVsbG8='; // "Hello"
      const result = base64ToBuffer(base64);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it('should throw on empty string', () => {
      expect(() => base64ToBuffer('')).toThrow('Invalid base64 input: string cannot be empty');
    });

    it('should handle Base64 without padding', () => {
      const base64 = 'QQ'; // "A" without padding
      const result = base64ToBuffer(base64);
      expect(Array.from(result)).toEqual([65]);
    });

    it('should return Uint8Array with ArrayBuffer backing', () => {
      const result = base64ToBuffer('SGVsbG8=');

      // Verify the buffer property is a proper ArrayBuffer
      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.buffer.byteLength).toBe(5);
    });

    it('should throw on invalid Base64', () => {
      expect(() => base64ToBuffer('not-valid-base64!')).toThrow('Invalid base64 input: malformed encoding');
    });

    it('should throw on non-string input', () => {
      // @ts-expect-error - testing runtime validation
      expect(() => base64ToBuffer(null)).toThrow('Invalid base64 input: expected string');
      // @ts-expect-error - testing runtime validation
      expect(() => base64ToBuffer(undefined)).toThrow('Invalid base64 input: expected string');
      // @ts-expect-error - testing runtime validation
      expect(() => base64ToBuffer(123)).toThrow('Invalid base64 input: expected string');
    });
  });

  describe('base64 roundtrip', () => {
    it('should roundtrip simple data', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const base64 = bufferToBase64(original);
      const restored = base64ToBuffer(base64);

      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it('should roundtrip random data', () => {
      const original = generateRandomBytes(64);
      const base64 = bufferToBase64(original);
      const restored = base64ToBuffer(base64);

      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it('should roundtrip text data', () => {
      const text = 'Hello, World! 🚀';
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const original = encoder.encode(text);
      const base64 = bufferToBase64(original);
      const restored = base64ToBuffer(base64);
      const restoredText = decoder.decode(restored);

      expect(restoredText).toBe(text);
    });
  });

  describe('generateRandomBytes', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should generate bytes of specified length', () => {
      const result = generateRandomBytes(16);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
    });

    it('should generate different values on each call', () => {
      const result1 = generateRandomBytes(32);
      const result2 = generateRandomBytes(32);

      // Extremely unlikely to be equal for random 32 bytes
      expect(Array.from(result1)).not.toEqual(Array.from(result2));
    });

    it('should reject zero length', () => {
      expect(() => generateRandomBytes(0)).toThrow('Invalid length for random bytes');
    });

    it('should reject negative length', () => {
      expect(() => generateRandomBytes(-1)).toThrow('Invalid length for random bytes');
    });

    it('should reject non-integer length', () => {
      expect(() => generateRandomBytes(1.5)).toThrow('Invalid length for random bytes');
    });

    it('should reject length exceeding maximum', () => {
      expect(() => generateRandomBytes(65537)).toThrow('Invalid length for random bytes');
    });

    it('should handle common crypto lengths', () => {
      // Salt: 16 bytes
      expect(generateRandomBytes(16).length).toBe(16);

      // IV: 12 bytes
      expect(generateRandomBytes(12).length).toBe(12);

      // Key: 32 bytes
      expect(generateRandomBytes(32).length).toBe(32);
    });

    it('should return Uint8Array with ArrayBuffer backing', () => {
      const result = generateRandomBytes(16);

      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.buffer.byteLength).toBe(16);
    });
  });

  describe('combineBuffers', () => {
    it('should combine two buffers', () => {
      const buf1 = new Uint8Array([1, 2, 3]);
      const buf2 = new Uint8Array([4, 5, 6]);

      const result = combineBuffers(buf1, buf2);

      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should combine multiple buffers', () => {
      const buf1 = new Uint8Array([1]);
      const buf2 = new Uint8Array([2, 3]);
      const buf3 = new Uint8Array([4, 5, 6]);

      const result = combineBuffers(buf1, buf2, buf3);

      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle empty buffers', () => {
      const buf1 = new Uint8Array([1, 2]);
      const empty = new Uint8Array(0);
      const buf2 = new Uint8Array([3, 4]);

      const result = combineBuffers(buf1, empty, buf2);

      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });

    it('should handle single buffer', () => {
      const buf = new Uint8Array([1, 2, 3]);
      const result = combineBuffers(buf);

      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it('should handle no buffers', () => {
      const result = combineBuffers();

      expect(result.length).toBe(0);
    });

    it('should return new buffer (not mutate inputs)', () => {
      const buf1 = new Uint8Array([1, 2]);
      const buf2 = new Uint8Array([3, 4]);

      const result = combineBuffers(buf1, buf2);

      // Modify result
      result[0] = 99;

      // Original should be unchanged
      expect(buf1[0]).toBe(1);
    });

    it('should return Uint8Array with ArrayBuffer backing', () => {
      const buf1 = new Uint8Array([1, 2, 3]);
      const buf2 = new Uint8Array([4, 5, 6]);

      const result = combineBuffers(buf1, buf2);

      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.buffer.byteLength).toBe(6);
    });

    it('should work with crypto-relevant sizes', () => {
      const salt = generateRandomBytes(16);
      const iv = generateRandomBytes(12);
      const ciphertext = generateRandomBytes(48);

      const combined = combineBuffers(salt, iv, ciphertext);

      expect(combined.length).toBe(16 + 12 + 48);

      // Verify we can extract the parts back
      expect(Array.from(combined.slice(0, 16))).toEqual(Array.from(salt));
      expect(Array.from(combined.slice(16, 28))).toEqual(Array.from(iv));
      expect(Array.from(combined.slice(28))).toEqual(Array.from(ciphertext));
    });
  });
});
