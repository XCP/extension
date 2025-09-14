/**
 * Tests for BIP-322 Generic Signed Message Format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  bip322MessageHash,
  createToSpendTransaction,
  createToSignTransaction,
  verifyBIP322Signature,
  verifySimpleBIP322,
  formatTaprootSignature,
  parseBIP322Signature,
  supportsBIP322,
} from '../bip322';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';

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

      // Check transaction structure
      expect(tx.inputsLength).toBe(1);
      expect(tx.outputsLength).toBe(2); // Two outputs as per BIP-322 spec

      // Check input is the null input
      const input = tx.getInput(0);
      expect(hex.encode(input.txid!)).toBe(
        '0000000000000000000000000000000000000000000000000000000000000000'
      );
      expect(input.index).toBe(0xFFFFFFFF);
    });

    it('should create a valid to_sign transaction', () => {
      const toSpendTxId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const scriptPubKey = new Uint8Array([0x00, 0x14, ...new Uint8Array(20)]); // P2WPKH

      const tx = createToSignTransaction(toSpendTxId, scriptPubKey);

      // Check transaction structure
      expect(tx.inputsLength).toBe(1);
      expect(tx.outputsLength).toBe(1);

      // Check input references to_spend transaction output 1 (the scriptPubKey output)
      const input = tx.getInput(0);
      expect(hex.encode(input.txid!)).toBe(toSpendTxId);
      expect(input.index).toBe(1); // Index 1 to spend the scriptPubKey output
    });
  });

  describe('parseBIP322Signature', () => {
    it('should parse Taproot signatures', async () => {
      const signature = 'tr:' + '0'.repeat(128);
      const parsed = await parseBIP322Signature(signature);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('taproot');
      expect(parsed?.data.length).toBe(64);
    });

    it('should reject invalid Taproot signatures', async () => {
      const signature = 'tr:invalid';
      const parsed = await parseBIP322Signature(signature);

      expect(parsed).toBeNull();
    });

    it('should parse legacy base64 signatures', async () => {
      // Create a mock legacy signature (65 bytes)
      const sigBytes = new Uint8Array(65);
      sigBytes[0] = 31; // Compressed P2PKH flag
      const base64 = (await import('@scure/base')).base64;
      const signature = base64.encode(sigBytes);

      const parsed = await parseBIP322Signature(signature);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('legacy');
      expect(parsed?.data.length).toBe(65);
    });

    it('should parse segwit base64 signatures', async () => {
      // Create a mock segwit signature (65 bytes)
      const sigBytes = new Uint8Array(65);
      sigBytes[0] = 39; // P2WPKH flag
      const base64 = (await import('@scure/base')).base64;
      const signature = base64.encode(sigBytes);

      const parsed = await parseBIP322Signature(signature);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('segwit');
      expect(parsed?.data.length).toBe(65);
    });
  });

  describe('formatTaprootSignature', () => {
    it('should format a Schnorr signature correctly', () => {
      const signature = new Uint8Array(64);
      signature.fill(0xAB);

      const formatted = formatTaprootSignature(signature);

      expect(formatted).toMatch(/^tr:[0-9a-f]{128}$/);
      expect(formatted).toBe('tr:' + 'ab'.repeat(64));
    });

    it('should reject invalid signature lengths', () => {
      const signature = new Uint8Array(32); // Wrong length

      expect(() => formatTaprootSignature(signature)).toThrow(
        'Invalid Schnorr signature length'
      );
    });
  });

  describe('supportsBIP322', () => {
    it('should identify Taproot addresses as supporting BIP-322', () => {
      expect(supportsBIP322('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')).toBe(true);
      expect(supportsBIP322('tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c')).toBe(true);
    });

    it('should identify Native SegWit addresses as supporting BIP-322', () => {
      expect(supportsBIP322('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true);
      expect(supportsBIP322('tb1q6z64a43mjgkcq0ul9cdw0rtqrqr5x5cqt30zcu')).toBe(true);
    });

    it('should identify P2SH addresses as supporting BIP-322', () => {
      expect(supportsBIP322('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
      expect(supportsBIP322('2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc')).toBe(true);
    });

    it('should identify Legacy P2PKH addresses as supporting BIP-322', () => {
      expect(supportsBIP322('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
      expect(supportsBIP322('mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef')).toBe(true);
      expect(supportsBIP322('n2ZWNRYZKCfhMqDheuUvp5CZ9C3Mzf3kNs')).toBe(true);
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

    it('should handle testnet addresses', async () => {
      const result = await verifyBIP322Signature(
        'Test message',
        'tr:' + '0'.repeat(128),
        'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c'
      );

      // This will fail because the signature is invalid, but it should not throw
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
      verifyTaprootSignature = module.verifyTaprootSignature;
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
      expect(result).toBe(false);
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
      expect(result).toBe(false);
    });
  });
});