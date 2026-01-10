/**
 * Tests for PSBT utilities
 */
import { describe, it, expect } from 'vitest';
import { Transaction, p2wpkh } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import {
  parsePSBT,
  extractPsbtDetails,
  validateSignInputs,
  signPSBT,
  finalizePSBT,
} from '../psbt';
import { AddressFormat } from '../address';

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35';

/**
 * Create a simple test PSBT with one input and two outputs
 */
function createTestPsbt(): string {
  const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
  const pubkey = getPublicKey(privateKeyBytes, true);
  const payment = p2wpkh(pubkey);

  const tx = new Transaction({ allowUnknownOutputs: true });

  // Add a dummy input
  tx.addInput({
    txid: hexToBytes('0'.repeat(64)),
    index: 0,
    witnessUtxo: {
      script: payment.script,
      amount: BigInt(100000), // 0.001 BTC
    },
  });

  // Add outputs
  // Regular output
  tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(50000));

  // OP_RETURN output with Counterparty-like data
  const opReturnData = hexToBytes('434e545250525459' + '00'.repeat(20)); // "CNTRPRTY" + padding
  tx.addOutput({
    script: new Uint8Array([0x6a, opReturnData.length, ...opReturnData]),
    amount: BigInt(0),
  });

  // Change output
  tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(49000));

  return bytesToHex(tx.toPSBT());
}

describe('parsePSBT', () => {
  it('should parse a valid PSBT', () => {
    const psbtHex = createTestPsbt();
    const tx = parsePSBT(psbtHex);

    expect(tx).toBeDefined();
    expect(tx.inputsLength).toBe(1);
    expect(tx.outputsLength).toBe(3);
  });

  it('should throw on invalid PSBT hex', () => {
    expect(() => parsePSBT('invalid')).toThrow('Failed to parse PSBT');
    expect(() => parsePSBT('')).toThrow('Failed to parse PSBT');
    expect(() => parsePSBT('deadbeef')).toThrow('Failed to parse PSBT');
  });

  it('should throw on non-hex string', () => {
    expect(() => parsePSBT('not-hex-at-all!')).toThrow();
  });
});

describe('extractPsbtDetails', () => {
  it('should extract inputs from PSBT', () => {
    const psbtHex = createTestPsbt();
    const details = extractPsbtDetails(psbtHex);

    expect(details.inputs).toHaveLength(1);
    expect(details.inputs[0].index).toBe(0);
    expect(details.inputs[0].txid).toBe('0'.repeat(64));
    expect(details.inputs[0].vout).toBe(0);
    expect(details.inputs[0].value).toBe(100000);
  });

  it('should extract outputs from PSBT', () => {
    const psbtHex = createTestPsbt();
    const details = extractPsbtDetails(psbtHex);

    expect(details.outputs).toHaveLength(3);

    // First output - regular payment
    expect(details.outputs[0].value).toBe(50000);
    expect(details.outputs[0].type).toBe('p2wpkh');

    // Second output - OP_RETURN
    expect(details.outputs[1].value).toBe(0);
    expect(details.outputs[1].type).toBe('op_return');
    expect(details.outputs[1].opReturnData).toBeDefined();

    // Third output - change
    expect(details.outputs[2].value).toBe(49000);
    expect(details.outputs[2].type).toBe('p2wpkh');
  });

  it('should calculate totals and fee', () => {
    const psbtHex = createTestPsbt();
    const details = extractPsbtDetails(psbtHex);

    expect(details.totalInputValue).toBe(100000);
    expect(details.totalOutputValue).toBe(99000); // 50000 + 0 + 49000
    expect(details.fee).toBe(1000); // 100000 - 99000
  });

  it('should detect OP_RETURN', () => {
    const psbtHex = createTestPsbt();
    const details = extractPsbtDetails(psbtHex);

    expect(details.hasOpReturn).toBe(true);
  });

  it('should handle PSBT without OP_RETURN', () => {
    const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubkey = getPublicKey(privateKeyBytes, true);
    const payment = p2wpkh(pubkey);

    const tx = new Transaction();
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
      witnessUtxo: {
        script: payment.script,
        amount: BigInt(100000),
      },
    });
    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(99000));

    const psbtHex = bytesToHex(tx.toPSBT());
    const details = extractPsbtDetails(psbtHex);

    expect(details.hasOpReturn).toBe(false);
  });
});

describe('validateSignInputs', () => {
  const walletAddresses = [
    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
  ];

  it('should validate when all addresses belong to wallet', () => {
    const signInputs = {
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4': [0, 1],
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should be case-insensitive for addresses', () => {
    const signInputs = {
      'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4': [0],
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(true);
  });

  it('should reject unknown addresses', () => {
    const signInputs = {
      'bc1qunknownaddress': [0],
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not in this wallet');
  });

  it('should reject invalid input indices', () => {
    const signInputs = {
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4': [-1],
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid input indices');
  });

  it('should reject non-integer indices', () => {
    const signInputs = {
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4': [1.5],
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(false);
  });

  it('should reject non-array indices', () => {
    const signInputs = {
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4': 'not-an-array' as any,
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(false);
  });

  it('should handle empty signInputs', () => {
    const result = validateSignInputs({}, walletAddresses);
    expect(result.valid).toBe(true);
  });

  it('should handle multiple addresses', () => {
    const signInputs = {
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4': [0],
      'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3': [1, 2],
    };

    const result = validateSignInputs(signInputs, walletAddresses);
    expect(result.valid).toBe(true);
  });
});

describe('signPSBT', () => {
  it('should sign a PSBT input', () => {
    const psbtHex = createTestPsbt();

    const signedPsbtHex = signPSBT(
      psbtHex,
      TEST_PRIVATE_KEY,
      [0],
      AddressFormat.P2WPKH
    );

    expect(signedPsbtHex).toBeDefined();
    expect(signedPsbtHex).not.toBe(psbtHex);

    // Parse the signed PSBT to verify it has signatures
    const tx = parsePSBT(signedPsbtHex);
    const input = tx.getInput(0);
    expect(input.partialSig).toBeDefined();
    expect(input.partialSig?.length).toBeGreaterThan(0);
  });

  it('should sign all inputs when no indices specified', () => {
    const psbtHex = createTestPsbt();

    const signedPsbtHex = signPSBT(
      psbtHex,
      TEST_PRIVATE_KEY,
      [], // empty = sign all
      AddressFormat.P2WPKH
    );

    const tx = parsePSBT(signedPsbtHex);
    const input = tx.getInput(0);
    expect(input.partialSig).toBeDefined();
  });

  it('should throw on invalid private key', () => {
    const psbtHex = createTestPsbt();

    expect(() => signPSBT(
      psbtHex,
      'invalid',
      [0],
      AddressFormat.P2WPKH
    )).toThrow();
  });
});

describe('finalizePSBT', () => {
  it('should finalize a signed PSBT', () => {
    const psbtHex = createTestPsbt();

    // Sign first
    const signedPsbtHex = signPSBT(
      psbtHex,
      TEST_PRIVATE_KEY,
      [0],
      AddressFormat.P2WPKH
    );

    // Then finalize
    const rawTxHex = finalizePSBT(signedPsbtHex);

    expect(rawTxHex).toBeDefined();
    expect(rawTxHex.length).toBeGreaterThan(0);
    // Raw tx should not start with PSBT magic bytes
    expect(rawTxHex.startsWith('70736274')).toBe(false);
  });

  it('should throw on unsigned PSBT', () => {
    const psbtHex = createTestPsbt();

    // Try to finalize without signing
    expect(() => finalizePSBT(psbtHex)).toThrow();
  });
});

describe('Script type detection', () => {
  it('should detect different output types via extractPsbtDetails', () => {
    // Create PSBT with different output types
    const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubkey = getPublicKey(privateKeyBytes, true);
    const payment = p2wpkh(pubkey);

    const tx = new Transaction();
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
      witnessUtxo: {
        script: payment.script,
        amount: BigInt(500000),
      },
    });

    // P2WPKH output (bc1q...)
    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(100000));

    // P2TR output (bc1p...)
    tx.addOutputAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0', BigInt(100000));

    // P2PKH output (1...)
    tx.addOutputAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', BigInt(100000));

    // P2SH output (3...)
    tx.addOutputAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', BigInt(100000));

    const psbtHex = bytesToHex(tx.toPSBT());
    const details = extractPsbtDetails(psbtHex);

    expect(details.outputs[0].type).toBe('p2wpkh');
    expect(details.outputs[1].type).toBe('p2tr');
    expect(details.outputs[2].type).toBe('p2pkh');
    expect(details.outputs[3].type).toBe('p2sh');
  });
});
