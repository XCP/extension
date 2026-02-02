/**
 * Tests for PSBT utilities
 */
import { describe, it, expect } from 'vitest';
import { Transaction, p2wpkh } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import {
  normalizePsbtToHex,
  parsePSBT,
  extractPsbtDetails,
  validateSignInputs,
  signPSBT,
  finalizePSBT,
  completePsbtWithInputValues,
} from '../psbt';
import { AddressFormat } from '../address';

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35';

// Real base64 PSBT from Counterparty API (dispense transaction)
const REAL_BASE64_PSBT = 'cHNidP8BAIsCAAAAAfenzbA/xu3VDRlYuH8butApRC5TWmdACFtFtFJY4rbLAAAAAAD/////AgAAAAAAAAAAMGou91NEQhwmK/eEu8p4IuIeXnrNctzd68uypEohxWsegKVm4JyRI51E6MKOCvnm1BAZBioBAAAAFgAUjVCFq5uFyn2l1qBY7mY3iuyvdiIAAAAAAAAAAA==';

// The same PSBT in hex format (pre-computed for verification)
const REAL_HEX_PSBT = '70736274ff01008b020000000177a7cdb03fc6edd50d1958b87f1bbad029442e535a674008' +
  '5b45b45258e2b6cb0000000000ffffffff020000000000000000306a2ef7534442' +
  '1c262bf784bbca7822e21e5e7acd72dcddebcbb2a44a21c56b1e80a566e09c9123' +
  '9d44e8c28e0af9e6d4101906260a0100000016001488d5085ab9b85ca7da5d6a05' +
  '8ee663788aecaf762200000000000000';

describe('normalizePsbtToHex', () => {
  it('should pass through valid hex PSBT unchanged', () => {
    const hexPsbt = createTestPsbt();
    const normalized = normalizePsbtToHex(hexPsbt);
    expect(normalized).toBe(hexPsbt);
  });

  it('should convert base64 PSBT to hex', () => {
    const normalized = normalizePsbtToHex(REAL_BASE64_PSBT);
    // Should start with PSBT magic bytes in hex
    expect(normalized.startsWith('70736274')).toBe(true);
    // Should be valid hex (even length, only hex chars)
    expect(normalized.length % 2).toBe(0);
    expect(/^[0-9a-f]+$/i.test(normalized)).toBe(true);
  });

  it('should produce consistent hex from base64 conversion', () => {
    // Convert base64 to hex
    const normalized = normalizePsbtToHex(REAL_BASE64_PSBT);
    // Should start with PSBT magic "psbt\xff" = 70736274ff
    expect(normalized.startsWith('70736274ff')).toBe(true);
  });

  it('should handle hex PSBT that already starts with magic bytes', () => {
    // A hex PSBT starts with 70736274 (psbt magic)
    const hexPsbt = '70736274ff0100'; // Minimal PSBT header
    const normalized = normalizePsbtToHex(hexPsbt);
    expect(normalized).toBe(hexPsbt);
  });

  it('should reject empty string', () => {
    expect(() => normalizePsbtToHex('')).toThrow('PSBT must be a non-empty string');
  });

  it('should reject null/undefined', () => {
    expect(() => normalizePsbtToHex(null as unknown as string)).toThrow('PSBT must be a non-empty string');
    expect(() => normalizePsbtToHex(undefined as unknown as string)).toThrow('PSBT must be a non-empty string');
  });

  it('should reject invalid base64', () => {
    expect(() => normalizePsbtToHex('not-valid-base64!!!')).toThrow();
  });

  it('should reject random hex that is not a PSBT', () => {
    // Random hex that doesn't start with PSBT magic
    expect(() => normalizePsbtToHex('deadbeef')).toThrow('PSBT must be in hex or base64 format');
  });

  it('should reject base64 that decodes to non-PSBT data', () => {
    // Base64 of "hello world" - valid base64 but not a PSBT
    const notPsbt = btoa('hello world');
    expect(() => normalizePsbtToHex(notPsbt)).toThrow('PSBT must be in hex or base64 format');
  });

  it('should be idempotent - normalizing twice gives same result', () => {
    const first = normalizePsbtToHex(REAL_BASE64_PSBT);
    const second = normalizePsbtToHex(first);
    expect(first).toBe(second);
  });

  it('should produce parseable PSBT from base64 input', () => {
    const normalized = normalizePsbtToHex(REAL_BASE64_PSBT);
    // Should be parseable by parsePSBT
    const tx = parsePSBT(normalized);
    expect(tx).toBeDefined();
    expect(tx.inputsLength).toBeGreaterThan(0);
  });
});

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
  it('should parse a valid hex PSBT', () => {
    const psbtHex = createTestPsbt();
    const tx = parsePSBT(psbtHex);

    expect(tx).toBeDefined();
    expect(tx.inputsLength).toBe(1);
    expect(tx.outputsLength).toBe(3);
  });

  it('should parse a valid base64 PSBT (from Counterparty API)', () => {
    // Real base64 PSBT from Counterparty API
    const tx = parsePSBT(REAL_BASE64_PSBT);

    expect(tx).toBeDefined();
    expect(tx.inputsLength).toBe(1);
    expect(tx.outputsLength).toBe(2);
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

describe('OP_RETURN data extraction', () => {
  it('should extract raw data without push opcode (direct push)', () => {
    // Create PSBT with OP_RETURN using direct push (data < 76 bytes)
    const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubkey = getPublicKey(privateKeyBytes, true);
    const payment = p2wpkh(pubkey);

    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
      witnessUtxo: {
        script: payment.script,
        amount: BigInt(100000),
      },
    });

    // Counterparty-like data: "CNTRPRTY" (434e545250525459) + some payload
    const rawData = '434e545250525459' + '0a00000001deadbeef';
    const rawDataBytes = hexToBytes(rawData);

    // Create OP_RETURN script with direct push (6a + length byte + data)
    const opReturnScript = new Uint8Array([
      0x6a, // OP_RETURN
      rawDataBytes.length, // Direct push (length < 76)
      ...rawDataBytes
    ]);

    tx.addOutput({
      script: opReturnScript,
      amount: BigInt(0),
    });

    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(99000));

    const psbtHex = bytesToHex(tx.toPSBT());
    const details = extractPsbtDetails(psbtHex);

    const opReturnOutput = details.outputs.find(o => o.type === 'op_return');
    expect(opReturnOutput).toBeDefined();
    // Should extract ONLY the raw data, not the push opcode
    expect(opReturnOutput!.opReturnData).toBe(rawData);
  });

  it('should extract raw data from real Counterparty OP_RETURN script', () => {
    // Create a Counterparty-style OP_RETURN with 51 bytes of data
    // The push opcode 0x33 (51 decimal) should be stripped
    const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubkey = getPublicKey(privateKeyBytes, true);
    const payment = p2wpkh(pubkey);

    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
      witnessUtxo: {
        script: payment.script,
        amount: BigInt(100000),
      },
    });

    // 51 bytes of data (Counterparty messages are typically this size)
    // Generate exactly 51 bytes (102 hex characters)
    const expectedData = 'aa'.repeat(51);
    const expectedDataBytes = hexToBytes(expectedData);

    // Create OP_RETURN script: 6a (OP_RETURN) + 33 (push 51 bytes) + data
    const opReturnScript = new Uint8Array([
      0x6a, // OP_RETURN
      0x33, // Push 51 bytes (0x33 = 51)
      ...expectedDataBytes
    ]);

    tx.addOutput({
      script: opReturnScript,
      amount: BigInt(0),
    });

    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(99000));

    const psbtHex = bytesToHex(tx.toPSBT());
    const details = extractPsbtDetails(psbtHex);

    const opReturnOutput = details.outputs.find(o => o.type === 'op_return');
    expect(opReturnOutput).toBeDefined();
    // Must extract only the data bytes, NOT the push opcode (33)
    expect(opReturnOutput!.opReturnData).toBe(expectedData);
    // Should NOT include the push opcode (0x33 = push 51 bytes)
    expect(opReturnOutput!.opReturnData?.startsWith('33')).toBe(false);
  });

  it('should handle OP_PUSHDATA1 (data >= 76 bytes)', () => {
    // OP_PUSHDATA1 uses 4c followed by 1-byte length
    const privateKeyBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubkey = getPublicKey(privateKeyBytes, true);
    const payment = p2wpkh(pubkey);

    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
      witnessUtxo: {
        script: payment.script,
        amount: BigInt(100000),
      },
    });

    // Create 80 bytes of data (requires OP_PUSHDATA1)
    const rawData = 'aa'.repeat(80);
    const rawDataBytes = hexToBytes(rawData);

    // OP_RETURN + OP_PUSHDATA1 + length byte + data
    const opReturnScript = new Uint8Array([
      0x6a, // OP_RETURN
      0x4c, // OP_PUSHDATA1
      rawDataBytes.length, // 1-byte length (80)
      ...rawDataBytes
    ]);

    tx.addOutput({
      script: opReturnScript,
      amount: BigInt(0),
    });

    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(99000));

    const psbtHex = bytesToHex(tx.toPSBT());
    const details = extractPsbtDetails(psbtHex);

    const opReturnOutput = details.outputs.find(o => o.type === 'op_return');
    expect(opReturnOutput).toBeDefined();
    expect(opReturnOutput!.opReturnData).toBe(rawData);
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

describe('completePsbtWithInputValues', () => {
  it('should add witnessUtxo data to PSBT inputs', () => {
    // Create a PSBT WITHOUT witnessUtxo data
    const tx = new Transaction();
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
      // No witnessUtxo here - simulates what Counterparty API returns
    });
    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(50000));

    const incompletePsbt = bytesToHex(tx.toPSBT());

    // Verify input has no value initially
    const detailsBefore = extractPsbtDetails(incompletePsbt);
    expect(detailsBefore.inputs[0].value).toBeUndefined();

    // P2WPKH lock script for bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4
    // Format: OP_0 <20-byte-hash>
    const lockScript = '0014751e76e8199196d454941c45d1b3a323f1433bd6';

    // Complete the PSBT with input values
    const completedPsbt = completePsbtWithInputValues(
      incompletePsbt,
      [100000], // input value in satoshis
      [lockScript]
    );

    // Verify input now has value
    const detailsAfter = extractPsbtDetails(completedPsbt);
    expect(detailsAfter.inputs[0].value).toBe(100000);
    expect(detailsAfter.totalInputValue).toBe(100000);
    expect(detailsAfter.fee).toBe(50000); // 100000 - 50000
  });

  it('should handle multiple inputs', () => {
    const tx = new Transaction();
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
    });
    tx.addInput({
      txid: hexToBytes('1'.repeat(64)),
      index: 1,
    });
    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(150000));

    const incompletePsbt = bytesToHex(tx.toPSBT());
    const lockScript = '0014751e76e8199196d454941c45d1b3a323f1433bd6';

    const completedPsbt = completePsbtWithInputValues(
      incompletePsbt,
      [100000, 80000], // two input values
      [lockScript, lockScript] // same script for both (same address)
    );

    const details = extractPsbtDetails(completedPsbt);
    expect(details.inputs[0].value).toBe(100000);
    expect(details.inputs[1].value).toBe(80000);
    expect(details.totalInputValue).toBe(180000);
    expect(details.fee).toBe(30000); // 180000 - 150000
  });

  it('should accept base64 PSBT input', () => {
    // Use the real base64 PSBT from Counterparty
    // This PSBT has 1 input
    const lockScript = '001488d5085ab9b85ca7da5d6a058ee663788aecaf76';

    const completedPsbt = completePsbtWithInputValues(
      REAL_BASE64_PSBT,
      [10000],
      [lockScript]
    );

    const details = extractPsbtDetails(completedPsbt);
    expect(details.inputs[0].value).toBe(10000);
    expect(details.totalInputValue).toBe(10000);
  });

  it('should throw if input values count mismatches', () => {
    const tx = new Transaction();
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
    });
    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(50000));

    const psbt = bytesToHex(tx.toPSBT());
    const lockScript = '0014751e76e8199196d454941c45d1b3a323f1433bd6';

    expect(() => completePsbtWithInputValues(
      psbt,
      [100000, 50000], // 2 values but only 1 input
      [lockScript]
    )).toThrow(/doesn't match/);
  });

  it('should throw if lock scripts count mismatches', () => {
    const tx = new Transaction();
    tx.addInput({
      txid: hexToBytes('0'.repeat(64)),
      index: 0,
    });
    tx.addOutputAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', BigInt(50000));

    const psbt = bytesToHex(tx.toPSBT());
    const lockScript = '0014751e76e8199196d454941c45d1b3a323f1433bd6';

    expect(() => completePsbtWithInputValues(
      psbt,
      [100000],
      [lockScript, lockScript] // 2 scripts but only 1 input
    )).toThrow(/doesn't match/);
  });
});
