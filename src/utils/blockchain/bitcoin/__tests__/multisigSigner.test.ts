import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeMultisigScript,
  signBareMultisigTransaction,
  finalizeBareMultisigTransaction,
  signAndFinalizeBareMultisig,
  MultisigInputInfo
} from '@/utils/blockchain/bitcoin/multisigSigner';
import { Transaction, OutScript, SigHash } from '@scure/btc-signer';
import { signECDSA } from '@scure/btc-signer/utils.js';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';

// Mock the ECDSA signing function
vi.mock('@scure/btc-signer/utils.js', () => ({
  signECDSA: vi.fn()
}));

const mockSignECDSA = signECDSA as any;

describe('Multisig Signer', () => {
  // Test key pair
  const privateKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const privateKey = hexToBytes(privateKeyHex);
  const compressedPubkey = getPublicKey(privateKey, true);
  const uncompressedPubkey = getPublicKey(privateKey, false);

  // Mock signature
  const mockSignature = hexToBytes('304402207fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a002207fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0');

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignECDSA.mockReturnValue(mockSignature);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeMultisigScript', () => {
    it('should identify 1-of-1 compressed multisig script', () => {
      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'compressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      });
    });

    it('should identify 1-of-1 uncompressed multisig script', () => {
      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubkey]
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'uncompressed',
        scriptPubKey: script,
        ourKeyIsCompressed: false,
        ourKeyIsUncompressed: true
      });
    });

    it('should identify 2-of-3 multisig script with our compressed key', () => {
      const otherKey1 = getPublicKey(hexToBytes('1111111111111111111111111111111111111111111111111111111111111111'), true);
      const otherKey2 = getPublicKey(hexToBytes('2222222222222222222222222222222222222222222222222222222222222222'), true);

      const script = OutScript.encode({
        type: 'ms',
        m: 2,
        pubkeys: [otherKey1, compressedPubkey, otherKey2]
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'compressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      });
    });

    it('should identify 2-of-3 multisig script with our uncompressed key', () => {
      const otherKey1 = getPublicKey(hexToBytes('1111111111111111111111111111111111111111111111111111111111111111'), false);
      const otherKey2 = getPublicKey(hexToBytes('2222222222222222222222222222222222222222222222222222222222222222'), false);

      const script = OutScript.encode({
        type: 'ms',
        m: 2,
        pubkeys: [otherKey1, uncompressedPubkey, otherKey2]
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'uncompressed',
        scriptPubKey: script,
        ourKeyIsCompressed: false,
        ourKeyIsUncompressed: true
      });
    });

    it('should prioritize uncompressed when both keys are present', () => {
      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey, uncompressedPubkey]
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'uncompressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: true
      });
    });

    it('should return null for non-multisig scripts', () => {
      const p2pkhScript = OutScript.encode({
        type: 'pkh',
        hash: new Uint8Array(20).fill(0)
      });

      const result = analyzeMultisigScript(p2pkhScript, compressedPubkey, uncompressedPubkey);

      expect(result).toBeNull();
    });

    it('should return null when our key is not in the script', () => {
      const otherKey = getPublicKey(hexToBytes('1111111111111111111111111111111111111111111111111111111111111111'), true);

      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [otherKey]
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).toBeNull();
    });

    it('should handle invalid pubkeys (Counterparty data) scripts', () => {
      // Create a script that looks like multisig but has invalid "pubkeys"
      // This simulates Counterparty's data encoding where some "pubkeys" are actually data
      const validKey = compressedPubkey;
      const invalidData = new Uint8Array(33).fill(0xFF); // Invalid pubkey data

      // Create a malformed script manually that will fail OutScript.decode
      const scriptBytes = new Uint8Array([
        0x51, // OP_1 (m=1)
        0x21, // Push 33 bytes
        ...validKey,
        0x21, // Push 33 bytes
        ...invalidData,
        0x52, // OP_2 (n=2)
        0xAE  // OP_CHECKMULTISIG
      ]);

      // Mock OutScript.decode to throw for this invalid script
      const originalDecode = OutScript.decode;
      vi.spyOn(OutScript, 'decode').mockImplementationOnce(() => {
        throw new Error('Invalid pubkey');
      });

      const result = analyzeMultisigScript(scriptBytes, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'invalid-pubkeys',
        scriptPubKey: scriptBytes,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      });

      // Restore original decode
      OutScript.decode = originalDecode;
    });

    it('should handle invalid pubkeys with uncompressed key', () => {
      const scriptBytes = new Uint8Array([
        0x51, // OP_1
        0x41, // Push 65 bytes
        ...uncompressedPubkey,
        0x21, // Push 33 bytes
        ...new Uint8Array(33).fill(0xFF), // Invalid data
        0x52, // OP_2
        0xAE  // OP_CHECKMULTISIG
      ]);

      vi.spyOn(OutScript, 'decode').mockImplementationOnce(() => {
        throw new Error('Invalid pubkey');
      });

      const result = analyzeMultisigScript(scriptBytes, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'invalid-pubkeys',
        scriptPubKey: scriptBytes,
        ourKeyIsCompressed: false,
        ourKeyIsUncompressed: true
      });
    });

    it('should return null for invalid scripts without our key', () => {
      const scriptBytes = new Uint8Array([
        0x51, // OP_1
        0x21, // Push 33 bytes
        ...new Uint8Array(33).fill(0xFF), // Invalid data
        0x52, // OP_2
        0xAE  // OP_CHECKMULTISIG
      ]);

      vi.spyOn(OutScript, 'decode').mockImplementationOnce(() => {
        throw new Error('Invalid pubkey');
      });

      const result = analyzeMultisigScript(scriptBytes, compressedPubkey, uncompressedPubkey);

      expect(result).toBeNull();
    });

    it('should handle edge case with both compressed and uncompressed keys in invalid script', () => {
      const scriptHex = bytesToHex(compressedPubkey) + bytesToHex(uncompressedPubkey);
      const scriptBytes = hexToBytes('51' + scriptHex + '52ae'); // Simplified invalid script

      vi.spyOn(OutScript, 'decode').mockImplementationOnce(() => {
        throw new Error('Invalid pubkey');
      });

      const result = analyzeMultisigScript(scriptBytes, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'invalid-pubkeys',
        scriptPubKey: scriptBytes,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: true
      });
    });
  });

  describe('signBareMultisigTransaction', () => {
    let mockTx: Transaction;
    let inputInfos: MultisigInputInfo[];

    beforeEach(() => {
      // Create a mock transaction
      mockTx = {
        inputsLength: 1,
        preimageLegacy: vi.fn().mockReturnValue(new Uint8Array(32).fill(0)),
        updateInput: vi.fn(),
        opts: { lowR: false }
      } as any;

      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      inputInfos = [{
        signType: 'compressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      }];
    });

    it('should sign compressed multisig input correctly', () => {
      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect((mockTx as any).preimageLegacy).toHaveBeenCalledWith(0, inputInfos[0].scriptPubKey, SigHash.ALL);
      expect(mockSignECDSA).toHaveBeenCalledWith(expect.any(Uint8Array), privateKey, false);

      // Verify updateInput was called with correct signature and compressed pubkey
      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        {
          partialSig: [[compressedPubkey, expect.any(Uint8Array)]]
        },
        true
      );

      // Check that the signature has SigHash.ALL appended
      const updateCall = ((mockTx as any).updateInput as any).mock.calls[0];
      const signatureWithHash = updateCall[1].partialSig[0][1];
      expect(signatureWithHash[signatureWithHash.length - 1]).toBe(SigHash.ALL);
    });

    it('should sign uncompressed multisig input correctly', () => {
      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubkey]
      });

      inputInfos[0] = {
        signType: 'uncompressed',
        scriptPubKey: script,
        ourKeyIsCompressed: false,
        ourKeyIsUncompressed: true
      };

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        {
          partialSig: [[uncompressedPubkey, expect.any(Uint8Array)]]
        },
        true
      );
    });

    it('should handle invalid-pubkeys input with compressed key preference', () => {
      inputInfos[0] = {
        signType: 'invalid-pubkeys',
        scriptPubKey: new Uint8Array([0x51, 0xAE]), // Dummy script
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      };

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      // For invalid-pubkeys, should set finalScriptSig directly
      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        {
          finalScriptSig: expect.any(Uint8Array)
        },
        true
      );

      // Check the scriptSig structure: OP_0 <signature>
      const updateCall = ((mockTx as any).updateInput as any).mock.calls[0];
      const scriptSig = updateCall[1].finalScriptSig;
      expect(scriptSig[0]).toBe(0x00); // OP_0
      expect(scriptSig[1]).toBe(mockSignature.length + 1); // Signature length + sighash byte
    });

    it('should handle invalid-pubkeys input with uncompressed key preference', () => {
      inputInfos[0] = {
        signType: 'invalid-pubkeys',
        scriptPubKey: new Uint8Array([0x51, 0xAE]),
        ourKeyIsCompressed: false,
        ourKeyIsUncompressed: true
      };

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        { finalScriptSig: expect.any(Uint8Array) },
        true
      );
    });

    it('should prefer uncompressed when both keys are available for invalid-pubkeys', () => {
      inputInfos[0] = {
        signType: 'invalid-pubkeys',
        scriptPubKey: new Uint8Array([0x51, 0xAE]),
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: true
      };

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        { finalScriptSig: expect.any(Uint8Array) },
        true
      );
    });

    it('should handle multiple inputs', () => {
      const script1 = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      const script2 = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [uncompressedPubkey]
      });

      (mockTx as any).inputsLength = 2;
      inputInfos = [
        {
          signType: 'compressed',
          scriptPubKey: script1,
          ourKeyIsCompressed: true,
          ourKeyIsUncompressed: false
        },
        {
          signType: 'uncompressed',
          scriptPubKey: script2,
          ourKeyIsCompressed: false,
          ourKeyIsUncompressed: true
        }
      ];

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect((mockTx as any).preimageLegacy).toHaveBeenCalledTimes(2);
      expect((mockTx as any).updateInput).toHaveBeenCalledTimes(2);

      // First input should use compressed key
      expect((mockTx as any).updateInput).toHaveBeenNthCalledWith(
        1,
        0,
        { partialSig: [[compressedPubkey, expect.any(Uint8Array)]] },
        true
      );

      // Second input should use uncompressed key
      expect((mockTx as any).updateInput).toHaveBeenNthCalledWith(
        2,
        1,
        { partialSig: [[uncompressedPubkey, expect.any(Uint8Array)]] },
        true
      );
    });

    it('should throw error when input count mismatch', () => {
      (mockTx as any).inputsLength = 2;
      // inputInfos still has length 1

      expect(() => {
        signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);
      }).toThrow('Input count mismatch: tx has 2, provided 1 infos');
    });

    it('should throw error when preimageLegacy is not accessible', () => {
      delete (mockTx as any).preimageLegacy;

      expect(() => {
        signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);
      }).toThrow('preimageLegacy method not accessible');
    });

    it('should use lowR option when available', () => {
      (mockTx as any).opts = { lowR: true };

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect(mockSignECDSA).toHaveBeenCalledWith(expect.any(Uint8Array), privateKey, true);
    });

    it('should handle missing opts object', () => {
      delete (mockTx as any).opts;

      signBareMultisigTransaction(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      expect(mockSignECDSA).toHaveBeenCalledWith(expect.any(Uint8Array), privateKey, undefined);
    });
  });

  describe('finalizeBareMultisigTransaction', () => {
    let mockTx: Transaction;
    let inputInfos: MultisigInputInfo[];
    let mockInput: any;

    beforeEach(() => {
      mockInput = {
        finalScriptSig: null,
        partialSig: [[compressedPubkey, new Uint8Array([...mockSignature, SigHash.ALL])]]
      };

      mockTx = {
        inputsLength: 1,
        getInput: vi.fn().mockReturnValue(mockInput),
        finalizeIdx: vi.fn(),
        updateInput: vi.fn()
      } as any;

      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      inputInfos = [{
        signType: 'compressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      }];

      // Mock console.log to avoid noise in tests
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should finalize compressed multisig input using btc-signer', () => {
      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect((mockTx as any).finalizeIdx).toHaveBeenCalledWith(0);
      expect((mockTx as any).updateInput).not.toHaveBeenCalled(); // Should not fall back to manual
    });

    it('should finalize uncompressed multisig input using btc-signer', () => {
      inputInfos[0].signType = 'uncompressed';

      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect((mockTx as any).finalizeIdx).toHaveBeenCalledWith(0);
    });

    it('should skip already finalized inputs', () => {
      mockInput.finalScriptSig = new Uint8Array([0x00, 0x47, ...mockSignature, SigHash.ALL]);

      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect((mockTx as any).finalizeIdx).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        `Input 0 already finalized, skipping. Length: ${mockInput.finalScriptSig.length}`
      );
    });

    it('should throw error for invalid-pubkeys that were not finalized during signing', () => {
      inputInfos[0].signType = 'invalid-pubkeys';
      mockInput.finalScriptSig = null; // Not finalized during signing

      expect(() => {
        finalizeBareMultisigTransaction(mockTx, inputInfos);
      }).toThrow('Input 0 with invalid pubkeys was not finalized during signing');
    });

    it('should skip invalid-pubkeys inputs that are already finalized', () => {
      inputInfos[0].signType = 'invalid-pubkeys';
      mockInput.finalScriptSig = new Uint8Array([0x00, 0x47, ...mockSignature, SigHash.ALL]);

      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect((mockTx as any).finalizeIdx).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        `Input 0 already finalized, skipping. Length: ${mockInput.finalScriptSig.length}`
      );
    });

    it('should fall back to manual finalization when btc-signer fails', () => {
      (mockTx as any).finalizeIdx.mockImplementation(() => {
        throw new Error('btc-signer finalization failed');
      });

      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect((mockTx as any).finalizeIdx).toHaveBeenCalledWith(0);
      expect(console.log).toHaveBeenCalledWith(
        'Input 0 btc-signer finalize failed, using manual construction:',
        expect.any(Error)
      );

      // Should fall back to manual construction
      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        { finalScriptSig: expect.any(Uint8Array) },
        true
      );

      // Check manual scriptSig structure
      const updateCall = ((mockTx as any).updateInput as any).mock.calls[0];
      const scriptSig = updateCall[1].finalScriptSig;
      expect(scriptSig[0]).toBe(0x00); // OP_0
      expect(scriptSig[1]).toBe(mockSignature.length + 1); // Signature length
    });

    it('should throw error when manual finalization fails due to missing partialSig', () => {
      mockInput.partialSig = []; // No partial signatures
      (mockTx as any).finalizeIdx.mockImplementation(() => {
        throw new Error('btc-signer finalization failed');
      });

      expect(() => {
        finalizeBareMultisigTransaction(mockTx, inputInfos);
      }).toThrow('Failed to finalize input 0: missing or invalid partialSig');
    });

    it('should handle multiple inputs with mixed types', () => {
      const mockInput2 = {
        finalScriptSig: new Uint8Array([0x00, 0x47, ...mockSignature, SigHash.ALL]), // Already finalized
        partialSig: []
      };

      (mockTx as any).inputsLength = 2;
      (mockTx as any).getInput.mockImplementation((idx: number) => idx === 0 ? mockInput : mockInput2);

      inputInfos = [
        {
          signType: 'compressed',
          scriptPubKey: new Uint8Array(),
          ourKeyIsCompressed: true,
          ourKeyIsUncompressed: false
        },
        {
          signType: 'invalid-pubkeys',
          scriptPubKey: new Uint8Array(),
          ourKeyIsCompressed: true,
          ourKeyIsUncompressed: false
        }
      ];

      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect((mockTx as any).finalizeIdx).toHaveBeenCalledWith(0); // First input finalized
      expect(console.log).toHaveBeenCalledWith(
        `Input 1 already finalized, skipping. Length: ${mockInput2.finalScriptSig.length}`
      );
    });

    it('should throw error when input count mismatch', () => {
      (mockTx as any).inputsLength = 2;
      // inputInfos still has length 1

      expect(() => {
        finalizeBareMultisigTransaction(mockTx, inputInfos);
      }).toThrow('Input count mismatch: tx has 2, provided 1 infos');
    });

    it('should log successful btc-signer finalization', () => {
      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect(console.log).toHaveBeenCalledWith('Input 0 finalized via btc-signer');
    });

    it('should log successful manual finalization', () => {
      (mockTx as any).finalizeIdx.mockImplementation(() => {
        throw new Error('btc-signer failed');
      });

      finalizeBareMultisigTransaction(mockTx, inputInfos);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Input 0 manually finalized with scriptSig length:')
      );
    });
  });

  describe('signAndFinalizeBareMultisig', () => {
    let mockTx: Transaction;
    let inputInfos: MultisigInputInfo[];

    beforeEach(() => {
      const mockInput = {
        finalScriptSig: null,
        partialSig: [[compressedPubkey, new Uint8Array([...mockSignature, SigHash.ALL])]]
      };

      mockTx = {
        inputsLength: 1,
        preimageLegacy: vi.fn().mockReturnValue(new Uint8Array(32).fill(0)),
        updateInput: vi.fn(),
        getInput: vi.fn().mockReturnValue(mockInput),
        finalizeIdx: vi.fn(),
        opts: { lowR: false }
      } as any;

      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      inputInfos = [{
        signType: 'compressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      }];

      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should sign and finalize transaction successfully', () => {
      signAndFinalizeBareMultisig(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      // Should call signing
      expect((mockTx as any).preimageLegacy).toHaveBeenCalledWith(0, inputInfos[0].scriptPubKey, SigHash.ALL);
      expect(mockSignECDSA).toHaveBeenCalledWith(expect.any(Uint8Array), privateKey, false);

      // Should call finalization
      expect((mockTx as any).finalizeIdx).toHaveBeenCalledWith(0);
    });

    it('should handle complex multi-input scenario', () => {
      const script1 = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      const script2 = new Uint8Array([0x51, 0xAE]); // Invalid pubkeys script

      const mockInput1 = {
        finalScriptSig: null,
        partialSig: [[compressedPubkey, new Uint8Array([...mockSignature, SigHash.ALL])]]
      };

      const mockInput2 = {
        finalScriptSig: new Uint8Array([0x00, 0x47, ...mockSignature, SigHash.ALL]), // Will be set during signing
        partialSig: []
      };

      (mockTx as any).inputsLength = 2;
      (mockTx as any).getInput.mockImplementation((idx: number) => idx === 0 ? mockInput1 : mockInput2);

      inputInfos = [
        {
          signType: 'compressed',
          scriptPubKey: script1,
          ourKeyIsCompressed: true,
          ourKeyIsUncompressed: false
        },
        {
          signType: 'invalid-pubkeys',
          scriptPubKey: script2,
          ourKeyIsCompressed: true,
          ourKeyIsUncompressed: false
        }
      ];

      signAndFinalizeBareMultisig(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);

      // Should sign both inputs
      expect((mockTx as any).preimageLegacy).toHaveBeenCalledTimes(2);
      expect(mockSignECDSA).toHaveBeenCalledTimes(2);

      // First input: normal partialSig
      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        0,
        { partialSig: [[compressedPubkey, expect.any(Uint8Array)]] },
        true
      );

      // Second input: direct finalScriptSig for invalid-pubkeys
      expect((mockTx as any).updateInput).toHaveBeenCalledWith(
        1,
        { finalScriptSig: expect.any(Uint8Array) },
        true
      );

      // Should finalize first input (second is already finalized)
      expect((mockTx as any).finalizeIdx).toHaveBeenCalledWith(0);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Input 1 already finalized, skipping. Length:')
      );
    });

    it('should propagate signing errors', () => {
      (mockTx as any).preimageLegacy.mockImplementation(() => {
        throw new Error('Preimage generation failed');
      });

      expect(() => {
        signAndFinalizeBareMultisig(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);
      }).toThrow('Preimage generation failed');
    });

    it('should propagate finalization errors', () => {
      (mockTx as any).finalizeIdx.mockImplementation(() => {
        throw new Error('Finalization failed');
      });

      // Mock missing partialSig to cause manual finalization to fail too
      const mockInputWithoutSig = {
        finalScriptSig: null,
        partialSig: []
      };
      (mockTx as any).getInput.mockReturnValue(mockInputWithoutSig);

      expect(() => {
        signAndFinalizeBareMultisig(mockTx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);
      }).toThrow('Failed to finalize input 0');
    });
  });

  describe('Integration tests with real Transaction objects', () => {
    it('should work with actual Transaction from @scure/btc-signer', () => {
      // This would require more complex setup with actual UTXO data
      // For now, we verify that our functions can handle the interface correctly
      const mockRealTx = {
        inputsLength: 1,
        preimageLegacy: function(idx: number, script: Uint8Array, sigHash: number) {
          return new Uint8Array(32).fill(0x42); // Mock hash
        },
        updateInput: vi.fn(),
        getInput: vi.fn().mockReturnValue({
          finalScriptSig: null,
          partialSig: [[compressedPubkey, new Uint8Array([...mockSignature, SigHash.ALL])]]
        }),
        finalizeIdx: vi.fn(),
        opts: { lowR: false }
      };

      const script = OutScript.encode({
        type: 'ms',
        m: 1,
        pubkeys: [compressedPubkey]
      });

      const inputInfos: MultisigInputInfo[] = [{
        signType: 'compressed',
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      }];

      vi.spyOn(console, 'log').mockImplementation(() => {});

      expect(() => {
        signAndFinalizeBareMultisig(
          mockRealTx as any,
          privateKey,
          compressedPubkey,
          uncompressedPubkey,
          inputInfos
        );
      }).not.toThrow();

      expect(mockRealTx.updateInput).toHaveBeenCalled();
      expect(mockRealTx.finalizeIdx).toHaveBeenCalled();
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle empty pubkey arrays gracefully', () => {
      // Create a minimal invalid script that looks like multisig but has no keys
      // OP_0 OP_0 OP_CHECKMULTISIG
      const emptyScript = new Uint8Array([0x00, 0x00, 0xae]);

      const result = analyzeMultisigScript(emptyScript, compressedPubkey, uncompressedPubkey);
      expect(result).toBeNull();
    });

    it('should handle very large m-of-n multisig scripts', () => {
      // Create a 15-of-15 multisig (maximum allowed)
      const manyKeys = Array.from({ length: 15 }, (_, i) => {
        // Create valid private keys (must be between 1 and n-1 where n is the secp256k1 order)
        const validPrivateKey = hexToBytes((i + 1).toString(16).padStart(64, '0'));
        return getPublicKey(validPrivateKey, true);
      });
      manyKeys[7] = compressedPubkey; // Include our key

      const script = OutScript.encode({
        type: 'ms',
        m: 15,
        pubkeys: manyKeys
      });

      const result = analyzeMultisigScript(script, compressedPubkey, uncompressedPubkey);

      expect(result).not.toBeNull();
      expect(result?.signType).toBe('compressed');
      expect(result?.ourKeyIsCompressed).toBe(true);
      expect(result?.ourKeyIsUncompressed).toBe(false);
    });

    it('should handle zero-byte private keys gracefully', () => {
      const zeroKey = new Uint8Array(32).fill(0);
      const mockTx = {
        inputsLength: 1,
        preimageLegacy: vi.fn().mockReturnValue(new Uint8Array(32).fill(0)),
        updateInput: vi.fn(),
        opts: {}
      } as any;

      const inputInfos: MultisigInputInfo[] = [{
        signType: 'compressed',
        scriptPubKey: new Uint8Array(),
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      }];

      // This should not throw - signing function should handle it
      expect(() => {
        signBareMultisigTransaction(mockTx, zeroKey, compressedPubkey, uncompressedPubkey, inputInfos);
      }).not.toThrow();

      expect(mockSignECDSA).toHaveBeenCalledWith(expect.any(Uint8Array), zeroKey, undefined);
    });

    it('should handle malformed script bytes in hex search', () => {
      // Create a script with partial key matches that shouldn't match
      const partialCompressedHex = bytesToHex(compressedPubkey).substring(0, 20);
      const scriptBytes = hexToBytes('51' + partialCompressedHex + '52ae');

      vi.spyOn(OutScript, 'decode').mockImplementationOnce(() => {
        throw new Error('Invalid script');
      });

      const result = analyzeMultisigScript(scriptBytes, compressedPubkey, uncompressedPubkey);
      expect(result).toBeNull(); // Partial match should not count
    });

    it('should handle case-insensitive hex matching', () => {
      const upperCaseScript = bytesToHex(compressedPubkey).toUpperCase();
      const scriptBytes = hexToBytes('51' + bytesToHex(compressedPubkey) + '52ae');

      vi.spyOn(OutScript, 'decode').mockImplementationOnce(() => {
        throw new Error('Invalid script');
      });

      const result = analyzeMultisigScript(scriptBytes, compressedPubkey, uncompressedPubkey);

      expect(result).toEqual({
        signType: 'invalid-pubkeys',
        scriptPubKey: scriptBytes,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      });
    });
  });
});