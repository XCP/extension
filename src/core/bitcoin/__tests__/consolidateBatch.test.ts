/**
 * Tests for consolidateBatch.ts - Batch Consolidation for Bare Multisig UTXOs
 *
 * Runs the real signer end-to-end against fixture previous transactions:
 * fee calculation, prev-tx cross-checks, signability guards, and
 * cryptographic verification of the produced signatures.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import { getPublicKey } from '@noble/secp256k1';
import { base58check } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { consolidateBareMultisigBatch } from '../consolidateBatch';
import type { ConsolidationData, ConsolidationUTXO } from '../consolidationApi';
import {
  bareMultisigScript,
  buildPrevTx,
  counterpartyDataKey,
  derToCompact,
  legacySighashAll,
  offCurveFakeKey,
  parseWireTx,
  txidOf,
  type WireOutput,
} from './helpers/bareMultisigFixtures';

// Test key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const FEE_ADDRESS = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
const compressedPubkey = getPublicKey(privateKeyBytes, true);
const uncompressedPubkey = getPublicKey(privateKeyBytes, false);
const otherKey = getPublicKey(hexToBytes('11'.repeat(32)), true);

const historicalScript = bareMultisigScript(1, [compressedPubkey, counterpartyDataKey()]);
const currentScript = bareMultisigScript(1, [offCurveFakeKey(0x02), offCurveFakeKey(0x03), uncompressedPubkey]);

const p2pkhScriptHex = (address: string): string =>
  '76a914' + bytesToHex(base58check(sha256).decode(address).slice(1)) + '88ac';

function makeUtxo(script: Uint8Array, amount: number, seed: number): ConsolidationUTXO {
  const prevTxBytes = buildPrevTx([{ amount: BigInt(amount), script }], seed);
  return {
    txid: txidOf(prevTxBytes),
    vout: 0,
    amount,
    prev_tx_hex: bytesToHex(prevTxBytes),
    script: bytesToHex(script),
    position: 0,
    script_type: 'bare_multisig',
  };
}

function createBatchData(options: {
  utxoCount?: number;
  amountPerUtxo?: number;
  feePercent?: number;
  exemptionThreshold?: number;
  feeAddress?: string;
  script?: Uint8Array;
  utxos?: ConsolidationUTXO[];
} = {}): ConsolidationData {
  const {
    utxoCount = 1,
    amountPerUtxo = 100_000,
    feePercent = 0,
    exemptionThreshold = 0,
    feeAddress = FEE_ADDRESS,
    script = historicalScript,
  } = options;

  const utxos = options.utxos
    ?? Array.from({ length: utxoCount }, (_, i) => makeUtxo(script, amountPerUtxo, i + 1));

  return {
    address: TEST_ADDRESS,
    summary: {
      total_utxos: utxos.length,
      total_btc: utxos.reduce((sum, u) => sum + u.amount, 0) / 100_000_000,
      batches_required: 1,
      current_batch: 1,
      batch_utxos: utxos.length,
      max_batch_utxos: 420,
    },
    fee_config: {
      fee_address: feeAddress,
      fee_percent: feePercent,
      exemption_threshold: exemptionThreshold,
    },
    utxos,
    mempool_status: { pending_consolidations: 0, pending_utxo_count: 0, can_broadcast_more: true },
    stamp_protection: { protected_utxos: 0, protected_btc: 0, included: false },
  };
}

describe('consolidateBareMultisigBatch', () => {
  describe('Error handling', () => {
    it('should throw error when batch has no UTXOs', async () => {
      const batchData = createBatchData();
      batchData.utxos = [];

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow('No UTXOs to consolidate in this batch');
    });

    it('should throw error when output amount is below dust threshold', async () => {
      const batchData = createBatchData({ utxoCount: 1, amountPerUtxo: 1000 });

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 100)
      ).rejects.toThrow(/Output amount.*is below dust threshold/);
    });

    it('should include fee details in dust threshold error', async () => {
      const batchData = createBatchData({ utxoCount: 1, amountPerUtxo: 1000 });

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 100)
      ).rejects.toThrow(/Total input: 1000 sats, Total fees: 16000 sats/);
    });

    it('should throw when service fee applies but no fee address is configured', async () => {
      const batchData = createBatchData({
        utxoCount: 1,
        amountPerUtxo: 1_000_000,
        feePercent: 10,
        feeAddress: '',
      });

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow('Recovery fee configuration is unavailable');
    });
  });

  describe('Previous transaction cross-checks', () => {
    it('should reject a UTXO whose amount disagrees with its previous transaction', async () => {
      const batchData = createBatchData();
      batchData.utxos[0]!.amount += 1;

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow(/Value mismatch for UTXO/);
    });

    it('should reject a UTXO whose script disagrees with its previous transaction', async () => {
      const batchData = createBatchData();
      batchData.utxos[0]!.script = bytesToHex(currentScript);

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow(/Script mismatch for UTXO/);
    });

    it('should reject prev_tx_hex that does not hash to the txid', async () => {
      const batchData = createBatchData();
      const tampered = hexToBytes(batchData.utxos[0]!.prev_tx_hex);
      tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0x01; // flip a locktime bit
      batchData.utxos[0]!.prev_tx_hex = bytesToHex(tampered);

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow(/does not match its txid/);
    });

    it('should reject a vout the previous transaction does not have', async () => {
      const batchData = createBatchData();
      batchData.utxos[0]!.vout = 5;

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow(/Output 5 not found in previous transaction/);
    });

    it('should consolidate two outputs of the same previous transaction', async () => {
      const outputs: WireOutput[] = [
        { amount: 60_000n, script: historicalScript },
        { amount: 40_000n, script: currentScript },
      ];
      const prevTxBytes = buildPrevTx(outputs, 7);
      const shared = {
        txid: txidOf(prevTxBytes),
        prev_tx_hex: bytesToHex(prevTxBytes),
        position: 0,
        script_type: 'bare_multisig',
      };
      const batchData = createBatchData({
        utxos: [
          { ...shared, vout: 0, amount: 60_000, script: bytesToHex(historicalScript) },
          { ...shared, vout: 1, amount: 40_000, script: bytesToHex(currentScript) },
        ],
      });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      expect(result.totalInput).toBe(100_000);
      expect(parseWireTx(hexToBytes(result.signedTxHex)).inputs).toHaveLength(2);
    });
  });

  describe('Signability guards', () => {
    it('should reject a 2-of-2 script even when our key is present', async () => {
      const script = bareMultisigScript(2, [compressedPubkey, otherKey]);
      const batchData = createBatchData({ script });

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow(/Cannot sign UTXO .*: unsupported 2-of-2 multisig/);
    });

    it('should reject a script that does not contain our key', async () => {
      const script = bareMultisigScript(1, [otherKey, counterpartyDataKey()]);
      const batchData = createBatchData({ script });

      await expect(
        consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10)
      ).rejects.toThrow(/Cannot sign UTXO .*: script does not contain our public key/);
    });
  });

  describe('Fee calculations', () => {
    it('should charge the estimated network fee exactly', async () => {
      const batchData = createBatchData({ utxoCount: 1, amountPerUtxo: 1_000_000 });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      // (1 input * 115 + 10 base + 1 varint + 1 output * 34) * 10 sat/vB
      expect(result.networkFee).toBe(1600);
      expect(result.totalInput).toBe(1_000_000);
      expect(result.outputAmount).toBe(1_000_000 - 1600);
      expect(result.serviceFee).toBe(0);
    });

    it('should scale the network fee with input count', async () => {
      const batchData = createBatchData({ utxoCount: 10, amountPerUtxo: 100_000 });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      // (10 * 115 + 10 + 1 + 34) * 10
      expect(result.networkFee).toBe(11_950);
      expect(result.outputAmount).toBe(1_000_000 - 11_950);
    });

    it('should apply service fee when above exemption threshold', async () => {
      const batchData = createBatchData({
        utxoCount: 5,
        amountPerUtxo: 200_000,
        feePercent: 5,
        exemptionThreshold: 100_000,
      });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      // Two outputs: (5 * 115 + 10 + 1 + 2 * 34) * 10 = 6540 network fee,
      // then 5% of the remainder goes to the service address.
      expect(result.networkFee).toBe(6540);
      expect(result.serviceFee).toBe(49_673);
      expect(result.outputAmount).toBe(1_000_000 - 6540 - 49_673);

      const wire = parseWireTx(hexToBytes(result.signedTxHex));
      expect(wire.outputs).toHaveLength(2);
      expect(wire.outputs[0]!.amount).toBe(BigInt(result.outputAmount));
      expect(bytesToHex(wire.outputs[1]!.script)).toBe(p2pkhScriptHex(FEE_ADDRESS));
      expect(wire.outputs[1]!.amount).toBe(BigInt(result.serviceFee));
    });

    it('should return a sub-dust service fee to the user instead of burning it', async () => {
      const batchData = createBatchData({
        utxoCount: 1,
        amountPerUtxo: 12_000,
        feePercent: 5,
        exemptionThreshold: 10_000,
      });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      // Candidate service fee is 5% of (12000 - 1940) = 503 sats: below dust,
      // so no service output and the user output absorbs it entirely.
      expect(result.serviceFee).toBe(0);
      expect(result.networkFee).toBe(1600);
      expect(result.outputAmount).toBe(12_000 - 1600);
      expect(parseWireTx(hexToBytes(result.signedTxHex)).outputs).toHaveLength(1);
    });

    it('should not apply service fee when below exemption threshold', async () => {
      const batchData = createBatchData({
        utxoCount: 1,
        amountPerUtxo: 50_000,
        feePercent: 5,
        exemptionThreshold: 100_000,
      });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      expect(result.serviceFee).toBe(0);
    });

    it('should not apply service fee when fee_percent is 0', async () => {
      const batchData = createBatchData({ utxoCount: 5, amountPerUtxo: 200_000, feePercent: 0 });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      expect(result.serviceFee).toBe(0);
    });
  });

  describe('Signed transaction', () => {
    it('should sign a mixed batch of Counterparty layouts with valid signatures', async () => {
      const specs = [
        { script: historicalScript, amount: 40_000, signer: compressedPubkey },
        { script: currentScript, amount: 35_000, signer: uncompressedPubkey },
        { script: bareMultisigScript(1, [compressedPubkey, otherKey]), amount: 25_000, signer: compressedPubkey },
      ];
      const batchData = createBatchData({
        utxos: specs.map((spec, i) => makeUtxo(spec.script, spec.amount, i + 1)),
      });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10);

      expect(result.totalInput).toBe(100_000);
      expect(result.totalInput).toBe(result.outputAmount + result.serviceFee + result.networkFee);
      expect(result.txSize).toBe(result.signedTxHex.length / 2);

      const wire = parseWireTx(hexToBytes(result.signedTxHex));
      expect(wire.outputs).toHaveLength(1);
      expect(bytesToHex(wire.outputs[0]!.script)).toBe(p2pkhScriptHex(TEST_ADDRESS));
      expect(wire.outputs[0]!.amount).toBe(BigInt(result.outputAmount));

      for (const [index, spec] of specs.entries()) {
        const scriptSig = wire.inputs[index]!.script;
        expect(scriptSig[0]).toBe(0x00);
        expect(scriptSig[scriptSig.length - 1]).toBe(0x01);
        const sighash = legacySighashAll(wire, index, spec.script);
        expect(
          secp.verify(derToCompact(scriptSig.slice(2, -1)), sighash, spec.signer, { prehash: false })
        ).toBe(true);
      }
    });

    it('should send to a custom destination address when provided', async () => {
      const batchData = createBatchData({ utxoCount: 1, amountPerUtxo: 100_000 });

      const result = await consolidateBareMultisigBatch(
        TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 10, FEE_ADDRESS
      );

      const wire = parseWireTx(hexToBytes(result.signedTxHex));
      expect(bytesToHex(wire.outputs[0]!.script)).toBe(p2pkhScriptHex(FEE_ADDRESS));
    });
  });

  describe('Large batch handling', () => {
    it('should handle input counts past the varint boundary', async () => {
      const batchData = createBatchData({ utxoCount: 253, amountPerUtxo: 10_000 });

      const result = await consolidateBareMultisigBatch(TEST_PRIVATE_KEY, TEST_ADDRESS, batchData, 1);

      // (253 * 115 + 10 + 3-byte varint + 34) * 1
      expect(result.networkFee).toBe(29_142);
      expect(result.totalInput).toBe(2_530_000);
      expect(result.outputAmount).toBe(2_530_000 - 29_142);

      const wire = parseWireTx(hexToBytes(result.signedTxHex));
      expect(wire.inputs).toHaveLength(253);
      // Spot-check first and last signatures
      for (const index of [0, 252]) {
        const sighash = legacySighashAll(wire, index, historicalScript);
        expect(
          secp.verify(derToCompact(wire.inputs[index]!.script.slice(2, -1)), sighash, compressedPubkey, { prehash: false })
        ).toBe(true);
      }
    });
  });
});
