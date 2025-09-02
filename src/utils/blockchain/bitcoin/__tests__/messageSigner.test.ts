import { describe, it, expect, beforeAll } from 'vitest';
import { signMessage, getSigningCapabilities, verifyMessage } from '@/utils/blockchain/bitcoin';
import { AddressFormat } from '@/utils/blockchain/bitcoin';
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

describe('messageSign', () => {
  // Test vectors - using a known private key for consistent testing
  const testPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001';
  const testMessage = 'Hello Bitcoin!';
  
  describe('signMessage', () => {
    it('should sign a message with P2PKH address type', async () => {
      const result = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('address');
      expect(result.signature).toBeTruthy();
      expect(result.address).toMatch(/^1/); // P2PKH addresses start with 1
    });

    it('should sign a message with P2WPKH address type', async () => {
      const result = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2WPKH,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('address');
      expect(result.signature).toBeTruthy();
      expect(result.address).toMatch(/^bc1q/); // P2WPKH addresses start with bc1q
    });

    it('should sign a message with P2SH-P2WPKH address type', async () => {
      const result = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2SH_P2WPKH,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('address');
      expect(result.signature).toBeTruthy();
      expect(result.address).toMatch(/^3/); // P2SH addresses start with 3
    });

    it('should sign a message with P2TR address type', async () => {
      const result = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2TR,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('address');
      expect(result.signature).toBeTruthy();
      expect(result.address).toMatch(/^bc1p/); // P2TR addresses start with bc1p
      // Taproot signatures have a different format
      expect(result.signature).toMatch(/^tr:/);
    });

    it('should sign a message with Counterwallet address type', async () => {
      const result = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.Counterwallet,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('address');
      expect(result.signature).toBeTruthy();
      // Counterwallet uses P2PKH addresses
      expect(result.address).toMatch(/^1/);
    });

    it('should handle lowercase counterwallet address type', async () => {
      const result = await signMessage(
        testMessage,
        testPrivateKey,
        'counterwallet', // lowercase
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('address');
      expect(result.signature).toBeTruthy();
    });

    it('should produce different signatures for different messages', async () => {
      const result1 = await signMessage(
        'Message 1',
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      const result2 = await signMessage(
        'Message 2',
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      expect(result1.signature).not.toBe(result2.signature);
    });

    it('should produce different signatures for different private keys', async () => {
      const privateKey2 = '0000000000000000000000000000000000000000000000000000000000000002';
      
      const result1 = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      const result2 = await signMessage(
        testMessage,
        privateKey2,
        AddressFormat.P2PKH,
        true
      );
      
      expect(result1.signature).not.toBe(result2.signature);
      expect(result1.address).not.toBe(result2.address);
    });

    it('should throw error for unsupported address type', async () => {
      await expect(
        signMessage(
          testMessage,
          testPrivateKey,
          'INVALID' as any,
          true
        )
      ).rejects.toThrow('Unsupported address type');
    });

    it('should handle empty messages', async () => {
      const result = await signMessage(
        '',
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result.signature).toBeTruthy();
    });

    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(10000);
      const result = await signMessage(
        longMessage,
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result.signature).toBeTruthy();
    });

    it('should handle special characters in messages', async () => {
      const specialMessage = '🚀 Unicode! 中文 Ñoño\n\tTabs and\nnewlines';
      const result = await signMessage(
        specialMessage,
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      expect(result).toHaveProperty('signature');
      expect(result.signature).toBeTruthy();
    });
  });

  describe('verifyMessage', () => {
    it('should verify a valid P2PKH signature', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2PKH,
        true
      );
      
      const isValid = await verifyMessage(testMessage, signature, address);
      expect(isValid).toBe(true);
    });

    it('should verify a valid Taproot signature', async () => {
      const { signature, address } = await signMessage(
        testMessage,
        testPrivateKey,
        AddressFormat.P2TR,
        true
      );
      
      // Current implementation is simplified
      const isValid = await verifyMessage(testMessage, signature, address);
      expect(isValid).toBe(true);
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
  });

  describe('getSigningCapabilities', () => {
    it('should return capabilities for P2PKH', () => {
      const caps = getSigningCapabilities(AddressFormat.P2PKH);
      expect(caps.canSign).toBe(true);
      expect(caps.method).toContain('BIP-137');
    });

    it('should return capabilities for P2WPKH', () => {
      const caps = getSigningCapabilities(AddressFormat.P2WPKH);
      expect(caps.canSign).toBe(true);
      expect(caps.method).toContain('SegWit');
    });

    it('should return capabilities for P2SH-P2WPKH', () => {
      const caps = getSigningCapabilities(AddressFormat.P2SH_P2WPKH);
      expect(caps.canSign).toBe(true);
      expect(caps.method).toContain('SegWit');
    });

    it('should return capabilities for P2TR', () => {
      const caps = getSigningCapabilities(AddressFormat.P2TR);
      expect(caps.canSign).toBe(true);
      expect(caps.method).toContain('Taproot');
    });

    it('should return capabilities for Counterwallet', () => {
      const caps = getSigningCapabilities(AddressFormat.Counterwallet);
      expect(caps.canSign).toBe(true);
      expect(caps.method).toContain('BIP-137');
    });

    it('should handle case variations', () => {
      const caps1 = getSigningCapabilities('counterwallet');
      const caps2 = getSigningCapabilities('Counterwallet');
      
      expect(caps1.canSign).toBe(true);
      expect(caps2.canSign).toBe(true);
      
      // Test an actually invalid type
      const caps3 = getSigningCapabilities('INVALID_TYPE' as any);
      expect(caps3.canSign).toBe(false);
    });

    it('should return false for unsupported types', () => {
      const caps = getSigningCapabilities('INVALID' as any);
      expect(caps.canSign).toBe(false);
      expect(caps.notes).toContain('does not support');
    });
  });
});