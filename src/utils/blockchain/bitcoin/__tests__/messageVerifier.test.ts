import { describe, it, expect, beforeAll } from 'vitest';
import { signMessage, verifyMessage, parseSignature, getAddressTypeFromFlag } from '@/utils/blockchain/bitcoin';
import { AddressType } from '@/utils/blockchain/bitcoin';
import * as secp256k1 from '@noble/secp256k1';
import { hashes } from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';

// Initialize secp256k1 for tests
beforeAll(() => {
  
  if (!hashes.hmacSha256) {
    hashes.hmacSha256 = (key: Uint8Array, msg: Uint8Array): Uint8Array => {
      return hmac(sha256, key, msg);
    };
    hashes.sha256 = sha256;
    
    hashes.hmacSha256Async = async (key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> => {
      return hmac(sha256, key, msg);
    };
    hashes.sha256Async = async (msg: Uint8Array): Promise<Uint8Array> => {
      return sha256(msg);
    };
  }
});

describe('messageVerifier', () => {
  // Test vectors - using a known private key for consistent testing
  const testPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001';
  const testMessage = 'Hello Bitcoin!';
  
  describe('verifyMessage', () => {
    it('should verify a valid P2PKH signature', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2PKH,
        true
      );
      
      const isValid = await verifyMessage(testMessage, signature, address);
      expect(isValid).toBe(true);
    });

    it('should verify a valid P2WPKH signature', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2WPKH,
        true
      );
      
      const isValid = await verifyMessage(testMessage, signature, address);
      expect(isValid).toBe(true);
    });

    it('should verify a valid P2SH-P2WPKH signature', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2SH_P2WPKH,
        true
      );
      
      const isValid = await verifyMessage(testMessage, signature, address);
      expect(isValid).toBe(true);
    });

    it('should verify a valid Taproot signature', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2TR,
        true
      );
      
      // Current implementation is simplified
      const isValid = await verifyMessage(testMessage, signature, address);
      expect(isValid).toBe(true);
    });

    it('should reject signatures with wrong message', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2PKH,
        true
      );
      
      const isValid = await verifyMessage('Wrong message', signature, address);
      expect(isValid).toBe(false);
    });

    it('should reject signatures with wrong address', async () => {
      const { signature } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2PKH,
        true
      );
      
      const wrongAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const isValid = await verifyMessage(testMessage, signature, wrongAddress);
      expect(isValid).toBe(false);
    });

    it('should reject invalid signatures', async () => {
      const isValid = await verifyMessage(
        testMessage,
        'invalid_signature',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      );
      expect(isValid).toBe(false);
    });

    it('should reject signatures with wrong format', async () => {
      const isValid = await verifyMessage(
        testMessage,
        'short',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      );
      expect(isValid).toBe(false);
    });

    it('should handle base64 decoding errors gracefully', async () => {
      const isValid = await verifyMessage(
        testMessage,
        'not!valid@base64',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      );
      expect(isValid).toBe(false);
    });
  });

  describe('parseSignature', () => {
    it('should parse a valid P2PKH signature', async () => {
      const { signature } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2PKH,
        true
      );
      
      const parsed = parseSignature(signature);
      expect(parsed.valid).toBe(true);
      expect(parsed.type).toContain('P2PKH');
      expect(parsed.flag).toBeDefined();
      expect(parsed.r).toBeDefined();
      expect(parsed.s).toBeDefined();
    });

    it('should parse a valid Taproot signature', async () => {
      const { signature } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressType.P2TR,
        true
      );
      
      const parsed = parseSignature(signature);
      expect(parsed.valid).toBe(true);
      expect(parsed.type).toBe('Taproot');
      expect(parsed.r).toBeDefined();
      expect(parsed.s).toBeDefined();
    });

    it('should reject invalid signatures', () => {
      const parsed = parseSignature('invalid');
      expect(parsed.valid).toBe(false);
    });

    it('should reject signatures with wrong length', () => {
      const parsed = parseSignature('AAAA'); // Too short base64
      expect(parsed.valid).toBe(false);
    });
  });

  describe('getAddressTypeFromFlag', () => {
    it('should identify P2PKH uncompressed flags', () => {
      expect(getAddressTypeFromFlag(27)).toBe('P2PKH (uncompressed)');
      expect(getAddressTypeFromFlag(28)).toBe('P2PKH (uncompressed)');
      expect(getAddressTypeFromFlag(29)).toBe('P2PKH (uncompressed)');
      expect(getAddressTypeFromFlag(30)).toBe('P2PKH (uncompressed)');
    });

    it('should identify P2PKH compressed flags', () => {
      expect(getAddressTypeFromFlag(31)).toBe('P2PKH (compressed)');
      expect(getAddressTypeFromFlag(32)).toBe('P2PKH (compressed)');
      expect(getAddressTypeFromFlag(33)).toBe('P2PKH (compressed)');
      expect(getAddressTypeFromFlag(34)).toBe('P2PKH (compressed)');
    });

    it('should identify P2SH-P2WPKH flags', () => {
      expect(getAddressTypeFromFlag(35)).toBe('P2SH-P2WPKH');
      expect(getAddressTypeFromFlag(36)).toBe('P2SH-P2WPKH');
      expect(getAddressTypeFromFlag(37)).toBe('P2SH-P2WPKH');
      expect(getAddressTypeFromFlag(38)).toBe('P2SH-P2WPKH');
    });

    it('should identify P2WPKH flags', () => {
      expect(getAddressTypeFromFlag(39)).toBe('P2WPKH');
      expect(getAddressTypeFromFlag(40)).toBe('P2WPKH');
      expect(getAddressTypeFromFlag(41)).toBe('P2WPKH');
      expect(getAddressTypeFromFlag(42)).toBe('P2WPKH');
    });

    it('should return null for invalid flags', () => {
      expect(getAddressTypeFromFlag(0)).toBe(null);
      expect(getAddressTypeFromFlag(26)).toBe(null);
      expect(getAddressTypeFromFlag(43)).toBe(null);
      expect(getAddressTypeFromFlag(255)).toBe(null);
    });
  });
});