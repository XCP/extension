/**
 * ARC4 Round-Trip Integration Tests
 *
 * Constructs real Counterparty messages in binary, ARC4-encrypts them as
 * the protocol does (using a txid as key), wraps them in OP_RETURN scripts,
 * and verifies the full decrypt → local unpack pipeline.
 *
 * These tests are fully offline — no API needed.
 */

import { describe, it, expect } from 'vitest';
import { arc4, hexToBytes, bytesToHex, BinaryReader } from '../unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '../unpack/messageTypes';
import { packAddress } from '../unpack/address';
import { unpackCounterpartyMessage, isCounterpartyData } from '../unpack/index';
import { extractOpReturnPayload, decryptOpReturnData } from '../transaction';

// Fake txid used as ARC4 key
const FAKE_TXID = 'b5a2c3d4e5f6a7b8b5a2c3d4e5f6a7b8b5a2c3d4e5f6a7b8b5a2c3d4e5f6a7b8';

/**
 * Helper: build a CNTRPRTY-prefixed message hex from type ID and payload hex.
 */
function buildCpMessage(typeId: number, payloadHex: string): string {
  // CNTRPRTY prefix + 1-byte type ID + payload
  const typeHex = typeId.toString(16).padStart(2, '0');
  return COUNTERPARTY_PREFIX_HEX + typeHex + payloadHex;
}

/**
 * Helper: ARC4-encrypt a datahex with a txid and wrap in OP_RETURN script.
 */
function wrapInEncryptedOpReturn(datahex: string, txid: string): string {
  const dataBytes = hexToBytes(datahex);
  const keyBytes = hexToBytes(txid);
  const encrypted = arc4(keyBytes, dataBytes);
  const encHex = bytesToHex(encrypted);
  const len = encrypted.length;
  if (len <= 0x4b) {
    return `6a${len.toString(16).padStart(2, '0')}${encHex}`;
  } else {
    return `6a4c${len.toString(16).padStart(2, '0')}${encHex}`;
  }
}

/**
 * Helper: pack a bigint as 8-byte big-endian hex.
 */
function uint64hex(n: bigint): string {
  return n.toString(16).padStart(16, '0');
}

/**
 * Helper: pack a number as 4-byte big-endian hex.
 */
function uint32hex(n: number): string {
  return n.toString(16).padStart(8, '0');
}

// ── Enhanced Send (type 2) ───────────────────────────────────────────

describe('enhanced_send round-trip', () => {
  it('should decrypt and unpack XCP send', () => {
    // asset_id=1 (XCP), quantity=100000000, destination=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
    const assetId = uint64hex(1n); // XCP
    const quantity = uint64hex(100000000n);
    const packedDest = bytesToHex(packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'));
    const payloadHex = assetId + quantity + packedDest;

    const datahex = buildCpMessage(2, payloadHex);
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    // Decrypt
    const decrypted = decryptOpReturnData(scriptHex, FAKE_TXID);
    expect(decrypted).not.toBeNull();
    expect(decrypted).toBe(datahex);

    // Unpack
    const result = unpackCounterpartyMessage(decrypted!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('enhanced_send');
    expect(result.messageTypeId).toBe(2);
    expect(result.data).toBeDefined();

    const data = result.data as any;
    expect(data.asset).toBe('XCP');
    expect(data.quantity).toBe(100000000n);
    expect(data.destination).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });

  it('should decrypt and unpack PEPECASH send with memo', () => {
    const assetId = uint64hex(26n ** 3n * (15n + 1n) + 26n ** 2n * (4n + 1n) + 26n * (15n + 1n) + (4n + 1n)); // a rough ID
    // Use a known named asset: use assetNameToId to get the right ID
    // Actually let's just use XCP for simplicity
    const xcpId = uint64hex(1n);
    const quantity = uint64hex(50000n);
    const packedDest = bytesToHex(packAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'));
    const memo = bytesToHex(new TextEncoder().encode('test'));
    const payloadHex = xcpId + quantity + packedDest + memo;

    const datahex = buildCpMessage(2, payloadHex);
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    const decrypted = decryptOpReturnData(scriptHex, FAKE_TXID);
    expect(decrypted).toBe(datahex);

    const result = unpackCounterpartyMessage(decrypted!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('enhanced_send');

    const data = result.data as any;
    expect(data.quantity).toBe(50000n);
    expect(data.memo).toBe('test');
  });
});

// ── Order (type 10) ──────────────────────────────────────────────────

describe('order round-trip', () => {
  it('should decrypt and unpack a DEX order', () => {
    // give_asset(8) + give_qty(8) + get_asset(8) + get_qty(8) + expiration(2) + fee_required(8)
    const giveAsset = uint64hex(1n); // XCP
    const giveQty = uint64hex(100000000n);
    const getAsset = uint64hex(0n); // BTC
    const getQty = uint64hex(50000n);
    const expiration = '1388'; // 5000 as 2-byte big-endian
    const feeRequired = uint64hex(0n);
    const payloadHex = giveAsset + giveQty + getAsset + getQty + expiration + feeRequired;

    const datahex = buildCpMessage(10, payloadHex);
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    const decrypted = decryptOpReturnData(scriptHex, FAKE_TXID);
    expect(decrypted).toBe(datahex);

    const result = unpackCounterpartyMessage(decrypted!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('order');

    const data = result.data as any;
    expect(data.giveAsset).toBe('XCP');
    expect(data.giveQuantity).toBe(100000000n);
    expect(data.getAsset).toBe('BTC');
    expect(data.getQuantity).toBe(50000n);
  });
});

// ── Cancel (type 70) ─────────────────────────────────────────────────

describe('cancel round-trip', () => {
  it('should decrypt and unpack a cancel message', () => {
    // offer_hash(32 bytes)
    const offerHash = 'aa'.repeat(32);
    const payloadHex = offerHash;

    const datahex = buildCpMessage(70, payloadHex);
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    const decrypted = decryptOpReturnData(scriptHex, FAKE_TXID);
    expect(decrypted).toBe(datahex);

    const result = unpackCounterpartyMessage(decrypted!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('cancel');

    const data = result.data as any;
    expect(data.offerHash).toBe(offerHash);
  });
});

// ── Destroy (type 110) ───────────────────────────────────────────────

describe('destroy round-trip', () => {
  it('should decrypt and unpack a destroy message', () => {
    // asset_id(8) + quantity(8) + tag_length(2) + tag
    const assetId = uint64hex(1n); // XCP
    const quantity = uint64hex(5000n);
    const tagLen = '0004'; // 4-byte tag
    const tag = bytesToHex(new TextEncoder().encode('burn'));
    const payloadHex = assetId + quantity + tagLen + tag;

    const datahex = buildCpMessage(110, payloadHex);
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    const decrypted = decryptOpReturnData(scriptHex, FAKE_TXID);
    expect(decrypted).toBe(datahex);

    const result = unpackCounterpartyMessage(decrypted!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('destroy');

    const data = result.data as any;
    expect(data.asset).toBe('XCP');
    expect(data.quantity).toBe(5000n);
  });
});

// ── Sweep (type 4) ───────────────────────────────────────────────────

describe('sweep round-trip', () => {
  it('should decrypt and unpack a sweep message', () => {
    // destination(21 bytes packed) + flags(1 byte) + memo(variable)
    const packedDest = bytesToHex(packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'));
    const flags = '03'; // flags = 3
    const payloadHex = packedDest + flags;

    const datahex = buildCpMessage(4, payloadHex);
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    const decrypted = decryptOpReturnData(scriptHex, FAKE_TXID);
    expect(decrypted).toBe(datahex);

    const result = unpackCounterpartyMessage(decrypted!);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('sweep');

    const data = result.data as any;
    expect(data.destination).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(data.flags).toBe(3);
  });
});

// ── Wrong txid fails decryption ──────────────────────────────────────

describe('wrong key', () => {
  it('should return null when txid is wrong', () => {
    const datahex = buildCpMessage(2, uint64hex(1n) + uint64hex(100n) + bytesToHex(packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')));
    const scriptHex = wrapInEncryptedOpReturn(datahex, FAKE_TXID);

    const wrongTxid = 'ff'.repeat(32);
    const decrypted = decryptOpReturnData(scriptHex, wrongTxid);
    expect(decrypted).toBeNull();
  });
});

// ── Real compose API test vector ──────────────────────────────────────

describe('real compose API vector', () => {
  // From a real compose/order response (validate=false):
  //   source: 19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX
  //   give: 1 XCP, get: 0.0005 BTC, expiration: 5000
  const REAL_RAW_TX = '020000000133997605bfe854fd8bdd784b47bd3b423488e64cc5fb5820e0f8d134670b0b670100000000ffffffff020000000000000000356a3380ada95da1b59fdc5a4ed690798435687c8f9060f0318d3f63009c00fe09da18780b4b57f245152a77e0b5ed88b3511ad1c5cfbf600000000000001976a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac00000000';
  const REAL_DATA_HEX = '434e5452505254590a00000000000000010000000005f5e1000000000000000000000000000000c35013880000000000000000';
  // First input txid in display format (big-endian, as returned by decode API).
  // In the raw tx it's stored reversed: 33997605...670b0b67
  const REAL_FIRST_INPUT_TXID = '670b0b6734d1f8e02058fbc54ce68834423bbd474b78dd8bfd54e8bf05769933';

  it('should extract and decrypt the OP_RETURN from a real composed order', () => {
    // Extract OP_RETURN scriptPubKey from the raw tx
    // The OP_RETURN output is: 00000000000000000035 6a33 80ada95d...
    // scriptPubKey = 6a3380ada95da1b59fdc5a4ed690798435687c8f9060f0318d3f63009c00fe09da18780b4b57f245152a77e0b5ed88b3511ad1c5cf
    const opReturnScript = '6a33' + '80ada95da1b59fdc5a4ed690798435687c8f9060f0318d3f63009c00fe09da18780b4b57f245152a77e0b5ed88b3511ad1c5cf';

    const decrypted = decryptOpReturnData(opReturnScript, REAL_FIRST_INPUT_TXID);
    expect(decrypted).not.toBeNull();
    expect(decrypted).toBe(REAL_DATA_HEX);
  });

  it('should unpack the real decrypted data as an order', () => {
    const result = unpackCounterpartyMessage(REAL_DATA_HEX);
    expect(result.success).toBe(true);
    expect(result.messageType).toBe('order');
    expect(result.messageTypeId).toBe(10);

    const data = result.data as any;
    expect(data.giveAsset).toBe('XCP');
    expect(data.giveQuantity).toBe(100000000n); // 1 XCP
    expect(data.getAsset).toBe('BTC');
    expect(data.getQuantity).toBe(50000n); // 0.0005 BTC
    expect(data.expiration).toBe(5000);
  });

  it('should verify the decrypted data has CNTRPRTY prefix', () => {
    expect(isCounterpartyData(REAL_DATA_HEX)).toBe(true);
  });

  it('should fail with wrong txid', () => {
    const opReturnScript = '6a33' + '80ada95da1b59fdc5a4ed690798435687c8f9060f0318d3f63009c00fe09da18780b4b57f245152a77e0b5ed88b3511ad1c5cf';
    const wrongTxid = 'ff'.repeat(32);
    expect(decryptOpReturnData(opReturnScript, wrongTxid)).toBeNull();
  });
});

// ── isCounterpartyData ───────────────────────────────────────────────

describe('isCounterpartyData on decrypted data', () => {
  it('should return true for decrypted CP data', () => {
    const datahex = buildCpMessage(2, uint64hex(1n) + uint64hex(100n) + bytesToHex(packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')));
    expect(isCounterpartyData(datahex)).toBe(true);
  });

  it('should return false for encrypted (raw) OP_RETURN data', () => {
    const datahex = buildCpMessage(2, uint64hex(1n) + uint64hex(100n) + bytesToHex(packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')));
    const encrypted = arc4(hexToBytes(FAKE_TXID), hexToBytes(datahex));
    expect(isCounterpartyData(bytesToHex(encrypted))).toBe(false);
  });
});
