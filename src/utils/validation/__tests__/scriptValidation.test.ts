import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateScript,
  validateMultisigScript,
  validateScriptSize,
  validateWitnessData,
  estimateScriptComplexity
} from '../scriptValidation';

describe('Script Validation Security Tests', () => {
  describe('validateScript', () => {
    it('should accept valid P2PKH scripts', () => {
      // Standard P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
      const p2pkhScript = '76a914' + '89abcdefabbaabbaabbaabbaabbaabbaabbaabba' + '88ac';
      const result = validateScript(p2pkhScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('P2PKH');
    });

    it('should accept valid P2SH scripts', () => {
      // Standard P2SH: OP_HASH160 <20 bytes> OP_EQUAL
      const p2shScript = 'a914' + '89abcdefabbaabbaabbaabbaabbaabbaabbaabba' + '87';
      const result = validateScript(p2shScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('P2SH');
    });

    it('should accept valid P2WPKH scripts', () => {
      // P2WPKH: OP_0 <20 bytes>
      const p2wpkhScript = '0014' + '89abcdefabbaabbaabbaabbaabbaabbaabbaabba';
      const result = validateScript(p2wpkhScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('P2WPKH');
    });

    it('should accept valid P2WSH scripts', () => {
      // P2WSH: OP_0 <32 bytes>
      const p2wshScript = '0020' + '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validateScript(p2wshScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('P2WSH');
    });

    it('should accept valid P2TR scripts', () => {
      // P2TR: OP_1 <32 bytes>
      const p2trScript = '5120' + '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validateScript(p2trScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('P2TR');
    });

    it('should accept valid OP_RETURN scripts', () => {
      const opReturnScript = '6a' + '14' + '68656c6c6f20776f726c64'; // OP_RETURN + push 20 + "hello world"
      const result = validateScript(opReturnScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('OP_RETURN');
    });

    it('should reject non-string input', () => {
      const result = validateScript(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Script must be a string');
    });

    it('should reject empty scripts', () => {
      const result = validateScript('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Script cannot be empty');
    });

    it('should reject invalid hex', () => {
      const result = validateScript('not-hex-string');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Script must be valid hexadecimal');
    });

    it('should reject odd-length hex', () => {
      const result = validateScript('abc');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Script hex must have even length');
    });

    it('should reject oversized scripts', () => {
      const hugeScript = 'aa'.repeat(10001);
      const result = validateScript(hugeScript);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Script exceeds maximum size (10KB)');
    });

    it('should handle 0x prefix correctly', () => {
      const p2pkhScript = '0x76a914' + '89abcdefabbaabbaabbaabbaabbaabbaabbaabba' + '88ac';
      const result = validateScript(p2pkhScript);
      expect(result.isValid).toBe(true);
      expect(result.scriptType).toBe('P2PKH');
    });

    it('should warn about dangerous opcodes', () => {
      // Script with disabled OP_CAT (0x7e)
      const dangerousScript = '7e' + '76a914' + '89abcdefabbaabbaabbaabbaabbaabbaabbaabba' + '88ac';
      const result = validateScript(dangerousScript);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Script contains potentially dangerous opcodes: OP_CAT');
    });

    // Fuzz testing
    it('should handle random hex strings safely', () => {
      fc.assert(fc.property(
        fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0 && s.length > 0 && s.length <= 1000),
        (hexString) => {
          const result = validateScript(hexString);
          expect(typeof result.isValid).toBe('boolean');
          if (result.error) {
            expect(typeof result.error).toBe('string');
          }
        }
      ), { numRuns: 200 });
    });

    it('should handle various script patterns safely', () => {
      const scriptPatterns = [
        '00',                                    // OP_0
        '51',                                    // OP_1
        '6a00',                                  // OP_RETURN with no data
        '76a91400000000000000000000000000000000000000008888ac', // P2PKH with zeros
        'a91400000000000000000000000000000000000000008887',     // P2SH with zeros
        '00140000000000000000000000000000000000000000',         // P2WPKH with zeros
        '00200000000000000000000000000000000000000000000000000000000000000000', // P2WSH
        '51200000000000000000000000000000000000000000000000000000000000000000', // P2TR
      ];

      scriptPatterns.forEach(script => {
        const result = validateScript(script);
        expect(typeof result.isValid).toBe('boolean');
        expect(result).toBeDefined();
      });
    });
  });

  describe('validateMultisigScript', () => {
    it('should validate correct multisig scripts', () => {
      // 2-of-3 multisig (simplified)
      const multisigBytes = new Uint8Array([
        0x52, // OP_2 (m=2)
        0x21, // Push 33 bytes (compressed pubkey)
        ...new Uint8Array(33).fill(0xaa), // Dummy pubkey 1
        0x21, // Push 33 bytes
        ...new Uint8Array(33).fill(0xbb), // Dummy pubkey 2
        0x21, // Push 33 bytes
        ...new Uint8Array(33).fill(0xcc), // Dummy pubkey 3
        0x53, // OP_3 (n=3)
        0xae  // OP_CHECKMULTISIG
      ]);

      const result = validateMultisigScript(multisigBytes);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid m values', () => {
      const invalidM = new Uint8Array([
        0x50, // OP_0 (m=0, invalid)
        0x21, ...new Uint8Array(33).fill(0xaa),
        0x51, // OP_1 (n=1)
        0xae  // OP_CHECKMULTISIG
      ]);

      const result = validateMultisigScript(invalidM);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid m value');
    });

    it('should reject m > n', () => {
      const invalidMN = new Uint8Array([
        0x53, // OP_3 (m=3)
        0x21, ...new Uint8Array(33).fill(0xaa),
        0x21, ...new Uint8Array(33).fill(0xbb),
        0x52, // OP_2 (n=2, but m=3 > n=2)
        0xae  // OP_CHECKMULTISIG
      ]);

      const result = validateMultisigScript(invalidMN);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid multisig: m cannot be greater than n');
    });

    it('should warn about large multisig', () => {
      const largeMultisig = new Uint8Array([
        0x55, // OP_5 (m=5)
        ...Array(7).fill([0x21, ...new Uint8Array(33).fill(0xaa)]).flat(),
        0x57, // OP_7 (n=7)
        0xae  // OP_CHECKMULTISIG
      ]);

      const result = validateMultisigScript(largeMultisig);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Large multisig (5-of-7) may have higher fees');
    });

    it('should reject scripts not ending with OP_CHECKMULTISIG', () => {
      const noCheckmultisig = new Uint8Array([
        0x51, // OP_1
        0x21, ...new Uint8Array(33).fill(0xaa),
        0x51, // OP_1
        0xac  // OP_CHECKSIG instead of OP_CHECKMULTISIG
      ]);

      const result = validateMultisigScript(noCheckmultisig);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Multisig script must end with OP_CHECKMULTISIG');
    });

    it('should reject too short multisig scripts', () => {
      const tooShort = new Uint8Array([0xae]); // Just OP_CHECKMULTISIG
      const result = validateMultisigScript(tooShort);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Multisig script too short');
    });

    // Fuzz testing
    it('should handle random multisig configurations safely', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (m, n) => {
          // Create a dummy multisig script
          const script = new Uint8Array([
            0x50 + m, // OP_m
            0x21, ...new Uint8Array(33).fill(0xaa), // Dummy pubkey
            0x50 + n, // OP_n
            0xae      // OP_CHECKMULTISIG
          ]);

          const result = validateMultisigScript(script);
          
          // Should be valid only if 1 <= m <= n <= 15
          const shouldBeValid = m >= 1 && m <= 15 && n >= 1 && n <= 15 && m <= n;
          expect(result.isValid).toBe(shouldBeValid);
        }
      ), { numRuns: 100 });
    });
  });

  describe('validateScriptSize', () => {
    it('should accept scripts within limits', () => {
      const smallScript = 'aa'.repeat(100);
      
      const result1 = validateScriptSize(smallScript, 'scriptSig');
      expect(result1.isValid).toBe(true);
      
      const result2 = validateScriptSize(smallScript, 'scriptPubKey');
      expect(result2.isValid).toBe(true);
      
      const result3 = validateScriptSize(smallScript, 'witnessScript');
      expect(result3.isValid).toBe(true);
    });

    it('should reject oversized scriptSig', () => {
      const largeScript = 'aa'.repeat(1700);
      const result = validateScriptSize(largeScript, 'scriptSig');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds scriptSig limit');
    });

    it('should reject oversized scriptPubKey', () => {
      const hugeScript = 'aa'.repeat(10001);
      const result = validateScriptSize(hugeScript, 'scriptPubKey');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds scriptPubKey limit');
    });

    it('should handle 0x prefix', () => {
      const script = '0x' + 'aa'.repeat(100);
      const result = validateScriptSize(script, 'scriptSig');
      expect(result.isValid).toBe(true);
    });

    // Fuzz testing
    it('should handle various script sizes safely', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 20000 }),
        fc.oneof(
          fc.constant('scriptSig'),
          fc.constant('scriptPubKey'),
          fc.constant('witnessScript')
        ),
        (size, context) => {
          const script = 'aa'.repeat(size);
          const result = validateScriptSize(script, context as any);
          expect(typeof result.isValid).toBe('boolean');
          
          // Verify limits are enforced
          const limits = {
            scriptSig: 1650,
            scriptPubKey: 10000,
            witnessScript: 10000
          };
          
          if (size > limits[context]) {
            expect(result.isValid).toBe(false);
          }
        }
      ), { numRuns: 100 });
    });
  });

  describe('validateWitnessData', () => {
    it('should accept valid witness data', () => {
      const witness = [
        '304402207a6c7e0c3e3c7a6c7e0c3e3c7a6c7e0c3e3c7a6c7e0c3e3c7a6c7e0c3e3c7a6c02207a6c7e0c3e3c7a6c7e0c3e3c7a6c7e0c3e3c7a6c7e0c3e3c7a6c7e0c3e3c7a6c',
        '02' + 'aa'.repeat(32)
      ];
      
      const result = validateWitnessData(witness);
      expect(result.isValid).toBe(true);
    });

    it('should reject non-array witness', () => {
      const result = validateWitnessData('not-an-array' as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Witness must be an array');
    });

    it('should reject empty witness', () => {
      const result = validateWitnessData([]);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Witness cannot be empty');
    });

    it('should reject too many witness items', () => {
      const tooManyItems = new Array(101).fill('aa');
      const result = validateWitnessData(tooManyItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many witness items (max 100)');
    });

    it('should reject non-string witness items', () => {
      const witness = ['aa', 123, 'bb'] as any;
      const result = validateWitnessData(witness);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Witness item 1 must be a string');
    });

    it('should reject invalid hex in witness items', () => {
      const witness = ['aa', 'not-hex', 'bb'];
      const result = validateWitnessData(witness);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Witness item 1 must be valid hex');
    });

    it('should reject oversized witness items', () => {
      const witness = ['aa', 'bb'.repeat(5001), 'cc'];
      const result = validateWitnessData(witness);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Witness item 1 exceeds maximum size');
    });

    it('should handle 0x prefix in witness items', () => {
      const witness = ['0xaa', '0xbb', '0xcc'];
      const result = validateWitnessData(witness);
      expect(result.isValid).toBe(true);
    });

    // Fuzz testing
    it('should handle random witness data safely', () => {
      fc.assert(fc.property(
        fc.array(
          fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length <= 100),
          { minLength: 0, maxLength: 110 }
        ),
        (witnessArray) => {
          const result = validateWitnessData(witnessArray);
          expect(typeof result.isValid).toBe('boolean');
          
          if (witnessArray.length === 0) {
            expect(result.isValid).toBe(false);
          } else if (witnessArray.length > 100) {
            expect(result.isValid).toBe(false);
          }
        }
      ), { numRuns: 100 });
    });
  });

  describe('estimateScriptComplexity', () => {
    it('should estimate complexity for simple scripts', () => {
      const simpleScript = 'aa'.repeat(10);
      const complexity = estimateScriptComplexity(simpleScript);
      expect(complexity).toBe(10); // Just the size
    });

    it('should add complexity for signature operations', () => {
      // Script with OP_CHECKSIG (0xac)
      const scriptWithSig = 'aa' + 'ac' + 'bb';
      const complexity = estimateScriptComplexity(scriptWithSig);
      expect(complexity).toBe(3 + 50); // Size + signature operation cost
    });

    it('should add complexity for multisig operations', () => {
      // Script with OP_CHECKMULTISIG (0xae)
      const scriptWithMultisig = 'aa' + 'ae' + 'bb';
      const complexity = estimateScriptComplexity(scriptWithMultisig);
      expect(complexity).toBe(3 + 50); // Size + multisig operation cost
    });

    it('should handle 0x prefix', () => {
      const script = '0x' + 'aa'.repeat(10);
      const complexity = estimateScriptComplexity(script);
      expect(complexity).toBe(10);
    });

    it('should accumulate complexity for multiple operations', () => {
      // Script with multiple OP_CHECKSIG
      const complexScript = 'ac'.repeat(3) + 'aa'.repeat(5);
      const complexity = estimateScriptComplexity(complexScript);
      expect(complexity).toBe(8 + 150); // 8 bytes + 3 signature operations
    });

    // Fuzz testing
    it('should estimate complexity safely for random scripts', () => {
      fc.assert(fc.property(
        fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0 && s.length > 0 && s.length <= 1000),
        (hexScript) => {
          const complexity = estimateScriptComplexity(hexScript);
          expect(complexity).toBeGreaterThanOrEqual(hexScript.length / 2);
          expect(Number.isFinite(complexity)).toBe(true);
        }
      ), { numRuns: 100 });
    });
  });

  describe('Script Injection Prevention', () => {
    it('should prevent script injection attempts', () => {
      const injectionAttempts = [
        '<script>alert(1)</script>',
        '";DROP TABLE scripts;--',
        '../../../etc/passwd',
        '${7*7}',
        '{{7*7}}',
        '=cmd|"/c calc"!A0'
      ];

      injectionAttempts.forEach(injection => {
        const result = validateScript(injection);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('must be valid hexadecimal');
      });
    });

    it('should handle edge cases in script parsing', () => {
      const edgeCases = [
        '',              // Empty
        '0',             // Single nibble
        'zz',            // Invalid hex
        'FFFFFFFF',      // All F's
        '00000000',      // All zeros
        '0x',            // Just prefix
        '0x0',           // Prefix with single nibble
      ];

      edgeCases.forEach(edgeCase => {
        const result = validateScript(edgeCase);
        expect(typeof result.isValid).toBe('boolean');
        expect(result).toBeDefined();
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle large scripts efficiently', () => {
      const largeScript = 'aa'.repeat(5000);
      
      const startTime = Date.now();
      const result = validateScript(largeScript);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
      expect(result.isValid).toBe(true);
    });

    it('should handle complex witness data efficiently', () => {
      const complexWitness = Array(50).fill('aa'.repeat(100));
      
      const startTime = Date.now();
      const result = validateWitnessData(complexWitness);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100);
      expect(result.isValid).toBe(true);
    });
  });
});