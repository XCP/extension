/**
 * Tests for OP_RETURN extraction, ARC4 decryption, and Counterparty data decoding
 */

import { describe, it, expect } from 'vitest';
import {
  extractOpReturnPayload,
  decryptOpReturnData,
  hasCounterpartyPrefix,
  COUNTERPARTY_PREFIX_HEX,
} from '../transaction';
import { arc4, hexToBytes, bytesToHex } from '../unpack/binary';

// ── ARC4 cipher ──────────────────────────────────────────────────────

describe('arc4', () => {
  it('should encrypt and decrypt symmetrically (round-trip)', () => {
    const key = hexToBytes('deadbeef');
    const plaintext = hexToBytes('434e545250525459020000000000000001');
    const encrypted = arc4(key, plaintext);
    const decrypted = arc4(key, encrypted);
    expect(bytesToHex(decrypted)).toBe(bytesToHex(plaintext));
  });

  it('should produce different output than input', () => {
    const key = hexToBytes('aabbccdd');
    const plaintext = hexToBytes('0102030405060708');
    const encrypted = arc4(key, plaintext);
    expect(bytesToHex(encrypted)).not.toBe(bytesToHex(plaintext));
  });

  it('should match known RC4 test vector', () => {
    // RC4 test vector: Key = "Key", Plaintext = "Plaintext"
    const key = new TextEncoder().encode('Key');
    const plaintext = new TextEncoder().encode('Plaintext');
    const encrypted = arc4(key, plaintext);
    // Known RC4 output for Key="Key", Plaintext="Plaintext": BBF316E8D940AF0AD3
    expect(bytesToHex(encrypted).toUpperCase()).toBe('BBF316E8D940AF0AD3');
  });

  it('should handle empty data', () => {
    const key = hexToBytes('ff');
    const data = new Uint8Array(0);
    const result = arc4(key, data);
    expect(result.length).toBe(0);
  });

  it('should handle long keys and data', () => {
    const key = new Uint8Array(64).fill(0xab);
    const data = new Uint8Array(256).fill(0x42);
    const encrypted = arc4(key, data);
    const decrypted = arc4(key, encrypted);
    expect(bytesToHex(decrypted)).toBe(bytesToHex(data));
  });
});

// ── extractOpReturnPayload ───────────────────────────────────────────

describe('extractOpReturnPayload', () => {
  it('should extract payload from direct push (<=75 bytes)', () => {
    // OP_RETURN (6a) + push 4 bytes (04) + data (deadbeef)
    const scriptHex = '6a04deadbeef';
    expect(extractOpReturnPayload(scriptHex)).toBe('deadbeef');
  });

  it('should extract payload from 1-byte push of 40 bytes', () => {
    const data = 'aa'.repeat(40); // 40 bytes
    const pushByte = (40).toString(16).padStart(2, '0'); // 0x28
    const scriptHex = `6a${pushByte}${data}`;
    expect(extractOpReturnPayload(scriptHex)).toBe(data);
  });

  it('should extract payload from OP_PUSHDATA1 (76-255 bytes)', () => {
    const data = 'bb'.repeat(80); // 80 bytes
    const lengthByte = (80).toString(16).padStart(2, '0'); // 0x50
    const scriptHex = `6a4c${lengthByte}${data}`;
    expect(extractOpReturnPayload(scriptHex)).toBe(data);
  });

  it('should extract payload from OP_PUSHDATA2', () => {
    const data = 'cc'.repeat(300); // 300 bytes
    // OP_PUSHDATA2: 0x4d + 2-byte LE length
    const lenLow = (300 & 0xff).toString(16).padStart(2, '0'); // 0x2c
    const lenHigh = ((300 >> 8) & 0xff).toString(16).padStart(2, '0'); // 0x01
    const scriptHex = `6a4d${lenLow}${lenHigh}${data}`;
    expect(extractOpReturnPayload(scriptHex)).toBe(data);
  });

  it('should return null for non-OP_RETURN scripts', () => {
    // P2PKH: OP_DUP OP_HASH160 ...
    expect(extractOpReturnPayload('76a914aabbccdd88ac')).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(extractOpReturnPayload('')).toBeNull();
  });

  it('should return null for too-short input', () => {
    expect(extractOpReturnPayload('6a')).toBeNull();
  });

  it('should return null if data length exceeds available bytes', () => {
    // Claims 10 bytes but only has 4
    expect(extractOpReturnPayload('6a0adeadbeef')).toBeNull();
  });

  it('should handle typical Counterparty payload size (46 bytes)', () => {
    // 46 bytes = enhanced_send: 8 prefix + 1 type + 8 asset + 8 qty + 21 addr
    const data = 'ff'.repeat(46);
    const pushByte = (46).toString(16).padStart(2, '0'); // 0x2e
    const scriptHex = `6a${pushByte}${data}`;
    const result = extractOpReturnPayload(scriptHex);
    expect(result).toBe(data);
    expect(hexToBytes(result!).length).toBe(46);
  });
});

// ── decryptOpReturnData ──────────────────────────────────────────────

describe('decryptOpReturnData', () => {
  // Build a known encrypted OP_RETURN: encrypt CNTRPRTY + payload with a fake txid
  const fakeTxid = 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8';

  function buildEncryptedOpReturn(plaintextHex: string, txid: string): string {
    const plainBytes = hexToBytes(plaintextHex);
    const keyBytes = hexToBytes(txid);
    const encrypted = arc4(keyBytes, plainBytes);
    const encryptedHex = bytesToHex(encrypted);
    const len = encrypted.length;
    // Build OP_RETURN script
    if (len <= 0x4b) {
      return `6a${len.toString(16).padStart(2, '0')}${encryptedHex}`;
    } else {
      return `6a4c${len.toString(16).padStart(2, '0')}${encryptedHex}`;
    }
  }

  it('should decrypt OP_RETURN data with valid Counterparty prefix', () => {
    // CNTRPRTY prefix + enhanced_send type ID (02) + some payload
    const plaintext = COUNTERPARTY_PREFIX_HEX + '02' + '0000000000000001' + '00000000000003e8' + '00'.repeat(21);
    const scriptHex = buildEncryptedOpReturn(plaintext, fakeTxid);

    const result = decryptOpReturnData(scriptHex, fakeTxid);
    expect(result).not.toBeNull();
    expect(result!.startsWith(COUNTERPARTY_PREFIX_HEX)).toBe(true);
    expect(result).toBe(plaintext);
  });

  it('should return null for non-Counterparty OP_RETURN data', () => {
    // Random data that doesn't decrypt to CNTRPRTY prefix
    const randomData = 'deadbeefcafebabe1122334455667788';
    const scriptHex = `6a10${randomData}`;

    const result = decryptOpReturnData(scriptHex, fakeTxid);
    expect(result).toBeNull();
  });

  it('should return null for invalid script', () => {
    expect(decryptOpReturnData('', fakeTxid)).toBeNull();
    expect(decryptOpReturnData('00', fakeTxid)).toBeNull();
  });

  it('should return null when txid is wrong', () => {
    const plaintext = COUNTERPARTY_PREFIX_HEX + '020000000000000001';
    const scriptHex = buildEncryptedOpReturn(plaintext, fakeTxid);
    const wrongTxid = 'ff'.repeat(32);

    const result = decryptOpReturnData(scriptHex, wrongTxid);
    expect(result).toBeNull();
  });

  it('should handle real-world sized payloads', () => {
    // Order message: prefix(8) + typeId(1=0x0a) + giveAsset(8) + giveQty(8) + getAsset(8) + getQty(8) + expiration(4) + fee(8)
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '0a'; // order = 10
    const giveAsset = '0000000000000001'; // XCP (id=1)
    const giveQty = '00000000000186a0'; // 100000
    const getAsset = '0000000000000000'; // BTC (id=0)
    const getQty = '0000000000002710'; // 10000
    const expiration = '00001000';       // 4096
    const fee = '0000000000000000';
    const plaintext = prefix + typeId + giveAsset + giveQty + getAsset + getQty + expiration + fee;

    const scriptHex = buildEncryptedOpReturn(plaintext, fakeTxid);
    const result = decryptOpReturnData(scriptHex, fakeTxid);
    expect(result).toBe(plaintext);
  });
});

// ── hasCounterpartyPrefix ────────────────────────────────────────────

describe('hasCounterpartyPrefix', () => {
  it('should return true when data contains CNTRPRTY prefix', () => {
    expect(hasCounterpartyPrefix(`6a28${COUNTERPARTY_PREFIX_HEX}02aabb`)).toBe(true);
  });

  it('should return false for non-Counterparty data', () => {
    expect(hasCounterpartyPrefix('6a04deadbeef')).toBe(false);
  });

  it('should return true when prefix appears anywhere in hex string', () => {
    expect(hasCounterpartyPrefix(`0000${COUNTERPARTY_PREFIX_HEX}0000`)).toBe(true);
  });
});
