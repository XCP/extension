/**
 * Tests for Counterparty transaction encoding validator
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeEncoding,
  checkWalletCompatibility,
  getEncodingDisplayInfo,
  getRecommendedEncoding,
  validateComposedTransaction,
  type CounterpartyEncoding,
  type WalletType,
} from '../encodingValidator';
import type { DecodedOutput } from '@/utils/blockchain/bitcoin/psbt';

// Helper to create mock outputs
function createOutput(type: string, value: number, options?: { address?: string; script?: string; opReturnData?: string }): DecodedOutput {
  return {
    type: type as DecodedOutput['type'],
    value,
    address: options?.address,
    script: options?.script,
    opReturnData: options?.opReturnData,
  };
}

describe('encodingValidator', () => {
  describe('analyzeEncoding', () => {
    it('should detect OP_RETURN encoding', () => {
      const outputs: DecodedOutput[] = [
        createOutput('p2wpkh', 10000, { address: 'bc1qtest' }),
        createOutput('op_return', 0, { opReturnData: '434e5452505254590000000000000000' }), // CNTRPRTY prefix
      ];

      const analysis = analyzeEncoding(outputs);

      expect(analysis.encoding).toBe('opreturn');
      expect(analysis.hasCounterpartyData).toBe(true);
      expect(analysis.details.dataOutputCount).toBe(1);
      expect(analysis.details.usesNonStandardScripts).toBe(false);
    });

    it('should detect bare multisig encoding', () => {
      // 1-of-3 bare multisig with fake pubkeys (second pubkey doesn't start with 02/03)
      // Format: 51 <pubkey1> <pubkey2> <pubkey3> 53 ae
      const fakeMultisigScript =
        '51' + // OP_1
        '21' + '02' + 'a'.repeat(64) + // Real pubkey (33 bytes, starts with 02)
        '21' + '00' + 'b'.repeat(64) + // Fake pubkey (doesn't start with 02/03/04)
        '21' + '00' + 'c'.repeat(64) + // Fake pubkey
        '53ae'; // OP_3 OP_CHECKMULTISIG

      const outputs: DecodedOutput[] = [
        createOutput('p2wpkh', 10000, { address: 'bc1qtest' }),
        createOutput('unknown', 546, { script: fakeMultisigScript }),
      ];

      const analysis = analyzeEncoding(outputs);

      expect(analysis.encoding).toBe('multisig');
      expect(analysis.hasCounterpartyData).toBe(true);
      expect(analysis.details.usesNonStandardScripts).toBe(true);
      expect(analysis.details.dataOutputCount).toBeGreaterThan(0);
    });

    it('should detect Taproot encoding with multiple P2TR outputs', () => {
      const outputs: DecodedOutput[] = [
        createOutput('p2tr', 10000, { address: 'bc1ptest1' }),
        createOutput('p2tr', 546, { address: 'bc1ptest2' }),
        createOutput('p2tr', 546, { address: 'bc1ptest3' }),
      ];

      const analysis = analyzeEncoding(outputs);

      expect(analysis.encoding).toBe('taproot');
      expect(analysis.details.dataOutputCount).toBe(3);
    });

    it('should return unknown for standard Bitcoin transactions', () => {
      const outputs: DecodedOutput[] = [
        createOutput('p2wpkh', 10000, { address: 'bc1qtest' }),
        createOutput('p2wpkh', 5000, { address: 'bc1qchange' }),
      ];

      const analysis = analyzeEncoding(outputs);

      expect(analysis.encoding).toBe('unknown');
      expect(analysis.hasCounterpartyData).toBe(false);
    });

    it('should calculate estimated data size for OP_RETURN', () => {
      const opReturnData = '434e54525052545900000000'; // 12 bytes of hex data
      const outputs: DecodedOutput[] = [
        createOutput('op_return', 0, { opReturnData }),
      ];

      const analysis = analyzeEncoding(outputs);

      expect(analysis.details.estimatedDataSize).toBe(12); // hex string length / 2
    });

    it('should handle multiple OP_RETURN outputs', () => {
      const outputs: DecodedOutput[] = [
        createOutput('op_return', 0, { opReturnData: '434e545250525459' }),
        createOutput('op_return', 0, { opReturnData: '00000000' }),
      ];

      const analysis = analyzeEncoding(outputs);

      expect(analysis.encoding).toBe('opreturn');
      expect(analysis.details.dataOutputCount).toBe(2);
    });
  });

  describe('checkWalletCompatibility', () => {
    describe('software wallet', () => {
      it('should sign any encoding', () => {
        const encodings: CounterpartyEncoding[] = ['opreturn', 'multisig', 'taproot', 'pubkeyhash', 'unknown'];

        for (const encoding of encodings) {
          const result = checkWalletCompatibility(encoding, 'software');
          expect(result.canSign).toBe(true);
        }
      });

      it('should warn about multisig encoding', () => {
        const result = checkWalletCompatibility('multisig', 'software');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeDefined();
      });
    });

    describe('trezor wallet', () => {
      it('should sign OP_RETURN encoding without issues', () => {
        const result = checkWalletCompatibility('opreturn', 'trezor');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeUndefined();
        expect(result.error).toBeUndefined();
      });

      it('should sign multisig encoding with warning', () => {
        const result = checkWalletCompatibility('multisig', 'trezor');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeDefined();
        expect(result.suggestions).toBeDefined();
      });

      it('should sign taproot encoding with firmware warning', () => {
        const result = checkWalletCompatibility('taproot', 'trezor');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeDefined();
        expect(result.warning).toContain('firmware');
      });

      it('should not sign pubkeyhash encoding', () => {
        const result = checkWalletCompatibility('pubkeyhash', 'trezor');

        expect(result.canSign).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.suggestions).toBeDefined();
      });

      it('should sign unknown encoding', () => {
        const result = checkWalletCompatibility('unknown', 'trezor');

        expect(result.canSign).toBe(true);
      });
    });

    describe('ledger wallet', () => {
      it('should sign OP_RETURN encoding without issues', () => {
        const result = checkWalletCompatibility('opreturn', 'ledger');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeUndefined();
        expect(result.error).toBeUndefined();
      });

      it('should sign multisig encoding with warning', () => {
        const result = checkWalletCompatibility('multisig', 'ledger');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeDefined();
        expect(result.suggestions).toBeDefined();
      });

      it('should sign taproot encoding with firmware warning', () => {
        const result = checkWalletCompatibility('taproot', 'ledger');

        expect(result.canSign).toBe(true);
        expect(result.warning).toBeDefined();
        expect(result.warning?.toLowerCase()).toContain('firmware');
      });

      it('should not sign pubkeyhash encoding', () => {
        const result = checkWalletCompatibility('pubkeyhash', 'ledger');

        expect(result.canSign).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('getEncodingDisplayInfo', () => {
    it('should return info severity for OP_RETURN', () => {
      const analysis = analyzeEncoding([
        createOutput('op_return', 0, { opReturnData: '434e5452505254590000' }),
      ]);

      const displayInfo = getEncodingDisplayInfo(analysis);

      expect(displayInfo.severity).toBe('info');
      expect(displayInfo.title).toBe('Standard Encoding');
    });

    it('should return warning severity for multisig', () => {
      const fakeMultisigScript =
        '51' +
        '21' + '02' + 'a'.repeat(64) +
        '21' + '00' + 'b'.repeat(64) +
        '21' + '00' + 'c'.repeat(64) +
        '53ae';

      const analysis = analyzeEncoding([
        createOutput('unknown', 546, { script: fakeMultisigScript }),
      ]);

      const displayInfo = getEncodingDisplayInfo(analysis);

      expect(displayInfo.severity).toBe('warning');
      expect(displayInfo.title).toBe('Legacy Multisig Encoding');
    });

    it('should return info severity for taproot', () => {
      const analysis = analyzeEncoding([
        createOutput('p2tr', 10000, { address: 'bc1ptest1' }),
        createOutput('p2tr', 546, { address: 'bc1ptest2' }),
      ]);

      const displayInfo = getEncodingDisplayInfo(analysis);

      expect(displayInfo.severity).toBe('info');
      expect(displayInfo.title).toBe('Taproot Encoding');
    });

    it('should return info severity for unknown/standard transaction', () => {
      const analysis = analyzeEncoding([
        createOutput('p2wpkh', 10000, { address: 'bc1qtest' }),
      ]);

      const displayInfo = getEncodingDisplayInfo(analysis);

      expect(displayInfo.severity).toBe('info');
      expect(displayInfo.title).toBe('Standard Transaction');
    });
  });

  describe('getRecommendedEncoding', () => {
    it('should recommend OP_RETURN for small data', () => {
      const result = getRecommendedEncoding('software', 50);
      expect(result).toBe('opreturn');
    });

    it('should recommend OP_RETURN for data at limit', () => {
      const result = getRecommendedEncoding('software', 80);
      expect(result).toBe('opreturn');
    });

    it('should recommend multisig for software wallets with large data', () => {
      const result = getRecommendedEncoding('software', 200);
      expect(result).toBe('multisig');
    });

    it('should recommend taproot for hardware wallets with large data and segwit support', () => {
      const result = getRecommendedEncoding('trezor', 200, true);
      expect(result).toBe('taproot');
    });

    it('should recommend taproot for ledger with large data and segwit support', () => {
      const result = getRecommendedEncoding('ledger', 200, true);
      expect(result).toBe('taproot');
    });

    it('should fallback to multisig for hardware wallets without segwit', () => {
      const result = getRecommendedEncoding('trezor', 200, false);
      expect(result).toBe('multisig');
    });
  });

  describe('validateComposedTransaction', () => {
    it('should validate matching encoding', () => {
      const outputs: DecodedOutput[] = [
        createOutput('op_return', 0, { opReturnData: '434e5452505254590000' }),
      ];

      const result = validateComposedTransaction(outputs, 'opreturn');

      expect(result.valid).toBe(true);
      expect(result.actualEncoding).toBe('opreturn');
    });

    it('should invalidate mismatched encoding', () => {
      const outputs: DecodedOutput[] = [
        createOutput('op_return', 0, { opReturnData: '434e5452505254590000' }),
      ];

      const result = validateComposedTransaction(outputs, 'multisig');

      expect(result.valid).toBe(false);
      expect(result.actualEncoding).toBe('opreturn');
      expect(result.message).toBeDefined();
    });

    it('should always validate auto encoding', () => {
      const outputs: DecodedOutput[] = [
        createOutput('op_return', 0, { opReturnData: '434e5452505254590000' }),
      ];

      const result = validateComposedTransaction(outputs, 'auto');

      expect(result.valid).toBe(true);
      expect(result.actualEncoding).toBe('opreturn');
      expect(result.message).toContain('opreturn');
    });
  });

  describe('bare multisig detection', () => {
    it('should detect 1-of-2 bare multisig', () => {
      // 51 <pubkey1> <pubkey2> 52 ae
      const script1of2 =
        '51' +
        '21' + '02' + 'a'.repeat(64) +
        '21' + '00' + 'b'.repeat(64) + // Fake pubkey
        '52ae';

      const outputs: DecodedOutput[] = [
        createOutput('unknown', 546, { script: script1of2 }),
      ];

      const analysis = analyzeEncoding(outputs);
      expect(analysis.encoding).toBe('multisig');
    });

    it('should not detect standard multisig with valid pubkeys as Counterparty', () => {
      // All valid pubkeys starting with 02 or 03
      const validMultisig =
        '51' +
        '21' + '02' + 'a'.repeat(64) +
        '21' + '03' + 'b'.repeat(64) +
        '21' + '02' + 'c'.repeat(64) +
        '53ae';

      const outputs: DecodedOutput[] = [
        createOutput('unknown', 546, { script: validMultisig }),
      ];

      const analysis = analyzeEncoding(outputs);
      // Should NOT detect as multisig encoding since all pubkeys are valid
      expect(analysis.encoding).not.toBe('multisig');
    });
  });
});
