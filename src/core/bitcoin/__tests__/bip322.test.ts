/**
 * Tests for BIP-322 Generic Signed Message Format
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { hex } from '@scure/base';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bip322MessageHash,
  createToSignTransaction,
  createToSpendTransaction,
  supportsBIP322,
  verifyBIP322Signature,
  verifySimpleBIP322,
} from '../bip322';

describe('BIP-322 Implementation', () => {
  describe('bip322MessageHash', () => {
    it('should create a BIP-322 tagged hash', () => {
      const message = 'Hello, Bitcoin!';
      const hash = bip322MessageHash(message);

      // The hash should be 32 bytes
      expect(hash.length).toBe(32);

      // It should be deterministic
      const hash2 = bip322MessageHash(message);
      expect(hex.encode(hash)).toBe(hex.encode(hash2));

      // Different messages should produce different hashes
      const hash3 = bip322MessageHash('Different message');
      expect(hex.encode(hash)).not.toBe(hex.encode(hash3));
    });

    it('should handle empty messages', () => {
      const hash = bip322MessageHash('');
      expect(hash.length).toBe(32);
    });

    it('should handle unicode messages', () => {
      const message = '你好，比特币！🚀';
      const hash = bip322MessageHash(message);
      expect(hash.length).toBe(32);
    });
  });

  describe('Virtual Transaction Creation', () => {
    it('should create a valid to_spend transaction', () => {
      const message = 'Test message';
      const messageHash = bip322MessageHash(message);
      const scriptPubKey = new Uint8Array([0x00, 0x14, ...new Uint8Array(20)]); // P2WPKH: OP_0 + 20 bytes

      const tx = createToSpendTransaction(messageHash, scriptPubKey);

      // Check that we get raw bytes
      expect(tx).toBeInstanceOf(Uint8Array);
      expect(tx.length).toBeGreaterThan(0);

      // Verify it starts with version 0 (little-endian)
      expect(tx[0]).toBe(0);
      expect(tx[1]).toBe(0);
      expect(tx[2]).toBe(0);
      expect(tx[3]).toBe(0);

      // Has one input (at byte 4)
      expect(tx[4]).toBe(1);

      // Check for null input pattern (all zeros for txid)
      let allZeros = true;
      for (let i = 5; i < 37; i++) {
        if (tx[i] !== 0) allZeros = false;
      }
      expect(allZeros).toBe(true);

      // Check for 0xFFFFFFFF index
      expect(tx[37]).toBe(0xFF);
      expect(tx[38]).toBe(0xFF);
      expect(tx[39]).toBe(0xFF);
      expect(tx[40]).toBe(0xFF);
    });

    it('should create a valid to_sign transaction', () => {
      const message = 'Test message';
      const messageHash = bip322MessageHash(message);
      const scriptPubKey = new Uint8Array([0x00, 0x14, ...new Uint8Array(20)]); // P2WPKH
      const toSpendBytes = createToSpendTransaction(messageHash, scriptPubKey);

      const tx = createToSignTransaction(toSpendBytes);

      // Check that we get raw bytes
      expect(tx).toBeInstanceOf(Uint8Array);
      expect(tx.length).toBeGreaterThan(0);

      // Verify it starts with version 0
      expect(tx[0]).toBe(0);
      expect(tx[1]).toBe(0);
      expect(tx[2]).toBe(0);
      expect(tx[3]).toBe(0);

      // Has one input
      expect(tx[4]).toBe(1);

      // The prevout hash is to_spend's double-SHA256 in its natural byte order. This used to assert
      // the reverse of it — the *displayed* txid — which is the orientation that made the whole
      // segwit path non-interoperable. The spec's own `to_sign_tx_hash` settles it; see the
      // structural-intermediates block in `bip322-standardness.test.ts`.
      expect(hex.encode(tx.slice(5, 37))).toBe(hex.encode(sha256(sha256(toSpendBytes))));
    });
  });



  describe('supportsBIP322', () => {
    it('should identify Taproot addresses as supporting BIP-322', () => {
      expect(supportsBIP322('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')).toBe(true);
    });

    it('should identify Native SegWit addresses as supporting BIP-322', () => {
      expect(supportsBIP322('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true);
    });

    it('should identify P2SH addresses as supporting BIP-322', () => {
      expect(supportsBIP322('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
    });

    it('should identify Legacy P2PKH addresses as supporting BIP-322', () => {
      expect(supportsBIP322('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(supportsBIP322('invalid')).toBe(false);
      expect(supportsBIP322('bc1invalid')).toBe(false);
      expect(supportsBIP322('')).toBe(false);
    });
  });

  describe('BIP-322 Signature Verification', () => {
    // These would be real test vectors from a BIP-322 implementation
    // For now, we test the structure and error handling

    it('should reject signatures with invalid format', async () => {
      const result = await verifyBIP322Signature(
        'Test message',
        'invalid_signature',
        'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'
      );

      expect(result).toBe(false);
    });

    it('should reject non-Taproot addresses', async () => {
      const result = await verifyBIP322Signature(
        'Test message',
        'tr:' + '0'.repeat(128),
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' // Legacy address
      );

      expect(result).toBe(false);
    });

    it('should reject signatures with wrong length', async () => {
      const result = await verifyBIP322Signature(
        'Test message',
        'tr:deadbeef',
        'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'
      );

      expect(result).toBe(false);
    });

  });

  describe('Simple BIP-322 Verification', () => {
    it('should reject non-Taproot addresses', async () => {
      const result = await verifySimpleBIP322(
        'Test message',
        'tr:' + '0'.repeat(128),
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
      );

      expect(result).toBe(false);
    });

    it('should reject invalid signature formats', async () => {
      const result = await verifySimpleBIP322(
        'Test message',
        'not_a_signature',
        'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'
      );

      expect(result).toBe(false);
    });

    it('should handle address decoding errors gracefully', async () => {
      const result = await verifySimpleBIP322(
        'Test message',
        'tr:' + '0'.repeat(128),
        'bc1pinvalid'
      );

      expect(result).toBe(false);
    });
  });

  describe('Integration with messageVerifier', () => {
    // Import the updated messageVerifier functions
    let verifyMessage: any;
    let verifyTaprootSignature: any;

    beforeEach(async () => {
      const module = await import('../messageVerifier');
      verifyMessage = module.verifyMessage;
      verifyTaprootSignature = module.verifyBIP322; // Use BIP-322 for Taproot
    });

    it('should delegate Taproot signatures to BIP-322 verification', async () => {
      const taprootSignature = 'tr:' + '0'.repeat(128);
      const taprootAddress = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';

      // This should use BIP-322 verification internally
      const result = await verifyMessage(
        'Test message',
        taprootSignature,
        taprootAddress
      );

      // Will be false because signature is invalid, but should not throw
      expect(result.valid).toBe(false);
    });

    it('should handle Taproot verification with fallback', async () => {
      const taprootSignature = 'tr:' + 'f'.repeat(128);
      const taprootAddress = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';

      const result = await verifyTaprootSignature(
        'Test message',
        taprootSignature,
        taprootAddress
      );

      // Will be false because signature is invalid, but should not throw
      expect(result.valid).toBe(false);
    });
  });
});