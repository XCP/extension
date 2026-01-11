/**
 * Tests for Counterparty message unpacking
 */

import { describe, it, expect } from 'vitest';
import {
  unpackCounterpartyMessage,
  isCounterpartyData,
  verifyTransaction,
  assetNameToId,
  assetIdToName,
  packAddress,
  unpackAddress,
  hexToBytes,
  bytesToHex,
  MessageTypeId,
  COUNTERPARTY_PREFIX_HEX,
} from '../index';

describe('assetId', () => {
  describe('assetNameToId', () => {
    it('should convert BTC to 0', () => {
      expect(assetNameToId('BTC')).toBe(0n);
    });

    it('should convert XCP to 1', () => {
      expect(assetNameToId('XCP')).toBe(1n);
    });

    it('should convert named assets using Base26', () => {
      // 'AAAA' = 0*26^3 + 0*26^2 + 0*26^1 + 0*26^0 = 0
      // But minimum is 26^3 = 17576, so AAAA would be 0 which is invalid
      // Let's use a 4-letter name that works
      const id = assetNameToId('BBBB');
      expect(id).toBeGreaterThan(0n);
    });

    it('should convert numeric assets (A-prefixed)', () => {
      const minNumeric = 26n ** 12n + 1n;
      const assetName = `A${minNumeric}`;
      expect(assetNameToId(assetName)).toBe(minNumeric);
    });

    it('should throw for invalid asset names', () => {
      expect(() => assetNameToId('')).toThrow();
      expect(() => assetNameToId('AB')).toThrow(); // too short
      expect(() => assetNameToId('abc')).toThrow(); // lowercase
    });
  });

  describe('assetIdToName', () => {
    it('should convert 0 to BTC', () => {
      expect(assetIdToName(0n)).toBe('BTC');
    });

    it('should convert 1 to XCP', () => {
      expect(assetIdToName(1n)).toBe('XCP');
    });

    it('should round-trip named assets', () => {
      const names = ['PEPECASH', 'FLDC', 'BITCRYSTALS', 'SJCX'];
      for (const name of names) {
        const id = assetNameToId(name);
        expect(assetIdToName(id)).toBe(name);
      }
    });

    it('should convert large IDs to A-prefixed names', () => {
      const minNumeric = 26n ** 12n + 1n;
      expect(assetIdToName(minNumeric)).toBe(`A${minNumeric}`);
    });
  });
});

describe('address packing', () => {
  describe('packAddress', () => {
    it('should pack legacy P2PKH addresses', () => {
      // mainnet P2PKH address starting with 1
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // Satoshi's address
      const packed = packAddress(address);
      expect(packed.length).toBe(21);
      expect(packed[0]).toBe(0x00); // P2PKH version byte
    });

    it('should pack SegWit addresses', () => {
      // mainnet P2WPKH address starting with bc1q
      const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      const packed = packAddress(address);
      expect(packed.length).toBe(21);
      expect(packed[0]).toBe(0x80); // SegWit marker + witness version 0
    });

    it('should throw for invalid addresses', () => {
      expect(() => packAddress('')).toThrow();
      expect(() => packAddress('invalid')).toThrow();
    });
  });

  describe('unpackAddress', () => {
    it('should round-trip legacy addresses', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const packed = packAddress(address);
      const unpacked = unpackAddress(packed);
      expect(unpacked).toBe(address);
    });

    it('should round-trip SegWit addresses', () => {
      const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      const packed = packAddress(address);
      const unpacked = unpackAddress(packed);
      expect(unpacked).toBe(address);
    });
  });
});

describe('binary utilities', () => {
  it('should convert hex to bytes', () => {
    const hex = '48656c6c6f'; // "Hello"
    const bytes = hexToBytes(hex);
    expect(bytes).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });

  it('should convert bytes to hex', () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(bytesToHex(bytes)).toBe('48656c6c6f');
  });

  it('should handle 0x prefix in hex', () => {
    const hex = '0x48656c6c6f';
    const bytes = hexToBytes(hex);
    expect(bytes).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });
});

describe('isCounterpartyData', () => {
  it('should detect CNTRPRTY prefix', () => {
    const data = COUNTERPARTY_PREFIX_HEX + '020000';
    expect(isCounterpartyData(data)).toBe(true);
  });

  it('should reject data without prefix', () => {
    expect(isCounterpartyData('0000000000000000')).toBe(false);
    expect(isCounterpartyData('hello')).toBe(false);
  });
});

describe('unpackCounterpartyMessage', () => {
  it('should reject data without CNTRPRTY prefix', () => {
    // Data that's long enough but has wrong prefix
    const result = unpackCounterpartyMessage('00000000000000000000000000000000');
    expect(result.success).toBe(false);
    expect(result.error).toContain('prefix');
  });

  it('should reject data that is too short', () => {
    const result = unpackCounterpartyMessage('0000000000000000');
    expect(result.success).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('should extract message type ID', () => {
    // CNTRPRTY prefix + message type 2 (enhanced send) + minimal payload
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '02'; // 1-byte type ID for enhanced send
    const payload = '0000000000000001' + '0000000000000064' + '00'.repeat(21); // asset, qty, address

    const result = unpackCounterpartyMessage(prefix + typeId + payload);
    expect(result.messageTypeId).toBe(2);
    expect(result.messageType).toBe('enhanced_send');
  });

  describe('send unpacking', () => {
    it('should unpack a send message', () => {
      // Build a send message: CNTRPRTY + type 0 + asset_id(8) + quantity(8)
      const prefix = COUNTERPARTY_PREFIX_HEX;
      const typeId = '00000000'; // 4-byte type ID = 0 (send)
      const assetId = '0000000000000001'; // XCP = 1
      const quantity = '000000003b9aca00'; // 1,000,000,000 (1 XCP in base units)

      const result = unpackCounterpartyMessage(prefix + typeId + assetId + quantity);

      expect(result.success).toBe(true);
      expect(result.messageTypeId).toBe(0);
      expect(result.messageType).toBe('send');
      expect(result.data).toMatchObject({
        asset: 'XCP',
        quantity: 1000000000n,
      });
    });
  });

  describe('order unpacking', () => {
    it('should unpack an order message', () => {
      // Build an order: CNTRPRTY + type 10 + give_id + give_qty + get_id + get_qty + expiration + fee_required
      const prefix = COUNTERPARTY_PREFIX_HEX;
      const typeId = '0a'; // 1-byte type ID = 10 (order)
      const giveAssetId = '0000000000000001'; // XCP = 1
      const giveQuantity = '000000003b9aca00'; // 1 XCP
      const getAssetId = '0000000000000000'; // BTC = 0
      const getQuantity = '0000000000989680'; // 0.1 BTC = 10,000,000 sats
      const expiration = '0014'; // 20 blocks
      const feeRequired = '0000000000000000'; // 0

      const data = prefix + typeId + giveAssetId + giveQuantity + getAssetId + getQuantity + expiration + feeRequired;
      const result = unpackCounterpartyMessage(data);

      expect(result.success).toBe(true);
      expect(result.messageTypeId).toBe(10);
      expect(result.messageType).toBe('order');
      expect(result.data).toMatchObject({
        giveAsset: 'XCP',
        giveQuantity: 1000000000n,
        getAsset: 'BTC',
        getQuantity: 10000000n,
        expiration: 20,
        feeRequired: 0n,
      });
    });
  });

  describe('cancel unpacking', () => {
    it('should unpack a cancel message', () => {
      const prefix = COUNTERPARTY_PREFIX_HEX;
      const typeId = '46'; // 1-byte type ID = 70 (cancel)
      const offerHash = 'a' .repeat(64); // 32 bytes of 0xaa

      const data = prefix + typeId + offerHash;
      const result = unpackCounterpartyMessage(data);

      expect(result.success).toBe(true);
      expect(result.messageTypeId).toBe(70);
      expect(result.messageType).toBe('cancel');
      expect(result.data).toMatchObject({
        offerHash: offerHash,
      });
    });
  });
});

describe('verifyTransaction', () => {
  it('should verify a matching enhanced send', () => {
    // Build an enhanced send message
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '02';
    const assetId = '0000000000000001'; // XCP
    const quantity = '000000003b9aca00'; // 1 XCP

    // Pack a legacy P2PKH address (21 bytes)
    const addressBytes = packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    const addressHex = bytesToHex(addressBytes);

    const data = prefix + typeId + assetId + quantity + addressHex;

    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 1000000000n,
        destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect asset mismatch', () => {
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '02';
    const assetId = '0000000000000001'; // XCP
    const quantity = '000000003b9aca00';
    const addressBytes = packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    const addressHex = bytesToHex(addressBytes);

    const data = prefix + typeId + assetId + quantity + addressHex;

    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'BTC', // Wrong asset!
        quantity: 1000000000n,
        destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Asset mismatch'))).toBe(true);
  });

  it('should detect quantity mismatch', () => {
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '02';
    const assetId = '0000000000000001'; // XCP
    const quantity = '000000003b9aca00'; // 1 XCP
    const addressBytes = packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    const addressHex = bytesToHex(addressBytes);

    const data = prefix + typeId + assetId + quantity + addressHex;

    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 2000000000n, // Wrong quantity!
        destination: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Quantity mismatch'))).toBe(true);
  });

  it('should detect destination mismatch', () => {
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '02';
    const assetId = '0000000000000001';
    const quantity = '000000003b9aca00';
    const addressBytes = packAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    const addressHex = bytesToHex(addressBytes);

    const data = prefix + typeId + assetId + quantity + addressHex;

    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 1000000000n,
        destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', // Wrong address!
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Destination mismatch'))).toBe(true);
  });

  it('should verify order transactions', () => {
    const prefix = COUNTERPARTY_PREFIX_HEX;
    const typeId = '0a';
    const giveAssetId = '0000000000000001'; // XCP
    const giveQuantity = '000000003b9aca00'; // 1 XCP
    const getAssetId = '0000000000000000'; // BTC
    const getQuantity = '0000000000989680'; // 0.1 BTC
    const expiration = '0014'; // 20
    const feeRequired = '0000000000000000';

    const data = prefix + typeId + giveAssetId + giveQuantity + getAssetId + getQuantity + expiration + feeRequired;

    const result = verifyTransaction(data, {
      type: 'order',
      params: {
        give_asset: 'XCP',
        give_quantity: 1000000000n,
        get_asset: 'BTC',
        get_quantity: 10000000n,
        expiration: 20,
      },
    });

    expect(result.valid).toBe(true);
  });
});
