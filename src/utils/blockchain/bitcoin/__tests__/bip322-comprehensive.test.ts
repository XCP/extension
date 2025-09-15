/**
 * Comprehensive BIP-322 test to ensure no cheating
 */

import { describe, it, expect } from 'vitest';
import { hex } from '@scure/base';
import {
  signBIP322P2PKH,
  signBIP322P2WPKH,
  signBIP322P2SH_P2WPKH,
  signBIP322P2TR,
  verifyBIP322Signature
} from '../bip322';
import * as secp256k1 from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';

describe('BIP-322 Comprehensive Tests - No Cheating', () => {
  const privateKey1 = hex.decode('0000000000000000000000000000000000000000000000000000000000000001');
  const privateKey2 = hex.decode('0000000000000000000000000000000000000000000000000000000000000002');

  describe('P2PKH comprehensive verification', () => {
    it('should reject signature from different private key', async () => {
      const pubKey1 = secp256k1.getPublicKey(privateKey1, true);
      const pubKey2 = secp256k1.getPublicKey(privateKey2, true);
      const address1 = btc.p2pkh(pubKey1).address!;
      const address2 = btc.p2pkh(pubKey2).address!;

      const message = 'Test message';
      const signature = await signBIP322P2PKH(message, privateKey1, true);

      // Signature from key1 should NOT verify with address from key2
      const isValid = await verifyBIP322Signature(message, signature, address2);
      expect(isValid).toBe(false);

      // But should verify with correct address
      const isValidCorrect = await verifyBIP322Signature(message, signature, address1);
      expect(isValidCorrect).toBe(true);
    });

    it('should produce different signatures for different messages', async () => {
      const pubKey = secp256k1.getPublicKey(privateKey1, true);
      const address = btc.p2pkh(pubKey).address!;

      const message1 = 'Message 1';
      const message2 = 'Message 2';

      const sig1 = await signBIP322P2PKH(message1, privateKey1, true);
      const sig2 = await signBIP322P2PKH(message2, privateKey1, true);

      // Signatures must be different
      expect(sig1).not.toBe(sig2);

      // Each signature only validates its own message
      expect(await verifyBIP322Signature(message1, sig1, address)).toBe(true);
      expect(await verifyBIP322Signature(message2, sig2, address)).toBe(true);
      expect(await verifyBIP322Signature(message1, sig2, address)).toBe(false);
      expect(await verifyBIP322Signature(message2, sig1, address)).toBe(false);
    });

    it('should reject malformed signatures', async () => {
      const pubKey = secp256k1.getPublicKey(privateKey1, true);
      const address = btc.p2pkh(pubKey).address!;
      const message = 'Test';

      // Test various malformed signatures
      expect(await verifyBIP322Signature(message, 'not-base64!', address)).toBe(false);
      expect(await verifyBIP322Signature(message, 'AAAA', address)).toBe(false);
      expect(await verifyBIP322Signature(message, '', address)).toBe(false);
    });
  });

  describe('P2WPKH comprehensive verification', () => {
    it('should reject signature from different private key', async () => {
      const pubKey1 = secp256k1.getPublicKey(privateKey1, true);
      const pubKey2 = secp256k1.getPublicKey(privateKey2, true);
      const address1 = btc.p2wpkh(pubKey1).address!;
      const address2 = btc.p2wpkh(pubKey2).address!;

      const message = 'Test message';
      const signature = await signBIP322P2WPKH(message, privateKey1);

      // Signature from key1 should NOT verify with address from key2
      const isValid = await verifyBIP322Signature(message, signature, address2);
      expect(isValid).toBe(false);

      // But should verify with correct address
      const isValidCorrect = await verifyBIP322Signature(message, signature, address1);
      expect(isValidCorrect).toBe(true);
    });

    it('should handle empty message correctly', async () => {
      const pubKey = secp256k1.getPublicKey(privateKey1, true);
      const address = btc.p2wpkh(pubKey).address!;

      const emptyMessage = '';
      const signature = await signBIP322P2WPKH(emptyMessage, privateKey1);

      // Should verify empty message
      expect(await verifyBIP322Signature(emptyMessage, signature, address)).toBe(true);
      // But not non-empty message
      expect(await verifyBIP322Signature('not empty', signature, address)).toBe(false);
    });
  });

  describe('P2SH-P2WPKH comprehensive verification', () => {
    it('should handle cross-type signature rejection', async () => {
      const pubKey = secp256k1.getPublicKey(privateKey1, true);
      const p2wpkh = btc.p2wpkh(pubKey);
      const p2sh_address = btc.p2sh(p2wpkh).address!;
      const p2wpkh_address = p2wpkh.address!;
      const p2pkh_address = btc.p2pkh(pubKey).address!;

      const message = 'Test message';
      const p2sh_sig = await signBIP322P2SH_P2WPKH(message, privateKey1);

      // P2SH-P2WPKH signature should only work with P2SH-P2WPKH address
      expect(await verifyBIP322Signature(message, p2sh_sig, p2sh_address)).toBe(true);
      expect(await verifyBIP322Signature(message, p2sh_sig, p2wpkh_address)).toBe(false);
      expect(await verifyBIP322Signature(message, p2sh_sig, p2pkh_address)).toBe(false);
    });
  });

  describe('Taproot comprehensive verification', () => {
    it('should verify Schnorr signatures correctly', async () => {
      const pubKey1 = btc.utils.pubSchnorr(privateKey1);
      const pubKey2 = btc.utils.pubSchnorr(privateKey2);
      const address1 = btc.p2tr(pubKey1).address!;
      const address2 = btc.p2tr(pubKey2).address!;

      const message = 'Taproot test';
      const signature = await signBIP322P2TR(message, privateKey1);

      // Should verify with correct address
      expect(await verifyBIP322Signature(message, signature, address1)).toBe(true);
      // Should reject wrong address
      expect(await verifyBIP322Signature(message, signature, address2)).toBe(false);
      // Should reject wrong message
      expect(await verifyBIP322Signature('Wrong', signature, address1)).toBe(false);
    });

    it('should handle special characters in messages', async () => {
      const pubKey = btc.utils.pubSchnorr(privateKey1);
      const address = btc.p2tr(pubKey).address!;

      const specialMessage = '🚀 Unicode! \n\t Special chars: <>&"\'';
      const signature = await signBIP322P2TR(specialMessage, privateKey1);

      expect(await verifyBIP322Signature(specialMessage, signature, address)).toBe(true);
      expect(await verifyBIP322Signature('Different', signature, address)).toBe(false);
    });
  });

  describe('Cross-type signature verification', () => {
    it('should not accept signatures across different address types', async () => {
      const message = 'Test cross-type';
      const pubKey = secp256k1.getPublicKey(privateKey1, true);
      const schnorrPubKey = btc.utils.pubSchnorr(privateKey1);

      // Create all address types
      const p2pkh = btc.p2pkh(pubKey).address!;
      const p2wpkh = btc.p2wpkh(pubKey).address!;
      const p2sh = btc.p2sh(btc.p2wpkh(pubKey)).address!;
      const p2tr = btc.p2tr(schnorrPubKey).address!;

      // Create signatures for each type
      const sigP2PKH = await signBIP322P2PKH(message, privateKey1, true);
      const sigP2WPKH = await signBIP322P2WPKH(message, privateKey1);
      const sigP2SH = await signBIP322P2SH_P2WPKH(message, privateKey1);
      const sigP2TR = await signBIP322P2TR(message, privateKey1);

      // Each signature should ONLY work with its own address type
      // P2PKH signature
      expect(await verifyBIP322Signature(message, sigP2PKH, p2pkh)).toBe(true);
      expect(await verifyBIP322Signature(message, sigP2PKH, p2wpkh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2PKH, p2sh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2PKH, p2tr)).toBe(false);

      // P2WPKH signature
      expect(await verifyBIP322Signature(message, sigP2WPKH, p2pkh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2WPKH, p2wpkh)).toBe(true);
      expect(await verifyBIP322Signature(message, sigP2WPKH, p2sh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2WPKH, p2tr)).toBe(false);

      // P2SH signature
      expect(await verifyBIP322Signature(message, sigP2SH, p2pkh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2SH, p2wpkh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2SH, p2sh)).toBe(true);
      expect(await verifyBIP322Signature(message, sigP2SH, p2tr)).toBe(false);

      // P2TR signature
      expect(await verifyBIP322Signature(message, sigP2TR, p2pkh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2TR, p2wpkh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2TR, p2sh)).toBe(false);
      expect(await verifyBIP322Signature(message, sigP2TR, p2tr)).toBe(true);
    });
  });
});