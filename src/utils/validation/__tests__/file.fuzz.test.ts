/**
 * Fuzz tests for file upload validation
 * Tests for path traversal, MIME spoofing, and malicious content
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateFileSize,
  validateFileType,
  validateFileName,
  sanitizeFileName,
  validateFileExtension,
  detectMaliciousContent,
  validateFile,
  fileToBase64
} from '../file';

describe('File Upload Security Tests', () => {
  describe('validateFileSize', () => {
    it('should handle arbitrary file sizes without crashing', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 100000000 }),
          fc.integer({ min: 1, max: 10000 }),
          (size, maxKB) => {
            const file = { size };
            expect(() => {
              validateFileSize(file, maxKB);
            }).not.toThrow();
            
            const result = validateFileSize(file, maxKB);
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should reject files over size limit', () => {
      const testCases = [
        { size: 1024 * 101, maxKB: 100, shouldPass: false },
        { size: 1024 * 100, maxKB: 100, shouldPass: true },
        { size: 1024 * 99, maxKB: 100, shouldPass: true },
        { size: 0, maxKB: 100, shouldPass: false }, // Empty file
        { size: -1, maxKB: 100, shouldPass: false }, // Invalid size
      ];

      testCases.forEach(({ size, maxKB, shouldPass }) => {
        const result = validateFileSize({ size }, maxKB);
        expect(result.isValid).toBe(shouldPass);
      });
    });

    it('should reject extremely large files', () => {
      const hugeFile = { size: 100 * 1024 * 1024 }; // 100MB
      const result = validateFileSize(hugeFile, 1000);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('safety limit');
    });
  });

  describe('validateFileType', () => {
    it('should validate MIME types correctly', () => {
      const validCases = [
        { type: 'text/csv', allowed: ['text/csv'], shouldPass: true },
        { type: 'image/png', allowed: ['image/*'], shouldPass: true },
        { type: 'image/jpeg', allowed: ['image/*'], shouldPass: true },
        { type: 'text/plain', allowed: ['text/plain', 'text/csv'], shouldPass: true },
      ];

      validCases.forEach(({ type, allowed, shouldPass }) => {
        const result = validateFileType({ type }, allowed);
        expect(result.isValid).toBe(shouldPass);
      });
    });

    it('should reject dangerous MIME types', () => {
      const dangerousTypes = [
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-executable',
        'application/x-sharedlib',
      ];

      dangerousTypes.forEach(type => {
        const result = validateFileType({ type }, ['*/*']); // Even with wildcard
        expect(result.isValid).toBe(false);
      });
    });

    it('should handle case insensitivity', () => {
      const result1 = validateFileType({ type: 'TEXT/CSV' }, ['text/csv']);
      expect(result1.isValid).toBe(true);
      
      const result2 = validateFileType({ type: 'text/csv' }, ['TEXT/CSV']);
      expect(result2.isValid).toBe(true);
    });

    it('should handle arbitrary MIME types safely', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (type) => {
            expect(() => {
              validateFileType({ type }, ['text/csv']);
            }).not.toThrow();
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('validateFileName', () => {
    it('should detect path traversal attempts', () => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        'file.txt/../../../etc/shadow',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f',
        '..;/etc/passwd',
        '..%00/etc/passwd',
        '..%01/etc/passwd',
        'file.txt\x00.jpg', // Null byte injection
      ];

      maliciousNames.forEach(name => {
        const result = validateFileName(name);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('traversal');
      });
    });

    it('should reject Windows reserved names', () => {
      const reservedNames = [
        'CON', 'con', 'Con.txt',
        'PRN', 'prn.csv',
        'AUX', 'aux.json',
        'NUL', 'nul.txt',
        'COM1', 'com1.exe',
        'LPT1', 'lpt1.bat',
      ];

      reservedNames.forEach(name => {
        const result = validateFileName(name);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Reserved');
      });
    });

    it('should sanitize filenames properly', () => {
      // Test that sanitization happens correctly
      const result1 = validateFileName('normal_file.txt');
      expect(result1.isValid).toBe(true);
      expect(result1.sanitizedName).toBe('normal_file.txt');
      
      const result2 = validateFileName('file|name?.txt');
      expect(result2.isValid).toBe(true);
      expect(result2.sanitizedName).toBe('file_name_.txt');
    });

    it('should handle arbitrary filenames without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (filename) => {
            expect(() => {
              validateFileName(filename);
            }).not.toThrow();
            
            const result = validateFileName(filename);
            expect(result).toHaveProperty('isValid');
            
            if (result.isValid && result.sanitizedName) {
              // Sanitized name should not contain dangerous characters
              expect(result.sanitizedName).not.toContain('..');
              expect(result.sanitizedName).not.toContain('\x00');
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = validateFileName(longName);
      
      if (result.isValid && result.sanitizedName) {
        expect(result.sanitizedName.length).toBeLessThanOrEqual(204); // 200 + .txt
      }
    });
  });

  describe('sanitizeFileName', () => {
    it('should always return safe filenames', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            const sanitized = sanitizeFileName(input);
            
            // Should never be empty
            expect(sanitized.length).toBeGreaterThan(0);
            
            // Should not contain path separators
            expect(sanitized).not.toContain('/');
            expect(sanitized).not.toContain('\\');
            
            // Should not contain null bytes
            expect(sanitized).not.toContain('\x00');
            
            // Should not start or end with dots
            expect(sanitized[0]).not.toBe('.');
            expect(sanitized[sanitized.length - 1]).not.toBe('.');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle edge cases', () => {
      expect(sanitizeFileName('')).toBe('unnamed');
      expect(sanitizeFileName('   ')).toBe('unnamed');
      expect(sanitizeFileName('...')).toBe('unnamed');
      expect(sanitizeFileName('___')).toBe('_');
      expect(sanitizeFileName('\x00\x01\x02')).toBe('unnamed');
    });
  });

  describe('validateFileExtension', () => {
    it('should validate extensions correctly', () => {
      const testCases = [
        { filename: 'file.csv', allowed: ['.csv'], shouldPass: true },
        { filename: 'file.CSV', allowed: ['.csv'], shouldPass: true },
        { filename: 'file.txt', allowed: ['.csv'], shouldPass: false },
        { filename: 'file', allowed: ['.csv'], shouldPass: false },
        { filename: 'file.tar.gz', allowed: ['.gz'], shouldPass: true },
      ];

      testCases.forEach(({ filename, allowed, shouldPass }) => {
        const result = validateFileExtension(filename, allowed);
        expect(result.isValid).toBe(shouldPass);
      });
    });

    it('should detect double extension attacks', () => {
      const maliciousNames = [
        'malware.php.png',
        'shell.exe.jpg',
        'backdoor.asp.gif',
        'exploit.jsp.jpeg',
      ];

      maliciousNames.forEach(name => {
        const result = validateFileExtension(name, ['.png', '.jpg', '.gif', '.jpeg']);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('double extension');
      });
    });

    it('should handle extensions with and without dots', () => {
      const result1 = validateFileExtension('file.csv', ['csv']);
      expect(result1.isValid).toBe(true);
      
      const result2 = validateFileExtension('file.csv', ['.csv']);
      expect(result2.isValid).toBe(true);
    });
  });

  describe('detectMaliciousContent', () => {
    it('should detect script injection in text files', async () => {
      const maliciousContents = [
        '<script>alert("XSS")</script>',
        'data:text/html,<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src="evil.com"></iframe>',
        '<?php system($_GET["cmd"]); ?>',
        '<% Response.Write("ASP") %>',
        'javascript:alert(1)',
      ];

      for (const content of maliciousContents) {
        const blob = new Blob([content], { type: 'text/plain' });
        const file = new File([blob], 'test.txt', { type: 'text/plain' });
        
        const result = await detectMaliciousContent(file);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('malicious');
      }
    });

    it('should allow safe text content', async () => {
      const safeContents = [
        'address,asset,quantity\n1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,XCP,100',
        'Hello, World!',
        'function test() { return 42; }', // Code without script tags
        'https://example.com',
      ];

      for (const content of safeContents) {
        const blob = new Blob([content], { type: 'text/csv' });
        const file = new File([blob], 'test.csv', { type: 'text/csv' });
        
        const result = await detectMaliciousContent(file);
        expect(result.isValid).toBe(true);
      }
    });

    it('should skip binary files', async () => {
      const binaryData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header
      const file = new File([binaryData], 'image.jpg', { type: 'image/jpeg' });
      
      const result = await detectMaliciousContent(file);
      expect(result.isValid).toBe(true); // Should skip validation
    });
  });

  describe('validateFile - Comprehensive', () => {
    it('should validate complete file upload', async () => {
      const content = 'address,asset,quantity\n1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,XCP,100';
      const blob = new Blob([content], { type: 'text/csv' });
      const file = new File([blob], 'valid.csv', { type: 'text/csv' });
      
      const result = await validateFile(file, {
        maxSizeKB: 100,
        allowedTypes: ['text/csv'],
        allowedExtensions: ['.csv'],
        detectMaliciousPatterns: true,
      });
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedName).toBe('valid.csv');
    });

    it('should reject malicious files', async () => {
      // Path traversal in filename
      const file1 = new File(['test'], '../../../etc/passwd', { type: 'text/plain' });
      const result1 = await validateFile(file1);
      expect(result1.isValid).toBe(false);

      // Script content
      const file2 = new File(['<script>alert(1)</script>'], 'test.html', { type: 'text/html' });
      const result2 = await validateFile(file2, { detectMaliciousPatterns: true });
      expect(result2.isValid).toBe(false);

      // Wrong extension
      const file3 = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
      const result3 = await validateFile(file3, { allowedExtensions: ['.csv'] });
      expect(result3.isValid).toBe(false);
    });

    it('should handle various file properties safely', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.string(),
          fc.integer({ min: 0, max: 10000 }),
          async (filename, type, size) => {
            const content = 'test content';
            const blob = new Blob([content], { type });
            
            // Create file with fuzzed properties
            const file = new File([blob], filename, { type });
            Object.defineProperty(file, 'size', { value: size });
            
            // Should not throw
            let error = null;
            try {
              await validateFile(file);
            } catch (e) {
              error = e;
            }
            expect(error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('fileToBase64', () => {
    it('should convert files to base64', async () => {
      const content = 'Hello, World!';
      const file = new File([content], 'test.txt', { type: 'text/plain' });
      
      const base64 = await fileToBase64(file);
      
      // Decode and verify
      const decoded = atob(base64);
      expect(decoded).toBe(content);
    });

    it('should reject very large files', async () => {
      // Create 11MB file (over the 10MB limit)
      const largeContent = new Uint8Array(11 * 1024 * 1024);
      const file = new File([largeContent], 'large.bin');
      
      await expect(fileToBase64(file)).rejects.toThrow('too large');
    });

    it('should handle various content types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (bytes) => {
            const file = new File([bytes], 'test.bin');
            
            const base64 = await fileToBase64(file);
            
            // Should be valid base64
            expect(() => atob(base64)).not.toThrow();
            
            // Decode and compare
            const decoded = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            expect(decoded).toEqual(bytes);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle empty files', async () => {
      const file = new File([], 'empty.txt');
      
      const sizeResult = validateFileSize(file, 100);
      expect(sizeResult.isValid).toBe(false);
      expect(sizeResult.error).toContain('empty');
    });

    it('should handle files with no extension', () => {
      const result = validateFileExtension('README', ['.md']);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no extension');
    });

    it('should handle Unicode filenames', () => {
      const unicodeNames = [
        '测试文件.csv',
        'файл.txt',
        '🎉emoji.csv',
        'مستند.pdf',
      ];

      unicodeNames.forEach(name => {
        const result = validateFileName(name);
        expect(() => result).not.toThrow();
        
        if (result.isValid && result.sanitizedName) {
          // Should preserve safe Unicode characters
          expect(result.sanitizedName.length).toBeGreaterThan(0);
        }
      });
    });

    it('should validate quickly even with large inputs', () => {
      const longFilename = 'a'.repeat(10000) + '.csv';
      
      const start = Date.now();
      const result = validateFileName(longFilename);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(100);
      expect(result.isValid).toBe(false); // Too long
    });
  });
});