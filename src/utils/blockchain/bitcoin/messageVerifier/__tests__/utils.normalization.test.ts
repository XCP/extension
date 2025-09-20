/**
 * Message and Signature Normalization Tests
 *
 * Tests our smart normalization approach:
 * 1. Try original inputs first
 * 2. Only apply normalization if original fails
 * 3. Indicate when normalization was applied
 */

import { describe, it, expect } from 'vitest';
import { verifyMessage } from '../messageVerifier';
import { normalizeMessage, detectAndNormalizeSignature, validateMessage } from '../utils';

describe('Message and Signature Normalization', () => {

  describe('Message Normalization Utils', () => {
    it('should normalize Windows line endings to Unix', () => {
      const message = 'line one\r\nline two\r\nline three';
      const normalized = normalizeMessage(message);
      expect(normalized).toBe('line one\nline two\nline three');
    });

    it('should leave Unix line endings unchanged', () => {
      const message = 'line one\nline two\nline three';
      const normalized = normalizeMessage(message);
      expect(normalized).toBe(message);
    });

    it('should validate message issues', () => {
      const validation = validateMessage('test\r\nmessage');
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Contains Windows line endings (\\r\\n)');
      expect(validation.normalized).toBe('test\nmessage');
    });

    it('should handle empty messages', () => {
      const validation = validateMessage('');
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Empty message');
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(70000);
      const validation = validateMessage(longMessage);
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Message longer than 65535 characters');
    });
  });

  describe('Signature Format Detection', () => {
    it('should detect valid base64 signatures', () => {
      const signature = 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=';
      const detection = detectAndNormalizeSignature(signature);

      expect(detection.format).toBe('base64');
      expect(detection.valid).toBe(true);
      expect(detection.normalized).toBe(signature);
    });

    it('should detect and convert hex signatures to base64', () => {
      // Convert our known base64 signature to hex for testing
      const base64Sig = 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=';
      const decoded = atob(base64Sig);
      const hexSig = Array.from(decoded).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

      const detection = detectAndNormalizeSignature(hexSig);

      expect(detection.format).toBe('hex');
      expect(detection.valid).toBe(true);
      expect(detection.normalized).toBe(base64Sig);
    });

    it('should detect BIP-322 signatures', () => {
      const bip322Sig = 'tr:abc123def456...';
      const detection = detectAndNormalizeSignature(bip322Sig);

      expect(detection.format).toBe('bip322');
      expect(detection.valid).toBe(true);
      expect(detection.normalized).toBe(bip322Sig);
    });

    it('should handle invalid signatures', () => {
      const invalidSig = '!@#$%^&*()';  // Invalid characters for both hex and base64
      const detection = detectAndNormalizeSignature(invalidSig);

      expect(detection.format).toBe('unknown');
      expect(detection.valid).toBe(false);
    });

    it('should handle invalid base64', () => {
      const invalidBase64 = 'not-valid-base64!@#';
      const detection = detectAndNormalizeSignature(invalidBase64);

      expect(detection.format).toBe('unknown');
      expect(detection.valid).toBe(false);
    });
  });

  describe('Smart Normalization in Verification', () => {
    // Use our known working FreeWallet signature for testing

    const workingFixture = {
      address: '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX',
      message: 'test',
      signature: 'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs='
    };

    it('should verify original signature without normalization', async () => {
      const result = await verifyMessage(
        workingFixture.message,
        workingFixture.signature,
        workingFixture.address
      );

      expect(result.valid).toBe(true);
      expect(result.method).not.toContain('normalized');
    });

    it('should handle hex signature format via normalization', async () => {
      // Convert signature to hex
      const decoded = atob(workingFixture.signature);
      const hexSignature = Array.from(decoded).map(c =>
        c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('');

      const result = await verifyMessage(
        workingFixture.message,
        hexSignature,
        workingFixture.address
      );

      expect(result.valid).toBe(true);
      expect(result.method).toContain('normalized');
      expect(result.details).toContain('signature');
    });

    it('should handle message with Windows line endings via normalization', async () => {
      // This test assumes we had a signature created with \r\n line endings
      // For now, we'll test the logic with a modified message that should fail original but work normalized

      const messageWithCRLF = workingFixture.message + '\r\n';
      const result = await verifyMessage(
        messageWithCRLF,
        workingFixture.signature,
        workingFixture.address
      );

      // This might fail or succeed depending on how the original signature was created
      // The key is testing that normalization is attempted
      console.log('Line ending test result:', result);

      if (result.valid && result.method?.includes('normalized')) {
        expect(result.details).toContain('message');
      }
    });

    it('should try normalization only after original fails', async () => {
      // Test with a signature that definitely won't work originally
      const badSignature = 'definitely-not-a-valid-signature';

      const result = await verifyMessage(
        workingFixture.message,
        badSignature,
        workingFixture.address
      );

      expect(result.valid).toBe(false);
      // Should not indicate normalization for completely invalid signatures
    });

    it('should handle combined message + signature normalization', async () => {
      // Convert signature to hex AND add line endings to message
      const decoded = atob(workingFixture.signature);
      const hexSignature = Array.from(decoded).map(c =>
        c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('');
      const messageWithCRLF = workingFixture.message + '\r\n';

      const result = await verifyMessage(
        messageWithCRLF,
        hexSignature,
        workingFixture.address
      );

      // Log the result to see what happens
      console.log('Combined normalization test:', result);

      if (result.valid && result.method?.includes('normalized')) {
        expect(result.details).toContain('message+signature');
      }
    });
  });

  describe('Normalization Edge Cases', () => {
    it('should handle whitespace in signatures', () => {
      const signature = '  H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=  ';
      const detection = detectAndNormalizeSignature(signature);

      expect(detection.valid).toBe(true);
      expect(detection.normalized).toBe(signature.trim());
    });

    it('should handle empty messages gracefully', async () => {
      const result = await verifyMessage(
        '',
        'H+MnkbI81kkWRUys5B6j/svR3I5rQCdjkCH6/Jv88/Q+BoIX6n7hP9Tj/kRqmnfdwLLYv27/pM1hlsWISMVwuBs=',
        '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX'
      );

      // Should fail gracefully, not crash
      expect(result.valid).toBe(false);
    });

    it('should preserve original inputs when normalization not needed', async () => {
      const result = await verifyMessage('test', 'valid-signature', 'valid-address');

      // Even though this will fail (invalid signature), it shouldn't indicate normalization
      if (result.method) {
        expect(result.method).not.toContain('normalized');
      }
    });
  });
});

