import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateQRCodeText,
  validateQRCodeDimensions,
  validateQRCodeLogo,
  validateQRCodeParams,
  sanitizeQRCodeText,
  estimateQRCodeMemory,
  checkQRCodePerformance,
  QRCodeValidationResult
} from '../qrCode';

describe('QR Code Validation Security Tests', () => {
  describe('validateQRCodeText', () => {
    it('should accept valid text input', () => {
      const result = validateQRCodeText('Hello World');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject non-string input', () => {
      const result = validateQRCodeText(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code text must be a string');
    });

    it('should reject empty text', () => {
      const result = validateQRCodeText('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code text cannot be empty');

      const result2 = validateQRCodeText('   ');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('QR code text cannot be empty');
    });

    it('should reject text exceeding maximum length', () => {
      const longText = 'a'.repeat(4297);
      const result = validateQRCodeText(longText);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code text exceeds maximum length');
    });

    it('should detect formula injection attempts', () => {
      const injectionAttempts = ['=SUM(1,2)', '@ECHO test', '+1', '-cmd'];
      
      injectionAttempts.forEach(attempt => {
        const result = validateQRCodeText(attempt);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid QR code text format');
      });
    });

    it('should reject null bytes', () => {
      const textWithNullByte = 'Hello\x00World';
      const result = validateQRCodeText(textWithNullByte);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code text contains null bytes');
    });

    it('should warn about control characters', () => {
      const textWithControl = 'Hello\x01World';
      const result = validateQRCodeText(textWithControl);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Text contains control characters');
    });

    it('should warn about long repeating patterns', () => {
      const repeatingText = 'abc'.repeat(101);
      const result = validateQRCodeText(repeatingText);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Text contains long repeating patterns');
    });

    it('should validate URLs for security', () => {
      const dangerousUrl = 'javascript:alert(1)';
      const result = validateQRCodeText(dangerousUrl);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Dangerous protocol detected in QR code URL');
    });

    it('should warn about private network URLs', () => {
      const privateUrl = 'http://localhost:8080/api';
      const result = validateQRCodeText(privateUrl);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('QR code contains local/private network URL');
    });

    it('should warn about URL shorteners', () => {
      const shortUrl = 'https://bit.ly/shortlink';
      const result = validateQRCodeText(shortUrl);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('QR code contains URL shortener');
    });

    it('should detect private data patterns', () => {
      const privateKey = '5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS';
      const result = validateQRCodeText(privateKey);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Text may contain private information');
    });

    // Fuzz testing for text validation
    it('should handle random strings safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        (text) => {
          const result = validateQRCodeText(text);
          expect(typeof result.isValid).toBe('boolean');
          if (result.error) {
            expect(typeof result.error).toBe('string');
          }
          if (result.warnings) {
            expect(Array.isArray(result.warnings)).toBe(true);
          }
        }
      ), { numRuns: 200 });
    });

    it('should handle Unicode characters safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (text) => {
          const result = validateQRCodeText(text);
          expect(typeof result.isValid).toBe('boolean');
          // Should not crash on any Unicode input
          expect(result).toBeDefined();
        }
      ), { numRuns: 100 });
    });

    it('should handle edge cases in URL validation', () => {
      const edgeCaseUrls = [
        'http://127.0.0.1/test',
        'https://192.168.1.1/api',
        'http://10.0.0.1:3000',
        'https://172.16.0.1/path',
        'http://169.254.0.1/link-local',
        'https://example.com/../../../etc/passwd',
        'http://evil.com?redirect=file:///etc/passwd',
        'data:text/html,<script>alert(1)</script>'
      ];

      edgeCaseUrls.forEach(url => {
        const result = validateQRCodeText(url);
        expect(typeof result.isValid).toBe('boolean');
        // Should handle all URL edge cases without crashing
        expect(result).toBeDefined();
      });
    });
  });

  describe('validateQRCodeDimensions', () => {
    it('should accept valid dimensions', () => {
      const result = validateQRCodeDimensions(270);
      expect(result.isValid).toBe(true);
    });

    it('should accept undefined dimensions', () => {
      const result = validateQRCodeDimensions(undefined);
      expect(result.isValid).toBe(true);
    });

    it('should reject non-numeric dimensions', () => {
      const result = validateQRCodeDimensions('270' as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code width must be a number');
    });

    it('should reject non-finite dimensions', () => {
      const result = validateQRCodeDimensions(Infinity);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code width must be finite');

      const result2 = validateQRCodeDimensions(NaN);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('QR code width must be finite');
    });

    it('should reject negative or zero dimensions', () => {
      const result = validateQRCodeDimensions(-1);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code width must be positive');

      const result2 = validateQRCodeDimensions(0);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('QR code width must be positive');
    });

    it('should reject extremely large dimensions', () => {
      const result = validateQRCodeDimensions(10001);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code width too large (memory concern)');
    });

    // Fuzz testing for dimensions
    it('should handle random numeric inputs safely', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.integer(),
          fc.float(),
          fc.constant(Infinity),
          fc.constant(-Infinity),
          fc.constant(NaN)
        ),
        (width) => {
          const result = validateQRCodeDimensions(width);
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(typeof result.error).toBe('string');
          }
        }
      ), { numRuns: 200 });
    });
  });

  describe('validateQRCodeLogo', () => {
    it('should accept valid logo sources', () => {
      const result = validateQRCodeLogo('/assets/logo.png');
      expect(result.isValid).toBe(true);
    });

    it('should accept undefined logo', () => {
      const result = validateQRCodeLogo(undefined);
      expect(result.isValid).toBe(true);
    });

    it('should accept empty string logo', () => {
      const result = validateQRCodeLogo('');
      expect(result.isValid).toBe(true);
    });

    it('should reject non-string logo sources', () => {
      const result = validateQRCodeLogo(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Logo source must be a string');
    });

    it('should reject dangerous protocols', () => {
      const dangerousProtocols = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd'
      ];

      dangerousProtocols.forEach(src => {
        const result = validateQRCodeLogo(src);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Dangerous protocol in logo source');
      });
    });

    it('should reject path traversal attempts', () => {
      const traversalAttempts = [
        '../../../etc/passwd',
        'assets/../../../secret.txt',
        '/assets/%2e%2e/config'
      ];

      traversalAttempts.forEach(src => {
        const result = validateQRCodeLogo(src);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Path traversal detected in logo source');
      });
    });

    it('should validate data URLs properly', () => {
      const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const result = validateQRCodeLogo(validDataUrl);
      expect(result.isValid).toBe(true);

      const invalidDataUrl = 'data:invalid/format';
      const result2 = validateQRCodeLogo(invalidDataUrl);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Invalid data URL format');
    });

    it('should reject unsupported image types in data URLs', () => {
      const unsupportedType = 'data:image/bmp;base64,Qk1GAAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAA/////wAA';
      const result = validateQRCodeLogo(unsupportedType);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported image type in data URL');
    });

    it('should reject oversized data URLs', () => {
      const largeData = 'A'.repeat(1000000);
      const oversizedDataUrl = `data:image/png;base64,${largeData}`;
      const result = validateQRCodeLogo(oversizedDataUrl);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Data URL too large');
    });

    // Fuzz testing for logo sources
    it('should handle random logo source strings safely', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 200 }),
        (logoSrc) => {
          const result = validateQRCodeLogo(logoSrc);
          expect(typeof result.isValid).toBe('boolean');
          if (result.error) {
            expect(typeof result.error).toBe('string');
          }
        }
      ), { numRuns: 150 });
    });
  });

  describe('sanitizeQRCodeText', () => {
    it('should sanitize control characters', () => {
      const textWithControl = 'Hello\x01\x02World\x7F';
      const sanitized = sanitizeQRCodeText(textWithControl);
      expect(sanitized).toBe('HelloWorld');
    });

    it('should preserve newlines and tabs', () => {
      const textWithWhitespace = 'Hello\n\tWorld';
      const sanitized = sanitizeQRCodeText(textWithWhitespace);
      expect(sanitized).toBe('Hello\n\tWorld');
    });

    it('should remove null bytes', () => {
      const textWithNulls = 'Hello\x00World';
      const sanitized = sanitizeQRCodeText(textWithNulls);
      expect(sanitized).toBe('HelloWorld');
    });

    it('should trim whitespace', () => {
      const textWithWhitespace = '  Hello World  ';
      const sanitized = sanitizeQRCodeText(textWithWhitespace);
      expect(sanitized).toBe('Hello World');
    });

    it('should handle non-string input', () => {
      const result = sanitizeQRCodeText(123 as any);
      expect(result).toBe('');
    });

    // Fuzz testing for sanitization
    it('should safely sanitize random strings', () => {
      fc.assert(fc.property(
        fc.string({ maxLength: 1000 }),
        (text) => {
          const sanitized = sanitizeQRCodeText(text);
          expect(typeof sanitized).toBe('string');
          // Should not contain control characters (except \n and \t)
          expect(sanitized).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
        }
      ), { numRuns: 200 });
    });
  });

  describe('validateQRCodeParams', () => {
    it('should validate all parameters together', () => {
      const result = validateQRCodeParams('Hello World', 270, '/logo.png');
      expect(result.isValid).toBe(true);
    });

    it('should fail if text validation fails', () => {
      const result = validateQRCodeParams('', 270);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code text cannot be empty');
    });

    it('should fail if dimensions validation fails', () => {
      const result = validateQRCodeParams('Hello', -1);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('QR code width must be positive');
    });

    it('should fail if logo validation fails', () => {
      const result = validateQRCodeParams('Hello', 270, 'javascript:alert(1)');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Dangerous protocol in logo source');
    });

    it('should combine warnings from all validations', () => {
      const result = validateQRCodeParams('http://localhost/api', 270);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('QR code contains local/private network URL');
    });

    // Fuzz testing for complete parameter validation
    it('should handle random parameter combinations safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.option(fc.integer({ min: 1, max: 5000 })),
        fc.option(fc.string({ maxLength: 100 })),
        (text, width, logoSrc) => {
          const result = validateQRCodeParams(text, width ?? undefined, logoSrc ?? undefined);
          expect(typeof result.isValid).toBe('boolean');
          expect(result).toBeDefined();
        }
      ), { numRuns: 100 });
    });
  });

  describe('estimateQRCodeMemory', () => {
    it('should estimate memory usage for text and dimensions', () => {
      const memory = estimateQRCodeMemory('Hello World', 270);
      expect(memory).toBeGreaterThan(0);
      expect(typeof memory).toBe('number');
    });

    it('should use default width when not provided', () => {
      const memory = estimateQRCodeMemory('Hello World');
      expect(memory).toBeGreaterThan(0);
    });

    it('should scale memory with text length', () => {
      const shortMemory = estimateQRCodeMemory('Hi', 100);
      const longMemory = estimateQRCodeMemory('This is a much longer text', 100);
      expect(longMemory).toBeGreaterThan(shortMemory);
    });

    it('should scale memory with width', () => {
      const smallMemory = estimateQRCodeMemory('Hello', 100);
      const largeMemory = estimateQRCodeMemory('Hello', 500);
      expect(largeMemory).toBeGreaterThan(smallMemory);
    });

    // Fuzz testing for memory estimation
    it('should estimate memory safely for random inputs', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        fc.integer({ min: 50, max: 2000 }),
        (text, width) => {
          const memory = estimateQRCodeMemory(text, width);
          expect(memory).toBeGreaterThan(0);
          expect(Number.isFinite(memory)).toBe(true);
        }
      ), { numRuns: 100 });
    });
  });

  describe('checkQRCodePerformance', () => {
    it('should identify performance issues', () => {
      const largeText = 'a'.repeat(3000);
      const result = checkQRCodePerformance(largeText, 1500);
      
      expect(result.hasIssues).toBe(true);
      expect(result.warnings).toContain('Large QR code size may impact performance');
      expect(result.warnings).toContain('Long text may slow QR code generation');
      expect(result.estimatedMemory).toBeGreaterThan(0);
    });

    it('should detect memory concerns', () => {
      const result = checkQRCodePerformance('test', 5000);
      expect(result.hasIssues).toBe(true);
      expect(result.warnings).toContain('QR code generation may use excessive memory');
    });

    it('should detect Unicode performance issues', () => {
      const unicodeText = '🔥'.repeat(150);
      const result = checkQRCodePerformance(unicodeText, 270);
      expect(result.hasIssues).toBe(true);
      expect(result.warnings).toContain('Many Unicode characters may impact performance');
    });

    it('should pass for reasonable inputs', () => {
      const result = checkQRCodePerformance('Hello World', 270);
      expect(result.hasIssues).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    // Fuzz testing for performance checking
    it('should check performance safely for random inputs', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.integer({ min: 50, max: 1000 }),
        (text, width) => {
          const result = checkQRCodePerformance(text, width);
          expect(typeof result.hasIssues).toBe('boolean');
          expect(Array.isArray(result.warnings)).toBe(true);
          expect(typeof result.estimatedMemory).toBe('number');
        }
      ), { numRuns: 100 });
    });
  });

  describe('Injection Attack Prevention', () => {
    it('should prevent CSV injection in QR text', () => {
      const csvInjections = [
        '=1+1+cmd|"/c calc"!A0',
        '@SUM(1+9)*cmd|"/c calc"!A0',
        '+1+cmd|"/c calc"!A0',
        '-1+cmd|"/c calc"!A0'
      ];

      csvInjections.forEach(injection => {
        const result = validateQRCodeText(injection);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid QR code text format');
      });
    });

    it('should prevent XSS in data URLs', () => {
      const xssAttempts = [
        'data:text/html,<script>alert("XSS")</script>',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4='
      ];

      xssAttempts.forEach(attempt => {
        const result = validateQRCodeLogo(attempt);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('ReDoS Prevention', () => {
    it('should handle pathological regex inputs safely', () => {
      const pathologicalInputs = [
        'a'.repeat(10000),
        'ab'.repeat(5000),
        'abc'.repeat(3333),
        '1234567890'.repeat(1000)
      ];

      pathologicalInputs.forEach(input => {
        const startTime = Date.now();
        const result = validateQRCodeText(input);
        const endTime = Date.now();
        
        // Should complete within reasonable time (< 1 second)
        expect(endTime - startTime).toBeLessThan(1000);
        expect(typeof result.isValid).toBe('boolean');
      });
    });

    it('should detect and warn about long repeating patterns', () => {
      const repeatingPattern = 'abc'.repeat(200);
      const result = validateQRCodeText(repeatingPattern);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Text contains long repeating patterns');
    });
  });

  describe('Private Data Detection', () => {
    it('should detect Bitcoin private keys', () => {
      const testCases = [
        {
          text: '5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS',
          shouldDetect: true,
          description: 'WIF private key'
        },
        {
          text: 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ',
          shouldDetect: true,
          description: 'WIF compressed private key'
        },
        {
          text: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          shouldDetect: true,
          description: '64 hex characters (potential private key)'
        },
        {
          text: 'password: mySecretPassword123',
          shouldDetect: true,
          description: 'Password field'
        },
        {
          text: 'api_key = sk_live_123456789',
          shouldDetect: true,
          description: 'API key'
        },
        {
          text: 'Hello World Bitcoin',
          shouldDetect: false,
          description: 'Normal text'
        }
      ];

      testCases.forEach(({ text, shouldDetect, description }) => {
        const result = validateQRCodeText(text);
        expect(result.isValid).toBe(true);
        
        if (shouldDetect) {
          expect(result.warnings).toContain('Text may contain private information');
        } else {
          expect(result.warnings || []).not.toContain('Text may contain private information');
        }
      });
    });
  });

  describe('Memory Safety', () => {
    it('should prevent excessive memory usage', () => {
      const result = checkQRCodePerformance('test', 8000);
      expect(result.hasIssues).toBe(true);
      expect(result.warnings).toContain('QR code generation may use excessive memory');
    });

    it('should estimate memory accurately', () => {
      const text = 'Hello World';
      const width = 270;
      const memory = estimateQRCodeMemory(text, width);
      
      // Should include text, canvas, matrix, logo, and overhead
      expect(memory).toBeGreaterThan(text.length * 2); // Text memory
      expect(memory).toBeGreaterThan(width * width * 4); // Canvas memory minimum
    });

    it('should handle edge cases in memory estimation', () => {
      const edgeCases = [
        { text: '', width: 1 },
        { text: 'a'.repeat(4000), width: 10000 },
        { text: '🔥'.repeat(100), width: 500 }
      ];

      edgeCases.forEach(({ text, width }) => {
        const memory = estimateQRCodeMemory(text, width);
        expect(memory).toBeGreaterThan(0);
        expect(Number.isFinite(memory)).toBe(true);
      });
    });
  });
});