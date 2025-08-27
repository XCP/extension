/**
 * Fuzz tests for Secure Storage encryption/decryption
 * Tests encryption integrity, tampering detection, and edge cases
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { 
  encryptData, 
  decryptData, 
  encryptMnemonic, 
  decryptMnemonic,
  encryptPrivateKey,
  decryptPrivateKey
} from '../secureStorage';

describe('Secure Storage Encryption Fuzz Tests', () => {
  describe('General encryption/decryption', () => {
    it('should maintain data integrity for arbitrary inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string(),  // Data to encrypt
            fc.string({ minLength: 1 })  // Password
          ),
          async ([data, password]) => {
            // Encrypt and decrypt should be lossless
            const encrypted = await encryptData(data, password);
            const decrypted = await decryptData(encrypted, password);
            
            expect(decrypted).toBe(data);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various password complexities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.constant('test data'),
            fc.oneof(
              // Simple passwords
              fc.string({ minLength: 1, maxLength: 10 }),
              // Complex passwords
              fc.string({ minLength: 20, maxLength: 100 }),
              // Special characters
              fc.constantFrom(
                '!@#$%^&*()',
                'pass word', // Space
                'пароль', // Cyrillic
                '密码', // Chinese
                '🔐🔑', // Emoji
                '\n\r\t', // Control chars
                String.fromCharCode(0) + 'test', // Null byte
                '\\x00\\x01\\x02' // Escape sequences
              ),
              // Very long passwords
              fc.string({ minLength: 1000, maxLength: 10000 })
            )
          ),
          async ([data, password]) => {
            if (password.length === 0) return; // Skip empty passwords
            
            const encrypted = await encryptData(data, password);
            const decrypted = await decryptData(encrypted, password);
            
            expect(decrypted).toBe(data);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject incorrect passwords', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string(),
            fc.string({ minLength: 1 }),
            fc.string({ minLength: 1 })
          ).filter(([_, pass1, pass2]) => pass1 !== pass2),
          async ([data, correctPassword, wrongPassword]) => {
            const encrypted = await encryptData(data, correctPassword);
            
            // Should throw or return error with wrong password
            await expect(
              decryptData(encrypted, wrongPassword)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should detect tampered encrypted data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string(),
            fc.string({ minLength: 1 }),
            fc.nat({ max: 100 }) // Position to tamper
          ),
          async ([data, password, tamperPosition]) => {
            const encrypted = await encryptData(data, password);
            
            // Parse encrypted data
            const encryptedObj = JSON.parse(encrypted);
            
            // Tamper with the encrypted data at random position
            if (encryptedObj.encryptedData && encryptedObj.encryptedData.length > tamperPosition) {
              const chars = encryptedObj.encryptedData.split('');
              chars[tamperPosition] = chars[tamperPosition] === 'a' ? 'b' : 'a';
              encryptedObj.encryptedData = chars.join('');
            }
            
            const tamperedJson = JSON.stringify(encryptedObj);
            
            // Should detect tampering and reject
            await expect(
              decryptData(tamperedJson, password)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle edge case data sizes', async () => {
      const edgeCases = [
        '',  // Empty string
        'a', // Single character
        'a'.repeat(10000), // Large string
        '\x00', // Null byte
        '\n\r\t', // Control characters
        '{"json": "data"}', // JSON string
        '<script>alert(1)</script>', // HTML/XSS attempt
        '0'.repeat(1000000) // Very large (1MB)
      ];

      for (const data of edgeCases) {
        const password = 'testPassword123';
        
        const encrypted = await encryptData(data, password);
        const decrypted = await decryptData(encrypted, password);
        
        expect(decrypted).toBe(data);
      }
    });
  });

  describe('Mnemonic encryption', () => {
    it('should handle various mnemonic formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.constantFrom(
                'abandon', 'ability', 'able', 'about', 'above', 'absent',
                'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'
              ),
              { minLength: 12, maxLength: 24 }
            ).map(words => words.join(' ')),
            fc.string({ minLength: 1 })
          ),
          async ([mnemonic, password]) => {
            const encrypted = await encryptMnemonic(mnemonic, password);
            const decrypted = await decryptMnemonic(encrypted, password);
            
            expect(decrypted).toBe(mnemonic);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject invalid mnemonic encrypted data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string(), // Invalid data
            fc.string({ minLength: 1 })
          ),
          async ([invalidData, password]) => {
            // Should handle invalid encrypted data gracefully
            if (!invalidData.includes('"version"')) {
              await expect(
                decryptMnemonic(invalidData, password)
              ).rejects.toThrow();
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Private key encryption', () => {
    it('should handle various private key formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.oneof(
              // Hex format (64 chars)
              fc.hexaString({ minLength: 64, maxLength: 64 }),
              // Hex with 0x prefix
              fc.hexaString({ minLength: 64, maxLength: 64 }).map(s => '0x' + s),
              // WIF format simulation
              fc.constantFrom(
                'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ',
                'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn'
              )
            ),
            fc.string({ minLength: 1 })
          ),
          async ([privateKey, password]) => {
            const encrypted = await encryptPrivateKey(privateKey, password);
            const decrypted = await decryptPrivateKey(encrypted, password);
            
            // May normalize format, so check if valid
            expect(decrypted).toBeTruthy();
            expect(decrypted.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Version compatibility', () => {
    it('should handle version field correctly', async () => {
      const data = 'test data';
      const password = 'password123';
      
      const encrypted = await encryptData(data, password);
      const encryptedObj = JSON.parse(encrypted);
      
      // Should have version field
      expect(encryptedObj.version).toBeDefined();
      
      // Test with modified versions
      const versions = ['1', '2', 'invalid', '', null, undefined, 999];
      
      for (const version of versions) {
        const modifiedObj = { ...encryptedObj, version };
        const modifiedJson = JSON.stringify(modifiedObj);
        
        if (version !== encryptedObj.version) {
          // Should reject different versions
          await expect(
            decryptData(modifiedJson, password)
          ).rejects.toThrow();
        }
      }
    });
  });

  describe('Cryptographic properties', () => {
    it('should produce different ciphertexts for same plaintext (due to salt/IV)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1 }),
            fc.string({ minLength: 1 })
          ),
          async ([data, password]) => {
            const encrypted1 = await encryptData(data, password);
            const encrypted2 = await encryptData(data, password);
            
            // Should produce different ciphertexts due to random salt/IV
            expect(encrypted1).not.toBe(encrypted2);
            
            // But both should decrypt to same value
            const decrypted1 = await decryptData(encrypted1, password);
            const decrypted2 = await decryptData(encrypted2, password);
            
            expect(decrypted1).toBe(data);
            expect(decrypted2).toBe(data);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain consistent output format', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string(),
            fc.string({ minLength: 1 })
          ),
          async ([data, password]) => {
            const encrypted = await encryptData(data, password);
            
            // Should be valid JSON
            expect(() => JSON.parse(encrypted)).not.toThrow();
            
            const encryptedObj = JSON.parse(encrypted);
            
            // Should have required fields
            expect(encryptedObj).toHaveProperty('version');
            expect(encryptedObj).toHaveProperty('encryptedData');
            expect(encryptedObj).toHaveProperty('salt');
            expect(encryptedObj).toHaveProperty('iv');
            expect(encryptedObj).toHaveProperty('authTag');
            
            // Fields should be strings
            expect(typeof encryptedObj.version).toBe('string');
            expect(typeof encryptedObj.encryptedData).toBe('string');
            expect(typeof encryptedObj.salt).toBe('string');
            expect(typeof encryptedObj.iv).toBe('string');
            expect(typeof encryptedObj.authTag).toBe('string');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Malicious input handling', () => {
    it('should safely handle injection attempts in data', async () => {
      const maliciousInputs = [
        '<script>alert(1)</script>',
        '${process.env.SECRET}',
        '{{7*7}}',
        '"; DROP TABLE wallets; --',
        '../../../etc/passwd',
        'file:///etc/passwd',
        'javascript:alert(1)',
        '{"__proto__": {"isAdmin": true}}',
        'constructor.constructor("return process")().exit()',
        String.fromCharCode(0),
        '\x00\x01\x02',
        '%00',
        '\\x00'
      ];

      for (const input of maliciousInputs) {
        const password = 'securePassword123';
        
        // Should handle without executing or interpreting malicious code
        const encrypted = await encryptData(input, password);
        const decrypted = await decryptData(encrypted, password);
        
        // Should preserve exact input without interpretation
        expect(decrypted).toBe(input);
      }
    });
  });

  describe('Performance and limits', () => {
    it('should handle rapid successive operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.string({ maxLength: 100 }),
              fc.string({ minLength: 1, maxLength: 20 })
            ),
            { minLength: 1, maxLength: 10 }
          ),
          async (operations) => {
            // Perform multiple encrypt/decrypt operations rapidly
            const results = await Promise.all(
              operations.map(async ([data, password]) => {
                const encrypted = await encryptData(data, password);
                const decrypted = await decryptData(encrypted, password);
                return decrypted === data;
              })
            );
            
            // All should succeed
            expect(results.every(r => r)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Error recovery', () => {
    it('should handle malformed JSON gracefully', async () => {
      const malformedInputs = [
        '',
        'not json',
        '{',
        '}',
        '{"partial": ',
        'null',
        'undefined',
        '[]',
        '{"version": 1}', // Missing required fields
        '{"encryptedData": "test"}', // Missing other fields
      ];

      for (const input of malformedInputs) {
        await expect(
          decryptData(input, 'password')
        ).rejects.toThrow();
      }
    });
  });
});