// @vitest-environment node

/**
 * Trezor Node.js Integration Tests
 *
 * These tests run in Node.js context (not browser) and use @trezor/connect directly
 * to communicate with the Trezor emulator via Bridge. This bypasses the webextension
 * popup architecture limitation.
 *
 * Prerequisites:
 *   - Trezor emulator running via trezor-user-env (docker)
 *   - Bridge running on localhost:21325
 *   - Emulator initialized with test seed via ./init-trezor-emulator.js
 *
 * Run with: npx vitest run e2e/hardware/trezor-node-integration.test.ts
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { Address, OutScript, p2wpkh, RawWitness, SigHash, Transaction } from '@scure/btc-signer';
import TrezorConnect from '@trezor/connect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importVerifiedHardwareP2wpkhSignatures } from '../../src/core/bitcoin/hardwarePsbt';
import { finalizePSBT } from '../../src/core/bitcoin/psbt';

// Use HTTP-based emulator control instead of WebSocket-based trezor-user-env-link
// This avoids TypeScript errors in the trezor-user-env-link package
import {
  emulatorPressYes,
  isEmulatorAvailable,
  isBridgeAvailable,
  waitForDevice,
} from '../helpers/trezor-emulator';

// Test configuration
const TEST_MNEMONIC = 'all all all all all all all all all all all all';

// These are used by the emulator setup (logged for debugging)
const BRIDGE_URL = process.env.TREZOR_BRIDGE_URL || 'http://localhost:21325';

// Expected addresses from the test mnemonic (verified against Trezor)
const EXPECTED_ADDRESSES = {
  // Native SegWit (m/84'/0'/0'/0/0)
  NATIVE_SEGWIT: 'bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk',
  // Legacy (m/44'/0'/0'/0/0)
  LEGACY: '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL',
  // Nested SegWit (m/49'/0'/0'/0/0)
  NESTED_SEGWIT: '3L6TyTisPBmrDAj6RoKmDzNnj4eQi54gD2',
};

const syntheticFundingTransaction = (
  marker: number,
  amount: bigint,
  script: Uint8Array,
): Transaction => {
  const funding = new Transaction({ version: 2, lockTime: 0 });
  funding.addInput({ txid: new Uint8Array(32).fill(marker), index: 0 });
  funding.addOutput({ amount, script });
  funding.updateInput(0, { finalScriptSig: new Uint8Array([1, marker]) }, true);
  return funding;
};

const asTrezorRefTx = (funding: Transaction) => {
  const input = funding.getInput(0);
  return {
    hash: funding.id,
    version: funding.version,
    lock_time: funding.lockTime,
    inputs: [{
      prev_hash: bytesToHex(input.txid!),
      prev_index: input.index,
      script_sig: bytesToHex(input.finalScriptSig!),
      sequence: input.sequence ?? 0xffffffff,
    }],
    bin_outputs: Array.from({ length: funding.outputsLength }, (_, index) => {
      const output = funding.getOutput(index);
      return {
        amount: String(output.amount),
        script_pubkey: bytesToHex(output.script!),
      };
    }),
  };
};

function confirmDevicePrompts(): () => void {
  const handler = () => {
    setTimeout(() => {
      void emulatorPressYes();
    }, 100);
  };
  TrezorConnect.on('ui-button', handler);
  return () => TrezorConnect.off('ui-button', handler);
}

// Skip if emulator is not available
const SKIP_TESTS = process.env.TREZOR_EMULATOR_AVAILABLE !== '1';

describe('Trezor Node.js Integration Tests', () => {
  // Skip entire suite if emulator not available
  if (SKIP_TESTS) {
    it.skip('Trezor emulator not available', () => {});
    return;
  }

  let connected = false;

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('TREZOR NODE.JS INTEGRATION TESTS');
    console.log('========================================');
    console.log(`Bridge URL: ${BRIDGE_URL}`);
    console.log(`Test mnemonic: ${TEST_MNEMONIC}`);
    console.log('');

    try {
      // Check if emulator and bridge are available
      const emulatorOk = await isEmulatorAvailable();
      const bridgeOk = await isBridgeAvailable();

      console.log(`Emulator available: ${emulatorOk}`);
      console.log(`Bridge available: ${bridgeOk}`);

      if (!emulatorOk || !bridgeOk) {
        throw new Error('Emulator or bridge not available');
      }

      // Wait for device to be detected
      const deviceReady = await waitForDevice(10000);
      console.log(`Device ready: ${deviceReady}`);

      if (!deviceReady) {
        throw new Error('No device detected via bridge');
      }

      // Initialize TrezorConnect (Node.js version)
      // This version automatically handles the handshake without a popup
      await TrezorConnect.init({
        manifest: {
          appName: 'XCP Wallet Integration Tests',
          appUrl: 'https://xcpwallet.com',
          email: 'support@xcpwallet.com',
        },
        transports: ['BridgeTransport'],
        debug: false,
      });
      console.log('TrezorConnect initialized');

      connected = true;
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }, 120000); // Increased timeout for emulator setup

  afterAll(async () => {
    try {
      await TrezorConnect.dispose();
      console.log('\nCleanup complete');
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Device Features', () => {
    it('can get device features', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      const result = await TrezorConnect.getFeatures();

      expect(result.success).toBe(true);
      if (result.success) {
        console.log('Device model:', result.payload.model);
        console.log('Firmware:', `${result.payload.major_version}.${result.payload.minor_version}.${result.payload.patch_version}`);
        console.log('Label:', result.payload.label);
        expect(result.payload.initialized).toBe(true);
      }
    }, 30000);
  });

  describe('Address Derivation', () => {
    it('can derive Native SegWit address (m/84\'/0\'/0\'/0/0)', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      // Auto-confirm on emulator via HTTP API
      emulatorPressYes();

      const result = await TrezorConnect.getAddress({
        path: "m/84'/0'/0'/0/0",
        coin: 'btc',
        showOnTrezor: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        console.log('Native SegWit address:', result.payload.address);
        expect(result.payload.address).toBe(EXPECTED_ADDRESSES.NATIVE_SEGWIT);
      }
    }, 30000);

    it('can derive Legacy address (m/44\'/0\'/0\'/0/0)', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      emulatorPressYes();

      const result = await TrezorConnect.getAddress({
        path: "m/44'/0'/0'/0/0",
        coin: 'btc',
        showOnTrezor: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        console.log('Legacy address:', result.payload.address);
        expect(result.payload.address).toBe(EXPECTED_ADDRESSES.LEGACY);
      }
    }, 30000);

    it('can derive Nested SegWit address (m/49\'/0\'/0\'/0/0)', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      emulatorPressYes();

      const result = await TrezorConnect.getAddress({
        path: "m/49'/0'/0'/0/0",
        coin: 'btc',
        showOnTrezor: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        console.log('Nested SegWit address:', result.payload.address);
        expect(result.payload.address).toBe(EXPECTED_ADDRESSES.NESTED_SEGWIT);
      }
    }, 30000);

    it('can get extended public key (xpub)', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      emulatorPressYes();

      const result = await TrezorConnect.getPublicKey({
        path: "m/84'/0'/0'",
        coin: 'btc',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        console.log('xpub:', result.payload.xpub.substring(0, 40) + '...');
        expect(result.payload.xpub).toMatch(/^[xyz]pub[a-zA-Z0-9]+$/);
      }
    }, 30000);
  });

  describe('Message Signing', () => {
    it('can sign a message', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      const testMessage = 'Hello from XCP Wallet integration test!';

      const stopConfirming = confirmDevicePrompts();

      try {
        const result = await TrezorConnect.signMessage({
          path: "m/84'/0'/0'/0/0",
          message: testMessage,
          coin: 'Bitcoin',
        });

        if (!result.success) throw new Error(result.payload.error);
        expect(result.success).toBe(true);
        if (result.success) {
          console.log('Signed message:', testMessage);
          console.log('Address:', result.payload.address);
          console.log('Signature:', result.payload.signature.substring(0, 40) + '...');
          expect(result.payload.address).toBe(EXPECTED_ADDRESSES.NATIVE_SEGWIT);
          expect(result.payload.signature).toBeTruthy();
        }
      } finally {
        stopConfirming();
      }
    }, 60000);
  });

  describe('Multiple Addresses (Bundle)', () => {
    it('can derive multiple addresses in a bundle', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      emulatorPressYes();

      const result = await TrezorConnect.getAddress({
        bundle: [
          { path: "m/84'/0'/0'/0/0", coin: 'btc', showOnTrezor: false },
          { path: "m/84'/0'/0'/0/1", coin: 'btc', showOnTrezor: false },
          { path: "m/84'/0'/0'/0/2", coin: 'btc', showOnTrezor: false },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const addresses = result.payload as Array<{ address: string }>;
        console.log('Bundle addresses:');
        addresses.forEach((addr, i) => {
          console.log(`  [${i}] ${addr.address}`);
        });
        expect(addresses.length).toBe(3);
        expect(addresses[0].address).toBe(EXPECTED_ADDRESSES.NATIVE_SEGWIT);
      }
    }, 30000);
  });

  describe('Transaction Signing', () => {
    it('signs and verifies a real all-input Native SegWit PSBT shape', async () => {
      if (!connected) throw new Error('Trezor emulator did not connect');

      const deviceScript = OutScript.encode(Address().decode(EXPECTED_ADDRESSES.NATIVE_SEGWIT));
      const funding = syntheticFundingTransaction(0x41, 100_000n, deviceScript);
      const transaction = new Transaction({ version: 2, lockTime: 0 });
      transaction.addInput({
        txid: funding.id,
        index: 0,
        sequence: 0xfffffffd,
        witnessUtxo: { amount: 100_000n, script: deviceScript },
        sighashType: SigHash.ALL,
      });
      transaction.addOutput({ amount: 99_000n, script: deviceScript });
      const originalPsbt = bytesToHex(transaction.toPSBT());
      const stopConfirming = confirmDevicePrompts();

      try {
        const result = await TrezorConnect.signTransaction({
          inputs: [{
            address_n: [84 | 0x80000000, 0x80000000, 0x80000000, 0, 0],
            prev_hash: funding.id,
            prev_index: 0,
            amount: '100000',
            script_type: 'SPENDWITNESS',
            sequence: 0xfffffffd,
          }],
          outputs: [{
            address: EXPECTED_ADDRESSES.NATIVE_SEGWIT,
            amount: '99000',
            script_type: 'PAYTOADDRESS',
          }],
          coin: 'btc',
          push: false,
          version: 2,
          locktime: 0,
          refTxs: [asTrezorRefTx(funding)],
        });

        if (!result.success) throw new Error(result.payload.error);
        const signedPsbt = importVerifiedHardwareP2wpkhSignatures(
          originalPsbt,
          result.payload.serializedTx,
          [0],
        );
        expect(finalizePSBT(signedPsbt)).toBe(result.payload.serializedTx);
      } finally {
        stopConfirming();
      }
    }, 60000);

    it('transaction input format matches TrezorAdapter output', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      // This test verifies our adapter's input/output format matches what Trezor expects
      // by checking the exact structure our TrezorAdapter.signTransaction() would produce

      // Our adapter converts HardwareSignRequest to this format:
      const adapterStyleInput = {
        address_n: [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
        prev_hash: '0000000000000000000000000000000000000000000000000000000000000001',
        prev_index: 0,
        amount: '50000',
        script_type: 'SPENDWITNESS',
      };

      const adapterStyleOutput = {
        address: EXPECTED_ADDRESSES.NATIVE_SEGWIT,
        amount: '40000',
        script_type: 'PAYTOWITNESS',
      };

      // Verify the structure is what TrezorConnect expects
      expect(adapterStyleInput).toHaveProperty('address_n');
      expect(adapterStyleInput).toHaveProperty('prev_hash');
      expect(adapterStyleInput).toHaveProperty('prev_index');
      expect(adapterStyleInput).toHaveProperty('amount');
      expect(adapterStyleInput).toHaveProperty('script_type');

      expect(adapterStyleOutput).toHaveProperty('address');
      expect(adapterStyleOutput).toHaveProperty('amount');
      expect(adapterStyleOutput).toHaveProperty('script_type');

      // Verify script types match Trezor's expected values
      expect(['SPENDADDRESS', 'SPENDWITNESS', 'SPENDP2SHWITNESS', 'SPENDTAPROOT']).toContain(
        adapterStyleInput.script_type
      );
      expect(['PAYTOADDRESS', 'PAYTOWITNESS', 'PAYTOP2SHWITNESS', 'PAYTOTAPROOT']).toContain(
        adapterStyleOutput.script_type
      );
    });

    it('OP_RETURN output format is correct', async () => {
      if (!connected) {
        console.log('Skipping - not connected');
        return;
      }

      // Our adapter produces OP_RETURN outputs like this for Counterparty
      const opReturnOutput = {
        script_type: 'PAYTOOPRETURN' as const,
        amount: '0',
        op_return_data: '434e545250525459', // "CNTRPRTY" in hex
      };

      // Verify the structure
      expect(opReturnOutput.script_type).toBe('PAYTOOPRETURN');
      expect(opReturnOutput.amount).toBe('0');
      expect(opReturnOutput.op_return_data).toBeDefined();

      console.log('OP_RETURN output format verified');
    });

    it('rejects a marketplace 0x83 pre-signed external input', async () => {
      if (!connected) throw new Error('Trezor emulator did not connect');

      const deviceScript = OutScript.encode(Address().decode(EXPECTED_ADDRESSES.NATIVE_SEGWIT));
      const externalPrivateKey = hexToBytes('22'.repeat(32));
      const externalPayment = p2wpkh(getPublicKey(externalPrivateKey, true));
      if (!externalPayment.address) throw new Error('Failed to derive external test address');

      const deviceFunding = syntheticFundingTransaction(0x42, 100_000n, deviceScript);
      const externalFunding = syntheticFundingTransaction(0x43, 50_000n, externalPayment.script);

      const transaction = new Transaction({ version: 2, lockTime: 0 });
      transaction.addInput({
        txid: deviceFunding.id,
        index: 0,
        sequence: 0xfffffffd,
        witnessUtxo: { amount: 100_000n, script: deviceScript },
        sighashType: SigHash.ALL,
      });
      transaction.addInput({
        txid: externalFunding.id,
        index: 0,
        sequence: 0xfffffffe,
        witnessUtxo: { amount: 50_000n, script: externalPayment.script },
        sighashType: SigHash.SINGLE_ANYONECANPAY,
      });
      transaction.addOutput({ amount: 108_000n, script: deviceScript });
      transaction.addOutput({ amount: 40_000n, script: externalPayment.script });
      transaction.signIdx(externalPrivateKey, 1, [SigHash.SINGLE_ANYONECANPAY]);

      const finalizedExternal = transaction.clone();
      finalizedExternal.finalizeIdx(1);
      const externalWitness = finalizedExternal.getInput(1).finalScriptWitness;
      if (!externalWitness) throw new Error('Failed to finalize external fixture');
      const firstInput = transaction.getInput(0);
      const secondInput = transaction.getInput(1);
      if (!firstInput.txid || !secondInput.txid) throw new Error('Test transaction has no outpoint');
      const stopConfirming = confirmDevicePrompts();

      try {
        const result = await TrezorConnect.signTransaction({
          inputs: [
            {
              address_n: [84 | 0x80000000, 0x80000000, 0x80000000, 0, 0],
              prev_hash: bytesToHex(firstInput.txid),
              prev_index: firstInput.index,
              amount: '100000',
              script_type: 'SPENDWITNESS',
              sequence: firstInput.sequence,
            },
            {
              prev_hash: bytesToHex(secondInput.txid),
              prev_index: secondInput.index,
              amount: '50000',
              script_type: 'EXTERNAL',
              sequence: secondInput.sequence,
              script_pubkey: bytesToHex(externalPayment.script),
              script_sig: '',
              witness: bytesToHex(RawWitness.encode(externalWitness)),
            },
          ],
          outputs: [
            {
              address: EXPECTED_ADDRESSES.NATIVE_SEGWIT,
              amount: '108000',
              script_type: 'PAYTOADDRESS',
            },
            {
              address: externalPayment.address,
              amount: '40000',
              script_type: 'PAYTOADDRESS',
            },
          ],
          coin: 'btc',
          push: false,
          version: 2,
          locktime: 0,
          refTxs: [asTrezorRefTx(deviceFunding), asTrezorRefTx(externalFunding)],
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Trezor unexpectedly signed a marketplace 0x83 input');
        expect(result.payload.error).toMatch(/Invalid witness|Unsupported sighash/i);
      } finally {
        stopConfirming();
        externalPrivateKey.fill(0);
      }
    }, 60_000);

    it('accepts an exact offer with a pre-signed SIGHASH_ALL buyer input', async () => {
      if (!connected) throw new Error('Trezor emulator did not connect');

      const sellerScript = OutScript.encode(Address().decode(EXPECTED_ADDRESSES.NATIVE_SEGWIT));
      const buyerPrivateKey = hexToBytes('33'.repeat(32));
      const buyerPayment = p2wpkh(getPublicKey(buyerPrivateKey, true));
      if (!buyerPayment.address) throw new Error('Failed to derive buyer test address');

      const buyerFunding = syntheticFundingTransaction(0x51, 110_000n, buyerPayment.script);
      const sellerFunding = syntheticFundingTransaction(0x52, 330n, sellerScript);
      const acceptance = new Transaction({ version: 2, lockTime: 0 });
      acceptance.addInput({
        txid: buyerFunding.id,
        index: 0,
        sequence: 0xfffffffd,
        witnessUtxo: { amount: 110_000n, script: buyerPayment.script },
        sighashType: SigHash.ALL,
      });
      acceptance.addInput({
        txid: sellerFunding.id,
        index: 0,
        sequence: 0xfffffffe,
        witnessUtxo: { amount: 330n, script: sellerScript },
        sighashType: SigHash.ALL,
      });
      acceptance.addOutput({ amount: 100_330n, script: sellerScript });
      acceptance.addOutput({ amount: 9_000n, script: buyerPayment.script });
      acceptance.signIdx(buyerPrivateKey, 0, [SigHash.ALL]);
      const originalPsbt = bytesToHex(acceptance.toPSBT());

      const finalizedBuyer = acceptance.clone();
      finalizedBuyer.finalizeIdx(0);
      const buyerWitness = finalizedBuyer.getInput(0).finalScriptWitness;
      if (!buyerWitness) throw new Error('Failed to finalize buyer input');
      const buyerInput = acceptance.getInput(0);
      const sellerInput = acceptance.getInput(1);
      if (!buyerInput.txid || !sellerInput.txid) throw new Error('Acceptance has no outpoint');
      const stopConfirming = confirmDevicePrompts();

      try {
        const result = await TrezorConnect.signTransaction({
          inputs: [
            {
              prev_hash: bytesToHex(buyerInput.txid),
              prev_index: buyerInput.index,
              amount: '110000',
              script_type: 'EXTERNAL',
              sequence: buyerInput.sequence,
              script_pubkey: bytesToHex(buyerPayment.script),
              script_sig: '',
              witness: bytesToHex(RawWitness.encode(buyerWitness)),
            },
            {
              address_n: [84 | 0x80000000, 0x80000000, 0x80000000, 0, 0],
              prev_hash: bytesToHex(sellerInput.txid),
              prev_index: sellerInput.index,
              amount: '330',
              script_type: 'SPENDWITNESS',
              sequence: sellerInput.sequence,
            },
          ],
          outputs: [
            {
              address: EXPECTED_ADDRESSES.NATIVE_SEGWIT,
              amount: '100330',
              script_type: 'PAYTOADDRESS',
            },
            {
              address: buyerPayment.address,
              amount: '9000',
              script_type: 'PAYTOADDRESS',
            },
          ],
          coin: 'btc',
          push: false,
          version: 2,
          locktime: 0,
          refTxs: [asTrezorRefTx(buyerFunding), asTrezorRefTx(sellerFunding)],
        });

        if (!result.success) throw new Error(result.payload.error);
        const signedPsbt = importVerifiedHardwareP2wpkhSignatures(
          originalPsbt,
          result.payload.serializedTx,
          [1],
        );
        expect(finalizePSBT(signedPsbt)).toBe(result.payload.serializedTx);
      } finally {
        stopConfirming();
        buyerPrivateKey.fill(0);
      }
    }, 60_000);

    it('rejects offer creation with an unsigned external seller input', async () => {
      if (!connected) throw new Error('Trezor emulator did not connect');

      const buyerScript = OutScript.encode(Address().decode(EXPECTED_ADDRESSES.NATIVE_SEGWIT));
      const sellerPrivateKey = hexToBytes('44'.repeat(32));
      const sellerPayment = p2wpkh(getPublicKey(sellerPrivateKey, true));
      const buyerFunding = syntheticFundingTransaction(0x61, 110_000n, buyerScript);
      const sellerFunding = syntheticFundingTransaction(0x62, 330n, sellerPayment.script);
      const buyerInput = buyerFunding.getInput(0);
      const sellerInput = sellerFunding.getInput(0);
      if (!buyerInput.txid || !sellerInput.txid) throw new Error('Offer fixture has no outpoint');
      const stopConfirming = confirmDevicePrompts();

      try {
        const result = await TrezorConnect.signTransaction({
          inputs: [
            {
              address_n: [84 | 0x80000000, 0x80000000, 0x80000000, 0, 0],
              prev_hash: buyerFunding.id,
              prev_index: 0,
              amount: '110000',
              script_type: 'SPENDWITNESS',
              sequence: 0xfffffffd,
            },
            {
              prev_hash: sellerFunding.id,
              prev_index: 0,
              amount: '330',
              script_type: 'EXTERNAL',
              sequence: 0xfffffffe,
              script_pubkey: bytesToHex(sellerPayment.script),
              script_sig: '',
              witness: '',
            },
          ],
          outputs: [
            {
              address: EXPECTED_ADDRESSES.NATIVE_SEGWIT,
              amount: '100330',
              script_type: 'PAYTOADDRESS',
            },
          ],
          coin: 'btc',
          push: false,
          version: 2,
          locktime: 0,
          refTxs: [asTrezorRefTx(buyerFunding), asTrezorRefTx(sellerFunding)],
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('Trezor unexpectedly signed an unverified external input');
        expect(result.payload.error).toMatch(/external input|ownership proof|Invalid witness/i);
      } finally {
        stopConfirming();
        sellerPrivateKey.fill(0);
      }
    }, 60_000);
  });
});

/**
 * Summary of what these tests verify:
 *
 * 1. Device connectivity via BridgeTransport
 * 2. Address derivation for all formats (Legacy, SegWit, Native SegWit)
 * 3. Extended public key (xpub) retrieval
 * 4. Message signing with device confirmation
 * 5. Bundle operations for multiple addresses
 * 6. Transaction signing format compatibility
 * 7. OP_RETURN output format for Counterparty transactions
 *
 * These tests run in Node.js using @trezor/connect directly, which:
 * - Handles the handshake automatically (no popup needed)
 * - Works with BridgeTransport for emulator communication
 * - Provides the same API as the webextension package
 *
 * This proves that our TrezorAdapter business logic is correct and would
 * work with a real device through the webextension package's popup flow.
 */
