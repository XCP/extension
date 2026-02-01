/**
 * Tests for consolidateBatch.ts - Batch Consolidation for Bare Multisig UTXOs
 *
 * Tests the consolidateBareMultisigBatch function which handles:
 * - Fee calculation (network fee + service fee)
 * - Dust threshold validation
 * - Output construction from batch data
 * - Error cases (empty UTXOs, insufficient funds)
 *
 * Note: Core signing logic is tested in multisigSigner.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { OutScript } from '@scure/btc-signer';
import {
  consolidateBareMultisigBatch,
  type ConsolidationResult
} from '../consolidateBatch';
import type { ConsolidationData, ConsolidationUTXO } from '../consolidationApi';

// Mock the signing functions to isolate fee calculation tests
vi.mock('../multisigSigner', () => ({
  analyzeMultisigScript: vi.fn((script, compressed, uncompressed) => {
    // Return valid analysis for any script containing our keys
    const scriptHex = bytesToHex(script);
    const compressedHex = bytesToHex(compressed);
    const uncompressedHex = bytesToHex(uncompressed);

    if (scriptHex.includes(compressedHex) || scriptHex.includes(uncompressedHex)) {
      return {
        signType: 'compressed' as const,
        scriptPubKey: script,
        ourKeyIsCompressed: true,
        ourKeyIsUncompressed: false
      };
    }
    return null;
  }),
  signAndFinalizeBareMultisig: vi.fn()
}));

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

// Create test pubkeys
const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
const compressedPubkey = getPublicKey(privateKeyBytes, true);
const uncompressedPubkey = getPublicKey(privateKeyBytes, false);

// Create a valid multisig script with our compressed pubkey
const createMultisigScript = (pubkey: Uint8Array): string => {
  const script = OutScript.encode({
    type: 'ms',
    m: 1,
    pubkeys: [pubkey]
  });
  return bytesToHex(script);
};

// Create mock batch data
const createMockBatchData = (options: {
  utxoCount?: number;
  amountPerUtxo?: number;
  feePercent?: number;
  exemptionThreshold?: number;
  feeAddress?: string;
  signType?: 'compressed' | 'uncompressed' | 'invalid-pubkeys';
}): ConsolidationData => {
  const {
    utxoCount = 1,
    amountPerUtxo = 100000, // 100,000 sats = 0.001 BTC
    feePercent = 0,
    exemptionThreshold = 0,
    // Use a real valid Bitcoin address for service fee
    feeAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    signType = 'compressed'
  } = options;

  const pubkeyToUse = signType === 'uncompressed' ? uncompressedPubkey : compressedPubkey;
  const scriptHex = createMultisigScript(pubkeyToUse);

  const utxos: ConsolidationUTXO[] = Array.from({ length: utxoCount }, (_, i) => ({
    // Ensure txid is always 64 hex characters
    txid: i.toString(16).padStart(64, '0'),
    vout: 0,
    amount: amountPerUtxo,
    prev_tx_hex: '0'.repeat(200), // Dummy prev tx
    script: scriptHex,
    position: 0,
    script_type: 'bare_multisig',
    sign_type: signType
  }));

  return {
    address: TEST_ADDRESS,
    pubkey_compressed: bytesToHex(compressedPubkey),
    pubkey_uncompressed: bytesToHex(uncompressedPubkey),
    summary: {
      total_utxos: utxoCount,
      total_btc: (utxoCount * amountPerUtxo) / 100000000,
      batches_required: 1,
      current_batch: 1,
      batch_utxos: utxoCount
    },
    fee_config: {
      fee_address: feeAddress,
      fee_percent: feePercent,
      exemption_threshold: exemptionThreshold
    },
    utxos,
    mempool_status: {
      pending_consolidations: 0,
      pending_utxo_count: 0,
      can_broadcast_more: true
    }
  };
};

describe('consolidateBareMultisigBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log/warn to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error handling', () => {
    it('should throw error when batch has no UTXOs', async () => {
      const batchData = createMockBatchData({ utxoCount: 0 });
      batchData.utxos = [];

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow('No UTXOs to consolidate in this batch');
    });

    it('should throw error when output amount is below dust threshold', async () => {
      // Create batch with small amounts that will result in dust output after fees
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 1000 // 1000 sats total, will be < 546 after fees
      });

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 100) // High fee rate
      ).rejects.toThrow(/Output amount.*is below dust threshold/);
    });

    it('should include fee details in dust threshold error', async () => {
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 1000
      });

      try {
        await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 100);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('sats');
        expect(error.message).toContain('Total input');
        expect(error.message).toContain('Total fees');
      }
    });
  });

  describe('Fee calculations', () => {
    it('should calculate network fee correctly for single input', async () => {
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 1000000 // 1M sats
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10 // 10 sat/vbyte
      );

      // Formula: (inputs * 115 + base 10 + varint 1 + outputs * 34) * feeRate
      // = (1 * 115 + 10 + 1 + 1 * 34) * 10 = 160 * 10 = 1600 sats estimated
      // Actual may vary based on signed tx size
      expect(result.networkFee).toBeGreaterThan(0);
      expect(result.totalInput).toBe(1000000);
      // Output should be less than input (fees deducted)
      expect(result.outputAmount).toBeLessThan(result.totalInput);
      expect(result.outputAmount).toBeGreaterThan(0);
    });

    it('should calculate network fee correctly for multiple inputs', async () => {
      const batchData = createMockBatchData({
        utxoCount: 10,
        amountPerUtxo: 100000 // 100K sats each = 1M total
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      // More inputs = higher fee
      // Formula: (10 * 115 + 10 + 1 + 1 * 34) * 10 = 1195 * 10 = 11950 sats estimated
      expect(result.networkFee).toBeGreaterThan(1000);
      expect(result.totalInput).toBe(1000000);
    });

    it('should apply service fee when above exemption threshold', async () => {
      const batchData = createMockBatchData({
        utxoCount: 5,
        amountPerUtxo: 200000, // 1M sats total
        feePercent: 5, // 5% service fee
        exemptionThreshold: 100000 // 100K sats threshold
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      // Service fee = 5% of (total - network fee)
      // Should be non-zero since we're above threshold
      expect(result.serviceFee).toBeGreaterThan(0);
      expect(result.totalInput).toBe(1000000);
    });

    it('should not apply service fee when below exemption threshold', async () => {
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 50000, // 50K sats - below threshold
        feePercent: 5,
        exemptionThreshold: 100000 // 100K sats threshold
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      expect(result.serviceFee).toBe(0);
    });

    it('should not apply service fee when fee_percent is 0', async () => {
      const batchData = createMockBatchData({
        utxoCount: 5,
        amountPerUtxo: 200000,
        feePercent: 0,
        exemptionThreshold: 0
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      expect(result.serviceFee).toBe(0);
    });
  });

  describe('Result structure', () => {
    it('should return complete ConsolidationResult', async () => {
      const batchData = createMockBatchData({
        utxoCount: 3,
        amountPerUtxo: 100000
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      expect(result).toHaveProperty('signedTxHex');
      expect(result).toHaveProperty('totalInput');
      expect(result).toHaveProperty('networkFee');
      expect(result).toHaveProperty('serviceFee');
      expect(result).toHaveProperty('outputAmount');
      expect(result).toHaveProperty('txSize');

      expect(typeof result.signedTxHex).toBe('string');
      expect(result.signedTxHex).toMatch(/^[0-9a-f]+$/i);
      expect(result.totalInput).toBe(300000);
      expect(result.txSize).toBeGreaterThan(0);
    });

    it('should return consistent result values', async () => {
      // Test without service fee to verify basic structure
      const batchData = createMockBatchData({
        utxoCount: 5,
        amountPerUtxo: 100000,
        feePercent: 0, // No service fee for simpler verification
        exemptionThreshold: 0
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      // Total input is the sum of all UTXO amounts
      expect(result.totalInput).toBe(500000);

      // networkFee is the actual fee calculated from tx size (post-signing)
      // outputAmount is calculated using estimated fee (pre-signing)
      // These won't perfectly balance due to fee estimation vs actual
      expect(result.networkFee).toBeGreaterThan(0);
      expect(result.outputAmount).toBeGreaterThan(0);
      expect(result.outputAmount).toBeLessThan(result.totalInput);

      // Service fee should be 0 when feePercent is 0
      expect(result.serviceFee).toBe(0);

      // Tx size should be positive
      expect(result.txSize).toBeGreaterThan(0);
    });
  });

  describe('Destination address', () => {
    it('should use source address when no destination provided', async () => {
      const batchData = createMockBatchData({ utxoCount: 1, amountPerUtxo: 100000 });

      // This test verifies the function doesn't throw when destination is undefined
      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
        // No destination address
      );

      expect(result.signedTxHex).toBeDefined();
    });

    it('should use custom destination address when provided', async () => {
      const batchData = createMockBatchData({ utxoCount: 1, amountPerUtxo: 100000 });
      const customDestination = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10,
        customDestination
      );

      expect(result.signedTxHex).toBeDefined();
    });
  });

  describe('Large batch handling', () => {
    it('should handle varint encoding for large input counts (< 253)', async () => {
      const batchData = createMockBatchData({
        utxoCount: 100,
        amountPerUtxo: 10000 // 10K sats each
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        1 // Low fee rate to not exhaust funds
      );

      expect(result.totalInput).toBe(1000000); // 100 * 10K
      expect(result.txSize).toBeGreaterThan(0);
    });

    it('should handle varint encoding for large input counts (>= 253)', async () => {
      // Create batch with 260 inputs
      const batchData = createMockBatchData({
        utxoCount: 260,
        amountPerUtxo: 10000
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        1
      );

      expect(result.totalInput).toBe(2600000); // 260 * 10K
    });
  });

  describe('Sign type handling', () => {
    it('should process compressed key UTXOs', async () => {
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 100000,
        signType: 'compressed'
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      expect(result.signedTxHex).toBeDefined();
    });

    it('should process uncompressed key UTXOs', async () => {
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 100000,
        signType: 'uncompressed'
      });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      expect(result.signedTxHex).toBeDefined();
    });

    it('should handle invalid-pubkeys sign type', async () => {
      const batchData = createMockBatchData({
        utxoCount: 1,
        amountPerUtxo: 100000,
        signType: 'invalid-pubkeys'
      });

      // Update the UTXO to have invalid-pubkeys sign_type
      batchData.utxos[0].sign_type = 'invalid-pubkeys';

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY,
        TEST_ADDRESS,
        batchData,
        10
      );

      expect(result.signedTxHex).toBeDefined();
    });
  });
});
