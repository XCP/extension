import { describe, it, expect } from 'vitest';
import {
  validateSignatureJson,
  validateJsonText,
  parseAndValidateSignatureJson,
  SIGNATURE_JSON_LIMITS,
  type SignatureJson,
} from '../signatureJson';

describe('signatureJson validation', () => {
  describe('validateJsonText', () => {
    it('should accept valid JSON text within size limits', () => {
      const result = validateJsonText('{"address": "test"}');
      expect(result.valid).toBe(true);
    });

    it('should reject empty text', () => {
      const result = validateJsonText('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only text', () => {
      const result = validateJsonText('   \n\t  ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject text exceeding max file size', () => {
      const largeText = 'x'.repeat(SIGNATURE_JSON_LIMITS.MAX_FILE_SIZE + 1);
      const result = validateJsonText(largeText);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('validateSignatureJson', () => {
    const validData: SignatureJson = {
      address: 'bc1qtest123',
      message: 'Hello, world!',
      signature: 'H1234567890abcdef',
    };

    it('should accept valid signature JSON', () => {
      const result = validateSignatureJson(validData);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should accept valid signature JSON with optional timestamp', () => {
      const dataWithTimestamp = {
        ...validData,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = validateSignatureJson(dataWithTimestamp);
      expect(result.valid).toBe(true);
      expect(result.data?.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    describe('type validation', () => {
      it('should reject null', () => {
        const result = validateSignatureJson(null);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expected an object');
      });

      it('should reject arrays', () => {
        const result = validateSignatureJson([validData]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expected an object');
      });

      it('should reject primitives', () => {
        expect(validateSignatureJson('string').valid).toBe(false);
        expect(validateSignatureJson(123).valid).toBe(false);
        expect(validateSignatureJson(true).valid).toBe(false);
      });
    });

    describe('required fields', () => {
      it('should reject missing address', () => {
        const { address, ...dataWithoutAddress } = validData;
        const result = validateSignatureJson(dataWithoutAddress);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('address');
      });

      it('should reject missing message', () => {
        const { message, ...dataWithoutMessage } = validData;
        const result = validateSignatureJson(dataWithoutMessage);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('message');
      });

      it('should reject missing signature', () => {
        const { signature, ...dataWithoutSignature } = validData;
        const result = validateSignatureJson(dataWithoutSignature);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('signature');
      });

      it('should reject empty address', () => {
        const result = validateSignatureJson({ ...validData, address: '' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot be empty');
      });

      it('should reject whitespace-only address', () => {
        const result = validateSignatureJson({ ...validData, address: '   ' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot be empty');
      });

      it('should reject empty message', () => {
        const result = validateSignatureJson({ ...validData, message: '' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot be empty');
      });

      it('should reject empty signature', () => {
        const result = validateSignatureJson({ ...validData, signature: '' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot be empty');
      });
    });

    describe('field type validation', () => {
      it('should reject non-string address', () => {
        const result = validateSignatureJson({ ...validData, address: 123 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('should reject non-string message', () => {
        const result = validateSignatureJson({ ...validData, message: { text: 'hi' } });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('should reject non-string signature', () => {
        const result = validateSignatureJson({ ...validData, signature: ['sig'] });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('should reject non-string timestamp', () => {
        const result = validateSignatureJson({ ...validData, timestamp: 1234567890 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a string');
      });
    });

    describe('field length limits', () => {
      it('should reject address exceeding max length', () => {
        const longAddress = 'a'.repeat(SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH + 1);
        const result = validateSignatureJson({ ...validData, address: longAddress });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum length');
      });

      it('should accept address at max length', () => {
        const maxAddress = 'a'.repeat(SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH);
        const result = validateSignatureJson({ ...validData, address: maxAddress });
        expect(result.valid).toBe(true);
      });

      it('should reject message exceeding max length', () => {
        const longMessage = 'm'.repeat(SIGNATURE_JSON_LIMITS.MAX_MESSAGE_LENGTH + 1);
        const result = validateSignatureJson({ ...validData, message: longMessage });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum length');
      });

      it('should accept message at max length', () => {
        const maxMessage = 'm'.repeat(SIGNATURE_JSON_LIMITS.MAX_MESSAGE_LENGTH);
        const result = validateSignatureJson({ ...validData, message: maxMessage });
        expect(result.valid).toBe(true);
      });

      it('should reject signature exceeding max length', () => {
        const longSignature = 's'.repeat(SIGNATURE_JSON_LIMITS.MAX_SIGNATURE_LENGTH + 1);
        const result = validateSignatureJson({ ...validData, signature: longSignature });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum length');
      });

      it('should reject timestamp exceeding max length', () => {
        const longTimestamp = 't'.repeat(SIGNATURE_JSON_LIMITS.MAX_TIMESTAMP_LENGTH + 1);
        const result = validateSignatureJson({ ...validData, timestamp: longTimestamp });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum length');
      });
    });

    describe('unexpected fields', () => {
      it('should reject objects with unexpected fields', () => {
        const dataWithExtra = {
          ...validData,
          privateKey: 'should-not-be-here',
        };
        const result = validateSignatureJson(dataWithExtra);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unexpected fields');
        expect(result.error).toContain('privateKey');
      });

      it('should reject multiple unexpected fields', () => {
        const dataWithExtras = {
          ...validData,
          foo: 'bar',
          baz: 123,
        };
        const result = validateSignatureJson(dataWithExtras);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('foo');
        expect(result.error).toContain('baz');
      });
    });
  });

  describe('parseAndValidateSignatureJson', () => {
    it('should parse and validate valid JSON', () => {
      const json = JSON.stringify({
        address: 'bc1qtest',
        message: 'test message',
        signature: 'testsig',
      });
      const result = parseAndValidateSignatureJson(json);
      expect(result.valid).toBe(true);
      expect(result.data?.address).toBe('bc1qtest');
    });

    it('should reject invalid JSON syntax', () => {
      const result = parseAndValidateSignatureJson('{ invalid json }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should reject JSON that parses but fails validation', () => {
      const json = JSON.stringify({ address: 123 }); // wrong type
      const result = parseAndValidateSignatureJson(json);
      expect(result.valid).toBe(false);
    });

    it('should reject empty input', () => {
      const result = parseAndValidateSignatureJson('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject oversized input', () => {
      const oversized = '{' + ' '.repeat(SIGNATURE_JSON_LIMITS.MAX_FILE_SIZE) + '}';
      const result = parseAndValidateSignatureJson(oversized);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('security scenarios', () => {
    it('should be safe from prototype pollution because we only extract known fields', () => {
      // __proto__ in object literals doesn't become an enumerable key in modern JS
      // Our validation is safe because we only extract specific fields (address, message, signature, timestamp)
      // and don't iterate or spread the object
      const malicious = {
        address: 'test',
        message: 'test',
        signature: 'test',
        __proto__: { isAdmin: true },
      };
      const result = validateSignatureJson(malicious);
      // This passes validation because __proto__ isn't enumerable
      // But our extraction is safe - we only get the fields we explicitly ask for
      expect(result.valid).toBe(true);
      expect(result.data?.address).toBe('test');
      // Verify no pollution occurred
      expect((result.data as any).isAdmin).toBeUndefined();
    });

    it('should not allow constructor pollution', () => {
      const malicious = {
        address: 'test',
        message: 'test',
        signature: 'test',
        constructor: { prototype: {} },
      };
      const result = validateSignatureJson(malicious);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unexpected fields');
    });

    it('should handle deeply nested objects in fields', () => {
      const nested = {
        address: { nested: { deep: 'value' } },
        message: 'test',
        signature: 'test',
      };
      const result = validateSignatureJson(nested);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('should handle arrays in fields', () => {
      const withArray = {
        address: ['addr1', 'addr2'],
        message: 'test',
        signature: 'test',
      };
      const result = validateSignatureJson(withArray);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });
  });
});
