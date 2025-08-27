import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateUTXOResponse,
  validateBalanceResponse,
  validateAPIURL,
  validateResponseSize,
  sanitizeAPIResponse,
  type ValidationResult,
  type UTXOResponse,
} from '../apiResponse';

describe('API Response Validation Security Tests', () => {
  describe('validateUTXOResponse', () => {
    it('should accept valid UTXO array', () => {
      const validUTXOs = [
        {
          txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 800000,
            block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
            block_time: 1640995200,
          },
          value: 100000,
        },
      ];

      const result = validateUTXOResponse(validUTXOs);
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toHaveLength(1);
    });

    it('should reject non-array input', () => {
      const result = validateUTXOResponse({ not: 'array' });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('UTXO response must be an array');
    });

    it('should reject invalid txid format', () => {
      const invalidUTXO = [{
        txid: 'invalid-txid',
        vout: 0,
        status: {
          confirmed: true,
          block_height: 800000,
          block_hash: 'b2c3d4e5f6789012345678901234567890123456789012345678901234567890a1',
          block_time: 1640995200,
        },
        value: 100000,
      }];

      const result = validateUTXOResponse(invalidUTXO);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('txid must be 64-character hex');
    });

    it('should reject negative vout', () => {
      const invalidUTXO = [{
        txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
        vout: -1,
        status: {
          confirmed: true,
          block_height: 800000,
          block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
          block_time: 1640995200,
        },
        value: 100000,
      }];

      const result = validateUTXOResponse(invalidUTXO);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('vout must be non-negative integer');
    });

    it('should reject excessive value', () => {
      const invalidUTXO = [{
        txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
        vout: 0,
        status: {
          confirmed: true,
          block_height: 800000,
          block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
          block_time: 1640995200,
        },
        value: 2100000000000001, // Exceeds max Bitcoin supply
      }];

      const result = validateUTXOResponse(invalidUTXO);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('value exceeds maximum Bitcoin supply');
    });

    it('should reject too many UTXOs', () => {
      const tooManyUTXOs = Array.from({ length: 10001 }, (_, i) => ({
        txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
        vout: i,
        status: {
          confirmed: true,
          block_height: 800000,
          block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
          block_time: 1640995200,
        },
        value: 100000,
      }));

      const result = validateUTXOResponse(tooManyUTXOs);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many UTXOs in response');
    });

    // Fuzz testing for malformed UTXO data
    it('should handle random malformed UTXO data', () => {
      fc.assert(fc.property(
        fc.array(fc.anything(), { minLength: 1, maxLength: 100 }),
        (randomData) => {
          const result = validateUTXOResponse(randomData);
          
          // Should either be valid (if randomly valid) or invalid with error message
          if (!result.isValid) {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
          }
        }
      ), { numRuns: 200 });
    });

    // Test for potential prototype pollution
    it('should handle prototype pollution attempts safely', () => {
      const maliciousUTXO = [{
        '__proto__': { polluted: true },
        txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
        vout: 0,
        status: {
          confirmed: true,
          block_height: 800000,
          block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
          block_time: 1640995200,
        },
        value: 100000,
      }];

      const result = validateUTXOResponse(maliciousUTXO);
      expect(result.isValid).toBe(true); // Should sanitize and accept valid parts
      expect(result.sanitized).toBeDefined();
    });

    // Edge case: extreme values
    it('should handle edge case values', () => {
      const edgeCases = [
        { vout: 4294967295, valid: true }, // Max uint32
        { vout: 4294967296, valid: false }, // Exceeds uint32
        { block_height: 0, valid: true },
        { block_time: 0, valid: true },
        { value: 0, valid: true },
      ];

      edgeCases.forEach(({ vout, block_height, block_time, value, valid }) => {
        const utxo = [{
          txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
          vout: vout ?? 0,
          status: {
            confirmed: true,
            block_height: block_height ?? 800000,
            block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
            block_time: block_time ?? 1640995200,
          },
          value: value ?? 100000,
        }];

        const result = validateUTXOResponse(utxo);
        expect(result.isValid).toBe(valid);
      });
    });
  });

  describe('validateBalanceResponse', () => {
    it('should validate blockstream/mempool format', () => {
      const blockstreamResponse = {
        chain_stats: {
          funded_txo_sum: '1000000',
          spent_txo_sum: '500000',
        },
        mempool_stats: {
          funded_txo_sum: '100000',
          spent_txo_sum: '50000',
        },
      };

      const result = validateBalanceResponse(blockstreamResponse, 'https://blockstream.info/api/address/test');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe(550000); // 1000000 - 500000 + 100000 - 50000
    });

    it('should validate blockcypher format', () => {
      const blockcypherResponse = {
        final_balance: 1000000,
      };

      const result = validateBalanceResponse(blockcypherResponse, 'https://api.blockcypher.com/v1/btc/main/addrs/test/balance');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe(1000000);
    });

    it('should validate sochain format', () => {
      const sochainResponse = {
        data: {
          confirmed_balance: '1.5',
        },
      };

      const result = validateBalanceResponse(sochainResponse, 'https://sochain.com/api/v2/get_address_balance/BTC/test');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe(150000000); // 1.5 * 1e8
    });

    it('should reject negative balance', () => {
      const negativeBalanceResponse = {
        final_balance: -1000000,
      };

      const result = validateBalanceResponse(negativeBalanceResponse, 'https://api.blockcypher.com/v1/btc/main/addrs/test/balance');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Balance cannot be negative');
    });

    it('should reject excessive balance', () => {
      const excessiveBalanceResponse = {
        final_balance: 2100000000000001, // Exceeds max Bitcoin supply
      };

      const result = validateBalanceResponse(excessiveBalanceResponse, 'https://api.blockcypher.com/v1/btc/main/addrs/test/balance');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Balance exceeds maximum Bitcoin supply');
    });

    it('should reject formula injection in balance values', () => {
      const injectionResponse = {
        chain_stats: {
          funded_txo_sum: '=SUM(1,1)',
          spent_txo_sum: '0',
        },
      };

      const result = validateBalanceResponse(injectionResponse, 'https://blockstream.info/api/address/test');
      expect(result.isValid).toBe(false);
    });

    // Fuzz test for various balance response formats
    it('should handle random balance response data safely', () => {
      fc.assert(fc.property(
        fc.record({
          final_balance: fc.oneof(fc.integer(), fc.float(), fc.string()),
        }),
        fc.constantFrom(
          'https://api.blockcypher.com/test',
          'https://blockchain.info/test',
          'https://blockstream.info/test',
          'https://sochain.com/test'
        ),
        (response, endpoint) => {
          const result = validateBalanceResponse(response, endpoint);
          
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
          
          // Should never throw an exception
          expect(typeof result.isValid).toBe('boolean');
        }
      ), { numRuns: 300 });
    });
  });

  describe('validateAPIURL', () => {
    it('should accept valid HTTPS URLs from whitelist', () => {
      const validURLs = [
        'https://blockstream.info/api/address/test',
        'https://mempool.space/api/address/test',
        'https://api.blockcypher.com/v1/btc/main/addrs/test',
        'https://blockchain.info/rawaddr/test',
        'https://sochain.com/api/v2/get_address_balance/BTC/test',
      ];

      validURLs.forEach(url => {
        const result = validateAPIURL(url);
        expect(result.isValid).toBe(true);
        expect(result.sanitized).toBe(url);
      });
    });

    it('should reject HTTP URLs', () => {
      const httpURL = 'http://blockstream.info/api/address/test';
      const result = validateAPIURL(httpURL);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Only HTTPS URLs are allowed');
    });

    it('should reject non-whitelisted domains', () => {
      const maliciousURL = 'https://evil.com/api/steal-data';
      const result = validateAPIURL(maliciousURL);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Domain not in whitelist');
    });

    it('should reject localhost and private IPs', () => {
      const privateURLs = [
        'https://localhost/api',
        'https://127.0.0.1/api',
        'https://10.0.0.1/api',
        'https://192.168.1.1/api',
        'https://172.16.0.1/api',
        'https://169.254.1.1/api', // Link-local
      ];

      privateURLs.forEach(url => {
        const result = validateAPIURL(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Private/local addresses not allowed');
      });
    });

    it('should reject path traversal attempts', () => {
      const pathTraversalURLs = [
        'https://blockstream.info/../../../etc/passwd',
        'https://blockstream.info/api/%2e%2e/sensitive',
      ];

      pathTraversalURLs.forEach(url => {
        const result = validateAPIURL(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Path traversal detected');
      });
    });

    it('should reject formula injection in URLs', () => {
      const injectionURLs = [
        '=https://blockstream.info/api',
        '@SUM(https://evil.com)',
        '+https://malicious.site',
      ];

      injectionURLs.forEach(url => {
        const result = validateAPIURL(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid URL format');
      });
    });

    // Fuzz test for URL validation
    it('should handle random URL strings safely', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (randomString) => {
          const result = validateAPIURL(randomString);
          
          // Should never throw an exception
          expect(typeof result.isValid).toBe('boolean');
          if (!result.isValid) {
            expect(result.error).toBeDefined();
          }
        }
      ), { numRuns: 500 });
    });
  });

  describe('validateResponseSize', () => {
    it('should accept reasonable response sizes', () => {
      const reasonableData = { message: 'Hello, World!' };
      const result = validateResponseSize(reasonableData);
      expect(result.isValid).toBe(true);
    });

    it('should reject extremely large responses', () => {
      const largeData = { data: 'x'.repeat(11 * 1024 * 1024) }; // 11MB
      const result = validateResponseSize(largeData);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Response too large');
    });

    // Test edge case right at the limit
    it('should handle responses at size limits', () => {
      const sizes = [
        10 * 1024 * 1024 - 100, // Just under limit
        10 * 1024 * 1024 + 100, // Just over limit
      ];

      sizes.forEach((size, index) => {
        const data = { data: 'x'.repeat(size) };
        const result = validateResponseSize(data);
        
        if (index === 0) {
          expect(result.isValid).toBe(true);
        } else {
          expect(result.isValid).toBe(false);
        }
      });
    });
  });

  describe('sanitizeAPIResponse', () => {
    it('should preserve safe properties', () => {
      const safeResponse = {
        balance: 1000000,
        address: 'bc1qtest',
        confirmed: true,
      };

      const sanitized = sanitizeAPIResponse(safeResponse);
      expect(sanitized).toEqual(safeResponse);
    });

    it('should remove dangerous properties', () => {
      const dangerousResponse = {
        balance: 1000000,
        __proto__: { polluted: true },
        constructor: () => {},
        prototype: { malicious: true },
        normalProperty: 'safe',
      };

      const sanitized = sanitizeAPIResponse(dangerousResponse);
      expect(sanitized).toEqual({
        balance: 1000000,
        normalProperty: 'safe',
      });
    });

    it('should remove functions', () => {
      const responseWithFunctions = {
        data: 'safe',
        maliciousFunction: () => console.log('pwned'),
        calculate: function() { return 42; },
      };

      const sanitized = sanitizeAPIResponse(responseWithFunctions);
      expect(sanitized).toEqual({ data: 'safe' });
    });

    it('should handle nested objects recursively', () => {
      const nestedResponse = {
        level1: {
          level2: {
            __proto__: { polluted: true },
            safeData: 'keep this',
            dangerousFunction: () => {},
          },
          safeArray: [1, 2, { maliciousFunc: () => {}, keepThis: 'safe' }],
        },
      };

      const sanitized = sanitizeAPIResponse(nestedResponse);
      expect(sanitized).toEqual({
        level1: {
          level2: {
            safeData: 'keep this',
          },
          safeArray: [1, 2, { keepThis: 'safe' }],
        },
      });
    });

    // Fuzz test for sanitization
    it('should handle random object structures safely', () => {
      fc.assert(fc.property(
        fc.anything(),
        (randomData) => {
          // Should never throw an exception during sanitization
          expect(() => sanitizeAPIResponse(randomData)).not.toThrow();
        }
      ), { numRuns: 200 });
    });

    it('should handle circular references without infinite loops', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should handle gracefully without hanging
      const start = Date.now();
      const sanitized = sanitizeAPIResponse(circular);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should complete quickly
      expect(sanitized).toBeDefined();
    });
  });

  // Integration tests
  describe('Integration Tests', () => {
    it('should validate complete UTXO workflow', () => {
      const mockAPIResponse = [
        {
          txid: 'a1b2c3d4e5f6a789012345678901234567890123456789012345678901234567890',
          vout: 0,
          status: {
            confirmed: true,
            block_height: 800000,
            block_hash: 'b2c3d4e5f6a789012345678901234567890123456789012345678901234567890a1',
            block_time: 1640995200,
          },
          value: 100000,
          __proto__: { polluted: true }, // Should be sanitized
        },
      ];

      // First sanitize, then validate
      const sanitized = sanitizeAPIResponse(mockAPIResponse);
      const validated = validateUTXOResponse(sanitized);

      expect(validated.isValid).toBe(true);
      expect(validated.sanitized).toHaveLength(1);
      expect((validated.sanitized as UTXOResponse[])[0]).not.toHaveProperty('__proto__');
    });

    it('should handle complete API validation pipeline', () => {
      const url = 'https://blockstream.info/api/address/test';
      const response = {
        chain_stats: { funded_txo_sum: 1000000, spent_txo_sum: 0 },
        __proto__: { polluted: true },
      };

      // Validate URL
      const urlValidation = validateAPIURL(url);
      expect(urlValidation.isValid).toBe(true);

      // Check response size
      const sizeValidation = validateResponseSize(response);
      expect(sizeValidation.isValid).toBe(true);

      // Sanitize response
      const sanitized = sanitizeAPIResponse(response);
      expect(sanitized).not.toHaveProperty('__proto__');

      // Validate balance
      const balanceValidation = validateBalanceResponse(sanitized, url);
      expect(balanceValidation.isValid).toBe(true);
    });
  });
});