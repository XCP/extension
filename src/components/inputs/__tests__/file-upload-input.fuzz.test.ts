/**
 * Fuzz tests for File Upload components
 * Tests file handling, size limits, MIME type detection, and base64 encoding
 */
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadInput, InscriptionUploadInput } from '../file-upload-input';

describe('File Upload Input Fuzz Tests', () => {
  describe('File size validation', () => {
    it('should handle files of various sizes correctly', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.nat({ max: 1024 * 1024 }), // File size in bytes (up to 1MB)
            fc.nat({ min: 1, max: 500 })   // Max size limit in KB
          ),
          ([fileSize, maxSizeKB]) => {
            const mockOnChange = vi.fn();
            const { container } = render(
              <FileUploadInput
                label="Test Upload"
                selectedFile={null}
                onFileChange={mockOnChange}
                maxSizeKB={maxSizeKB}
                error={null}
                disabled={false}
              />
            );

            const input = container.querySelector('input[type="file"]');
            if (!input) return;

            // Create a file with random content
            const content = new Uint8Array(fileSize);
            const file = new File([content], 'test.txt', { type: 'text/plain' });

            // Simulate file selection
            Object.defineProperty(input, 'files', {
              value: [file],
              writable: false
            });

            fireEvent.change(input);

            // File should be rejected if it exceeds the limit
            const expectedValid = fileSize <= maxSizeKB * 1024;
            
            if (!expectedValid) {
              // Should not call onChange for oversized files
              expect(mockOnChange).not.toHaveBeenCalledWith(file);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case file sizes', () => {
      const edgeCases = [
        0,                    // Empty file
        1,                    // 1 byte
        400 * 1024 - 1,      // Just under limit
        400 * 1024,          // Exactly at limit
        400 * 1024 + 1,      // Just over limit
        Number.MAX_SAFE_INTEGER // Extremely large
      ];

      edgeCases.forEach(size => {
        const mockOnChange = vi.fn();
        const { container } = render(
          <FileUploadInput
            label="Test Upload"
            selectedFile={null}
            onFileChange={mockOnChange}
            maxSizeKB={400}
            error={null}
            disabled={false}
          />
        );

        const input = container.querySelector('input[type="file"]');
        if (!input) return;

        // Create file with specified size (cap at reasonable size for testing)
        const actualSize = Math.min(size, 1024 * 1024); // Cap at 1MB for testing
        const content = new Uint8Array(actualSize);
        const file = new File([content], 'test.bin', { type: 'application/octet-stream' });

        Object.defineProperty(input, 'files', {
          value: [file],
          writable: false
        });

        expect(() => {
          fireEvent.change(input);
        }).not.toThrow();
      });
    });
  });

  describe('MIME type handling', () => {
    it('should handle various MIME types without crashing', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Common MIME types
            fc.constantFrom(
              'text/plain',
              'text/html',
              'text/csv',
              'application/json',
              'application/pdf',
              'image/png',
              'image/jpeg',
              'image/gif',
              'image/svg+xml',
              'video/mp4',
              'audio/mpeg',
              'application/octet-stream'
            ),
            // Random strings as MIME types
            fc.string(),
            // Malformed MIME types
            fc.constantFrom(
              '',
              ' ',
              'text/',
              '/plain',
              'text//plain',
              'text/plain; charset=utf-8',
              'text/plain\x00',
              '../../../etc/passwd',
              '<script>alert(1)</script>'
            )
          ),
          (mimeType) => {
            const mockOnChange = vi.fn();
            const { container } = render(
              <InscriptionUploadInput
                selectedFile={null}
                onFileChange={mockOnChange}
                maxSizeKB={400}
                error={null}
                disabled={false}
                required={false}
                showHelpText={false}
              />
            );

            const input = container.querySelector('input[type="file"]');
            if (!input) return;

            const file = new File(['test content'], 'test.file', { type: mimeType });

            Object.defineProperty(input, 'files', {
              value: [file],
              writable: false
            });

            expect(() => {
              fireEvent.change(input);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect MIME types correctly for inscription uploads', () => {
      const mimeTests = [
        { ext: 'txt', mime: 'text/plain' },
        { ext: 'html', mime: 'text/html' },
        { ext: 'json', mime: 'application/json' },
        { ext: 'png', mime: 'image/png' },
        { ext: 'jpg', mime: 'image/jpeg' },
        { ext: 'gif', mime: 'image/gif' },
        { ext: 'pdf', mime: 'application/pdf' },
        { ext: 'mp3', mime: 'audio/mpeg' },
        { ext: 'mp4', mime: 'video/mp4' }
      ];

      mimeTests.forEach(({ ext, mime }) => {
        const mockOnChange = vi.fn();
        const { container } = render(
          <InscriptionUploadInput
            selectedFile={null}
            onFileChange={mockOnChange}
            maxSizeKB={400}
            error={null}
            disabled={false}
            required={false}
            showHelpText={false}
          />
        );

        const input = container.querySelector('input[type="file"]');
        if (!input) return;

        const file = new File(['content'], `test.${ext}`, { type: mime });

        Object.defineProperty(input, 'files', {
          value: [file],
          writable: false
        });

        fireEvent.change(input);

        // Should accept the file with proper MIME type
        expect(mockOnChange).toHaveBeenCalledWith(file);
      });
    });
  });

  describe('File name handling', () => {
    it('should handle various file names safely', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Normal file names
            fc.string({ minLength: 1, maxLength: 255 }).map(s => `${s}.txt`),
            // File names with special characters
            fc.constantFrom(
              'file with spaces.txt',
              'file-with-dashes.txt',
              'file_with_underscores.txt',
              'file.multiple.dots.txt',
              '文件.txt',  // Unicode
              'файл.txt',  // Cyrillic
              '🎨.txt',    // Emoji
              '.hidden.txt',
              'file.',
              'file',      // No extension
              ''           // Empty
            ),
            // Injection attempts in file names
            fc.constantFrom(
              '../../../etc/passwd',
              '..\\..\\..\\windows\\system32\\config\\sam',
              'file<script>.txt',
              'file">alert(1).txt',
              'file\x00.txt',
              'file\n.txt',
              'file\r\n.txt',
              '%00file.txt',
              'file%20.txt',
              'file%2e%2e%2f.txt'
            )
          ),
          (fileName) => {
            const mockOnChange = vi.fn();
            const { container } = render(
              <FileUploadInput
                label="Test Upload"
                selectedFile={null}
                onFileChange={mockOnChange}
                maxSizeKB={400}
                error={null}
                disabled={false}
              />
            );

            const input = container.querySelector('input[type="file"]');
            if (!input) return;

            // Create file with potentially malicious name
            const file = new File(['content'], fileName, { type: 'text/plain' });

            Object.defineProperty(input, 'files', {
              value: [file],
              writable: false
            });

            expect(() => {
              fireEvent.change(input);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle extremely long file names', () => {
      fc.assert(
        fc.property(
          fc.nat({ min: 256, max: 10000 }),
          (length) => {
            const mockOnChange = vi.fn();
            const { container } = render(
              <FileUploadInput
                label="Test Upload"
                selectedFile={null}
                onFileChange={mockOnChange}
                maxSizeKB={400}
                error={null}
                disabled={false}
              />
            );

            const input = container.querySelector('input[type="file"]');
            if (!input) return;

            const longName = 'a'.repeat(length) + '.txt';
            const file = new File(['content'], longName, { type: 'text/plain' });

            Object.defineProperty(input, 'files', {
              value: [file],
              writable: false
            });

            expect(() => {
              fireEvent.change(input);
            }).not.toThrow();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Binary content handling', () => {
    it('should handle various binary patterns', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 1, maxLength: 1024 }),
          (content) => {
            const mockOnChange = vi.fn();
            const { container } = render(
              <InscriptionUploadInput
                selectedFile={null}
                onFileChange={mockOnChange}
                maxSizeKB={400}
                error={null}
                disabled={false}
                required={false}
                showHelpText={false}
              />
            );

            const input = container.querySelector('input[type="file"]');
            if (!input) return;

            const file = new File([content], 'binary.dat', { 
              type: 'application/octet-stream' 
            });

            Object.defineProperty(input, 'files', {
              value: [file],
              writable: false
            });

            expect(() => {
              fireEvent.change(input);
            }).not.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle files with null bytes and control characters', () => {
      const problematicContent = [
        new Uint8Array([0, 0, 0, 0]), // Null bytes
        new Uint8Array([0xFF, 0xFE, 0xFD]), // High bytes
        new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]), // Control chars
        new Uint8Array([0x7F, 0x80, 0x81]), // DEL and extended ASCII
        new Uint8Array([0xEF, 0xBB, 0xBF]), // UTF-8 BOM
        new Uint8Array([0xFF, 0xD8, 0xFF]), // JPEG magic bytes
        new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // ZIP magic bytes
      ];

      problematicContent.forEach(content => {
        const mockOnChange = vi.fn();
        const { container } = render(
          <FileUploadInput
            label="Test Upload"
            selectedFile={null}
            onFileChange={mockOnChange}
            maxSizeKB={400}
            error={null}
            disabled={false}
          />
        );

        const input = container.querySelector('input[type="file"]');
        if (!input) return;

        const file = new File([content], 'test.bin', { 
          type: 'application/octet-stream' 
        });

        Object.defineProperty(input, 'files', {
          value: [file],
          writable: false
        });

        expect(() => {
          fireEvent.change(input);
        }).not.toThrow();
      });
    });
  });

  describe('Base64 encoding for inscriptions', () => {
    it('should properly encode various content types to base64', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1024 }),
          async (content) => {
            // Test that content can be converted to base64 without loss
            const blob = new Blob([content]);
            const reader = new FileReader();
            
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
            });
            
            reader.readAsDataURL(blob);
            const base64 = await base64Promise;
            
            // Verify base64 is valid
            expect(() => {
              atob(base64);
            }).not.toThrow();
            
            // Verify roundtrip
            const decoded = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            expect(decoded).toEqual(content);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Multiple file handling', () => {
    it('should handle multiple file selection attempts', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              size: fc.nat({ max: 500 * 1024 }),
              type: fc.constantFrom('text/plain', 'image/png', 'application/json')
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (fileSpecs) => {
            const mockOnChange = vi.fn();
            const { container } = render(
              <FileUploadInput
                label="Test Upload"
                selectedFile={null}
                onFileChange={mockOnChange}
                maxSizeKB={400}
                error={null}
                disabled={false}
              />
            );

            const input = container.querySelector('input[type="file"]');
            if (!input) return;

            fileSpecs.forEach(spec => {
              const content = new Uint8Array(spec.size);
              const file = new File([content], spec.name, { type: spec.type });

              Object.defineProperty(input, 'files', {
                value: [file],
                writable: false
              });

              expect(() => {
                fireEvent.change(input);
              }).not.toThrow();
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});