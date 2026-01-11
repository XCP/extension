/**
 * Counterparty-Core Compatibility Tests
 *
 * These tests replicate test vectors from counterparty-core Python tests
 * to ensure our TypeScript unpacker produces identical results.
 *
 * Source: counterparty-core/counterpartycore/test/units/messages/
 */

import { describe, it, expect } from 'vitest';
import { unpackEnhancedSend } from '../messages/enhancedSend';
import { unpackOrder } from '../messages/order';
import { unpackDispenser } from '../messages/dispenser';
import { unpackCancel } from '../messages/cancel';
import { unpackDestroy } from '../messages/destroy';
import { unpackSweep } from '../messages/sweep';
import { unpackIssuance } from '../messages/issuance';
import { MessageTypeId } from '../messageTypes';

/**
 * Test addresses from counterparty-core fixtures/defaults.py
 */
const TEST_ADDRESSES = {
  // ADDRESSES[0]
  addr0: 'mn6q3dS2EnDUx3bmyWc6D4szJNVGtaR7zc',
  addr0_hash: '4838d8b3588c4c7ba7c1d06f866e9b3739c63037',

  // ADDRESSES[1]
  addr1: 'mtQheFaSfWELRB2MyMBaiWjdDm6ux9Ezns',
  addr1_hash: '8d6ae8a3b381663118b4e1eff4cfc7d0954dd6ec',

  // ADDRESSES[2]
  addr2: 'mnfAHmddVibnZNSkh8DvKaQoiEfNsxjXzH',
  addr2_hash: '4e5638a01efbb2f292481797ae1dcfcdaeb98d00',

  // P2TR addresses
  p2tr0: 'bcrt1ps7gfq0h0hwu2cql9azz0wcf8rphr6xxeeyenrugd6yf263pxg9tqzsj5ec',
  p2tr1: 'bcrt1pw9jnqadndm3aydgm2kqanwvs2usuhlnqkuwwyfgpux6ya5p6j6zqv8fklm',
};

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert BigInt to 8-byte hex string (big-endian)
 */
function bigintToHex8(value: bigint): string {
  return value.toString(16).padStart(16, '0');
}

/**
 * Convert Python byte literal to hex string
 * e.g., b"\x84\x01" -> "8401"
 */
function pythonBytesToHex(pyBytes: string): string {
  // Remove b" prefix and " suffix
  let s = pyBytes.replace(/^b["']|["']$/g, '');
  // Handle escape sequences
  let result = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === 'x') {
      result += s.slice(i + 2, i + 4);
      i += 4;
    } else {
      result += s.charCodeAt(i).toString(16).padStart(2, '0');
      i += 1;
    }
  }
  return result;
}

describe('Counterparty-Core Compatibility', () => {
  describe('Enhanced Send (Legacy Format)', () => {
    /**
     * From enhancedsend_test.py:
     *
     * Legacy format: ">QQ21s" + memo
     * - asset_id: 8 bytes (XCP = 1)
     * - quantity: 8 bytes
     * - address: 21 bytes (version + 20 byte hash)
     * - memo: variable
     *
     * XCP asset_id = 1
     * quantity = 1000 = 0x03e8
     * address = mtQheFaSfWELRB2MyMBaiWjdDm6ux9Ezns (version 0x6f + hash)
     */

    it('should unpack XCP send to testnet address with memo', () => {
      // Construct legacy format message manually:
      // asset_id (8 bytes): 0x0000000000000001 = XCP
      // quantity (8 bytes): 0x00000000000003e8 = 1000
      // address (21 bytes): 0x6f + addr1_hash
      // memo: "memo"
      const assetId = '0000000000000001'; // XCP = 1
      const quantity = '00000000000003e8'; // 1000
      const addressBytes = '6f' + TEST_ADDRESSES.addr1_hash; // testnet prefix + hash
      const memo = Buffer.from('memo').toString('hex'); // "memo" as hex

      const payload = hexToBytes(assetId + quantity + addressBytes + memo);

      const result = unpackEnhancedSend(payload);

      expect(result.asset).toBe('XCP');
      expect(result.quantity).toBe(1000n);
      expect(result.destination).toBe(TEST_ADDRESSES.addr1);
      expect(result.memo).toBe('memo');
    });

    it('should unpack XCP send without memo', () => {
      const assetId = '0000000000000001'; // XCP = 1
      const quantity = '0000000005f5e100'; // 100000000 = 1 XCP (8 decimals)
      const addressBytes = '6f' + TEST_ADDRESSES.addr0_hash;

      const payload = hexToBytes(assetId + quantity + addressBytes);

      const result = unpackEnhancedSend(payload);

      expect(result.asset).toBe('XCP');
      expect(result.quantity).toBe(100000000n);
      expect(result.destination).toBe(TEST_ADDRESSES.addr0);
      expect(result.memo).toBeUndefined();
    });

    it('should unpack numeric asset send', () => {
      // Numeric assets have IDs >= 26^12 + 1
      // Use 26^12 + 1000 to be clearly in numeric range
      const numericAssetId = 26n ** 12n + 1000n;
      const assetId = bigintToHex8(numericAssetId);
      const quantity = '0000000000000064'; // 100
      const addressBytes = '6f' + TEST_ADDRESSES.addr2_hash;

      const payload = hexToBytes(assetId + quantity + addressBytes);

      const result = unpackEnhancedSend(payload);

      // Numeric asset name format: A + numeric_id
      expect(result.asset).toBe(`A${numericAssetId.toString()}`);
      expect(result.quantity).toBe(100n);
      expect(result.destination).toBe(TEST_ADDRESSES.addr2);
    });
  });

  describe('Order', () => {
    /**
     * From order.py:
     * FORMAT = ">QQQQHQ"
     * - give_id (Q): 8 bytes
     * - give_quantity (Q): 8 bytes
     * - get_id (Q): 8 bytes
     * - get_quantity (Q): 8 bytes
     * - expiration (H): 2 bytes
     * - fee_required (Q): 8 bytes
     */

    it('should unpack XCP for BTC order', () => {
      // give XCP (id=1), get BTC (id=0)
      const giveId = '0000000000000001'; // XCP
      const giveQty = '0000000005f5e100'; // 100000000 (1 XCP)
      const getId = '0000000000000000'; // BTC
      const getQty = '0000000000989680'; // 10000000 (0.1 BTC)
      const expiration = '000a'; // 10 blocks
      const feeRequired = '00000000000dbba0'; // 900000

      const payload = hexToBytes(giveId + giveQty + getId + getQty + expiration + feeRequired);

      const result = unpackOrder(payload);

      expect(result.giveAsset).toBe('XCP');
      expect(result.giveQuantity).toBe(100000000n);
      expect(result.getAsset).toBe('BTC');
      expect(result.getQuantity).toBe(10000000n);
      expect(result.expiration).toBe(10);
      expect(result.feeRequired).toBe(900000n);
    });

    it('should unpack BTC for XCP order', () => {
      const giveId = '0000000000000000'; // BTC
      const giveQty = '0000000000989680'; // 10000000 (0.1 BTC)
      const getId = '0000000000000001'; // XCP
      const getQty = '0000000005f5e100'; // 100000000 (1 XCP)
      const expiration = '0014'; // 20 blocks
      const feeRequired = '0000000000000000'; // 0

      const payload = hexToBytes(giveId + giveQty + getId + getQty + expiration + feeRequired);

      const result = unpackOrder(payload);

      expect(result.giveAsset).toBe('BTC');
      expect(result.giveQuantity).toBe(10000000n);
      expect(result.getAsset).toBe('XCP');
      expect(result.getQuantity).toBe(100000000n);
      expect(result.expiration).toBe(20);
      expect(result.feeRequired).toBe(0n);
    });
  });

  describe('Dispenser', () => {
    /**
     * From dispenser.py:
     * FORMAT = ">QQQB"
     * - asset (Q): 8 bytes
     * - give_quantity (Q): 8 bytes
     * - escrow_quantity (Q): 8 bytes
     * - status (B): 1 byte
     * + optional: mainchainrate (Q): 8 bytes
     * + optional: open_address bytes
     */

    it('should unpack basic dispenser', () => {
      // This tests the minimum dispenser format
      const assetId = '0000000000000001'; // XCP
      const giveQty = '0000000000000064'; // 100 per dispense
      const escrowQty = '00000000000003e8'; // 1000 total
      const status = '00'; // open
      const mainchainrate = '00000000000f4240'; // 1000000 sats = 0.01 BTC

      const payload = hexToBytes(assetId + giveQty + escrowQty + status + mainchainrate);

      const result = unpackDispenser(payload);

      expect(result.asset).toBe('XCP');
      expect(result.giveQuantity).toBe(100n);
      expect(result.escrowQuantity).toBe(1000n);
      expect(result.status).toBe(0);
      expect(result.mainchainrate).toBe(1000000n);
    });
  });

  describe('Cancel', () => {
    /**
     * From cancel.py:
     * FORMAT = ">32s"
     * - offer_hash: 32 bytes
     */

    it('should unpack cancel order', () => {
      // Random offer hash for testing
      const offerHash = 'deadbeef'.repeat(8); // 32 bytes

      const payload = hexToBytes(offerHash);

      const result = unpackCancel(payload);

      expect(result.offerHash.toLowerCase()).toBe(offerHash);
    });
  });

  describe('Destroy', () => {
    /**
     * From destroy.py:
     * FORMAT = ">QQ"
     * - asset (Q): 8 bytes
     * - quantity (Q): 8 bytes
     * + optional: tag bytes
     */

    it('should unpack destroy without tag', () => {
      const assetId = '0000000000000001'; // XCP
      const quantity = '0000000005f5e100'; // 100000000

      const payload = hexToBytes(assetId + quantity);

      const result = unpackDestroy(payload);

      expect(result.asset).toBe('XCP');
      expect(result.quantity).toBe(100000000n);
      expect(result.tag).toBeUndefined();
    });

    it('should unpack destroy with tag', () => {
      const assetId = '0000000000000001'; // XCP
      const quantity = '0000000000000064'; // 100
      const tag = Buffer.from('burned').toString('hex');

      const payload = hexToBytes(assetId + quantity + tag);

      const result = unpackDestroy(payload);

      expect(result.asset).toBe('XCP');
      expect(result.quantity).toBe(100n);
      expect(result.tag).toBe('burned');
    });
  });

  describe('Sweep', () => {
    /**
     * From sweep.py:
     * FORMAT = ">21sB"
     * - destination (21s): 21 bytes
     * - flags (B): 1 byte
     * + optional: memo bytes
     */

    it('should unpack sweep', () => {
      const destAddress = '6f' + TEST_ADDRESSES.addr1_hash; // 21 bytes
      const flags = '01'; // 1 = sweep balances

      const payload = hexToBytes(destAddress + flags);

      const result = unpackSweep(payload);

      expect(result.destination).toBe(TEST_ADDRESSES.addr1);
      expect(result.flags).toBe(1);
      expect(result.memo).toBeUndefined();
    });

    it('should unpack sweep with memo', () => {
      const destAddress = '6f' + TEST_ADDRESSES.addr0_hash;
      const flags = '03'; // 3 = sweep all
      const memo = Buffer.from('farewell').toString('hex');

      const payload = hexToBytes(destAddress + flags + memo);

      const result = unpackSweep(payload);

      expect(result.destination).toBe(TEST_ADDRESSES.addr0);
      expect(result.flags).toBe(3);
      expect(result.memo).toBe('farewell');
    });
  });

  describe('Issuance', () => {
    /**
     * From issuance.py:
     * FORMAT_1 = ">QQ?" (17 bytes minimum)
     * - asset_id (Q): 8 bytes
     * - quantity (Q): 8 bytes
     * - divisible (?): 1 byte (boolean)
     * + optional: callable, call_date, call_price (legacy)
     * + optional: description
     */

    it('should unpack basic issuance', () => {
      // Numeric assets have IDs >= 26^12 + 1
      const numericAssetId = 26n ** 12n + 5000n;
      const assetId = bigintToHex8(numericAssetId);
      const quantity = '00000000000f4240'; // 1000000
      const divisible = '01'; // true

      const payload = hexToBytes(assetId + quantity + divisible);

      const result = unpackIssuance(payload, MessageTypeId.ISSUANCE);

      expect(result.asset).toBe(`A${numericAssetId.toString()}`);
      expect(result.quantity).toBe(1000000n);
      expect(result.divisible).toBe(true);
    });

    it('should unpack non-divisible issuance', () => {
      const assetId = '00fedcba98765432';
      const quantity = '0000000000000064'; // 100
      const divisible = '00'; // false

      const payload = hexToBytes(assetId + quantity + divisible);

      const result = unpackIssuance(payload, MessageTypeId.ISSUANCE);

      expect(result.quantity).toBe(100n);
      expect(result.divisible).toBe(false);
    });

    it('should unpack issuance with description', () => {
      const assetId = '0000000000000001'; // Would be invalid for issuance, but testing format
      const quantity = '0000000005f5e100';
      const divisible = '01';
      // Legacy format has callable (1), call_date (4), call_price (4) before description
      const callable = '00';
      const callDate = '00000000';
      const callPrice = '00000000';
      const description = Buffer.from('My Token').toString('hex');

      const payload = hexToBytes(assetId + quantity + divisible + callable + callDate + callPrice + description);

      const result = unpackIssuance(payload, MessageTypeId.ISSUANCE);

      expect(result.divisible).toBe(true);
      expect(result.description).toBe('My Token');
    });
  });
});

describe('Asset ID to Name Conversion', () => {
  /**
   * From counterparty-core/lib/ledger/issuances.py:
   * - BTC = 0
   * - XCP = 1
   * - Numeric assets: A + numeric_id (for ids >= 26^12 + 1)
   * - Named assets: base26 decode (for ids 26 to 26^12)
   */

  it('should decode BTC (id=0)', () => {
    const assetId = '0000000000000000';
    const giveQty = '00000000000003e8';
    const getId = '0000000000000001';
    const getQty = '0000000005f5e100';
    const expiration = '000a';
    const feeRequired = '0000000000000000';

    const payload = hexToBytes(assetId + giveQty + getId + getQty + expiration + feeRequired);
    const result = unpackOrder(payload);

    expect(result.giveAsset).toBe('BTC');
  });

  it('should decode XCP (id=1)', () => {
    const assetId = '0000000000000001';
    const giveQty = '00000000000003e8';
    const getId = '0000000000000000';
    const getQty = '00000000000003e8';
    const expiration = '000a';
    const feeRequired = '0000000000000000';

    const payload = hexToBytes(assetId + giveQty + getId + getQty + expiration + feeRequired);
    const result = unpackOrder(payload);

    expect(result.giveAsset).toBe('XCP');
  });
});
