/**
 * Tests for Provider Transaction Verification
 *
 * Tests verifyProviderTransaction which compares locally-unpacked Counterparty
 * messages against API-decoded messages to detect tampering.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyProviderTransaction,
  type ApiCounterpartyMessage,
  type ProviderVerificationResult,
} from '../providerVerify';
import {
  COUNTERPARTY_PREFIX_HEX,
  MessageTypeId,
} from '../messageTypes';

/**
 * Helper: build a hex-encoded Counterparty message.
 * Format: CNTRPRTY prefix (8 bytes) + 1-byte type ID + payload
 */
function buildMessage(typeId: number, payloadHex: string): string {
  const typeHex = typeId.toString(16).padStart(2, '0');
  return COUNTERPARTY_PREFIX_HEX + typeHex + payloadHex;
}

/** Convert BigInt to 8-byte big-endian hex */
function bigintHex(value: bigint): string {
  return value.toString(16).padStart(16, '0');
}

/** Encode a 21-byte packed address from a hex hash (P2PKH version 0x00) */
function packedAddressHex(hash20Hex: string): string {
  return '00' + hash20Hex;
}

// Test constants
const XCP_ID = 1n;
const TEST_HASH = '4838d8b3588c4c7ba7c1d06f866e9b3739c63037';
// Mainnet P2PKH addresses for the test hashes (version byte 0x00)
const TEST_ADDR = '17askaM3RknEAw8AFwdiP9ffSNtZyfzFBw';
const TEST_HASH2 = '8d6ae8a3b381663118b4e1eff4cfc7d0954dd6ec';
const TEST_ADDR2 = '1DsXBDMiCGMW8GpLv4YRbnFBNQHjTsMYdo';

// ── Helper function tests ───────────────────────────────────────────

describe('verifyProviderTransaction', () => {
  describe('edge cases and early returns', () => {
    it('returns passed=undefined when no opReturnData', () => {
      const result = verifyProviderTransaction(undefined);
      expect(result.passed).toBeUndefined();
      expect(result.mismatches).toEqual([]);
    });

    it('returns passed=undefined for empty string', () => {
      const result = verifyProviderTransaction('');
      expect(result.passed).toBeUndefined();
      expect(result.mismatches).toEqual([]);
    });

    it('returns passed=undefined for non-Counterparty data', () => {
      const result = verifyProviderTransaction('deadbeef');
      expect(result.passed).toBeUndefined();
      expect(result.mismatches).toEqual([]);
    });

    it('returns passed=false when local unpack fails (data too short)', () => {
      // Valid prefix but no type ID or payload
      const result = verifyProviderTransaction(COUNTERPARTY_PREFIX_HEX);
      expect(result.passed).toBe(false);
      expect(result.mismatches).toContain('Local unpack failed');
    });

    it('returns passed=true when local unpack succeeds but no API message', () => {
      // Build a valid enhanced_send message
      const payload = bigintHex(XCP_ID) + bigintHex(1000n) + packedAddressHex(TEST_HASH);
      const data = buildMessage(MessageTypeId.ENHANCED_SEND, payload);
      const result = verifyProviderTransaction(data);
      expect(result.passed).toBe(true);
      expect(result.mismatches).toEqual([]);
      expect(result.localUnpack).toBeDefined();
    });
  });

  describe('message type mismatch detection', () => {
    it('detects message type name mismatch', () => {
      const payload = bigintHex(XCP_ID) + bigintHex(1000n) + packedAddressHex(TEST_HASH);
      const data = buildMessage(MessageTypeId.ENHANCED_SEND, payload);

      const apiMessage: ApiCounterpartyMessage = {
        messageType: 'order', // wrong type
        messageTypeId: MessageTypeId.ENHANCED_SEND,
        messageData: { asset: 'XCP', quantity: 1000 },
        description: '',
      };

      const result = verifyProviderTransaction(data, apiMessage);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Message type'))).toBe(true);
    });

    it('detects message type ID mismatch', () => {
      const payload = bigintHex(XCP_ID) + bigintHex(1000n) + packedAddressHex(TEST_HASH);
      const data = buildMessage(MessageTypeId.ENHANCED_SEND, payload);

      const apiMessage: ApiCounterpartyMessage = {
        messageType: 'enhanced_send',
        messageTypeId: 99, // wrong ID
        messageData: { asset: 'XCP', quantity: 1000 },
        description: '',
      };

      const result = verifyProviderTransaction(data, apiMessage);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Message type ID'))).toBe(true);
    });
  });

  describe('enhanced_send verification', () => {
    function makeEnhancedSend(assetId: bigint, quantity: bigint, addrHash: string): string {
      return buildMessage(
        MessageTypeId.ENHANCED_SEND,
        bigintHex(assetId) + bigintHex(quantity) + packedAddressHex(addrHash)
      );
    }

    function makeApiMessage(overrides: Record<string, unknown> = {}): ApiCounterpartyMessage {
      return {
        messageType: 'enhanced_send',
        messageTypeId: MessageTypeId.ENHANCED_SEND,
        messageData: {
          asset: 'XCP',
          quantity: 1000,
          destination: TEST_ADDR,
          ...overrides,
        },
        description: '',
      };
    }

    it('passes when local and API match', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage();
      const result = verifyProviderTransaction(data, api);
      expect(result.mismatches).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('detects asset mismatch', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage({ asset: 'PEPECASH' });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Asset'))).toBe(true);
    });

    it('detects quantity mismatch', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage({ quantity: 9999 });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Quantity'))).toBe(true);
    });

    it('detects destination mismatch', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage({ destination: TEST_ADDR2 });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Destination'))).toBe(true);
    });

    it('handles quantity as string in API data', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage({ quantity: '1000' });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('handles quantity as bigint in API data', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage({ quantity: 1000n });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('asset comparison is case-insensitive', () => {
      const data = makeEnhancedSend(XCP_ID, 1000n, TEST_HASH);
      const api = makeApiMessage({ asset: 'xcp' });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });
  });

  describe('order verification', () => {
    // Order binary format: >QQQQHQ
    // give_asset_id(8) + give_quantity(8) + get_asset_id(8) + get_quantity(8) + expiration(2) + fee_required(8)
    function makeOrder(
      giveAssetId: bigint, giveQty: bigint,
      getAssetId: bigint, getQty: bigint,
      expiration: number
    ): string {
      const expHex = expiration.toString(16).padStart(4, '0');
      const feeRequired = bigintHex(0n);
      return buildMessage(
        MessageTypeId.ORDER,
        bigintHex(giveAssetId) + bigintHex(giveQty) +
        bigintHex(getAssetId) + bigintHex(getQty) +
        expHex + feeRequired
      );
    }

    function makeOrderApi(overrides: Record<string, unknown> = {}): ApiCounterpartyMessage {
      return {
        messageType: 'order',
        messageTypeId: MessageTypeId.ORDER,
        messageData: {
          give_asset: 'XCP',
          give_quantity: 50000,
          get_asset: 'BTC',
          get_quantity: 100000,
          expiration: 100,
          ...overrides,
        },
        description: '',
      };
    }

    it('passes when all fields match', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api = makeOrderApi();
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
      expect(result.mismatches).toEqual([]);
    });

    it('detects give_asset mismatch', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api = makeOrderApi({ give_asset: 'PEPECASH' });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Give asset'))).toBe(true);
    });

    it('detects give_quantity mismatch', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api = makeOrderApi({ give_quantity: 99999 });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Give quantity'))).toBe(true);
    });

    it('detects get_asset mismatch', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api = makeOrderApi({ get_asset: 'XCP' });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Get asset'))).toBe(true);
    });

    it('detects get_quantity mismatch', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api = makeOrderApi({ get_quantity: 1 });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Get quantity'))).toBe(true);
    });

    it('detects expiration mismatch', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api = makeOrderApi({ expiration: 200 });
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Expiration'))).toBe(true);
    });

    it('supports camelCase API field names', () => {
      const data = makeOrder(XCP_ID, 50000n, 0n, 100000n, 100);
      const api: ApiCounterpartyMessage = {
        messageType: 'order',
        messageTypeId: MessageTypeId.ORDER,
        messageData: {
          giveAsset: 'XCP',
          giveQuantity: 50000,
          getAsset: 'BTC',
          getQuantity: 100000,
          expiration: 100,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });
  });

  describe('cancel verification', () => {
    // Cancel binary: 32-byte offer hash
    function makeCancel(offerHashHex: string): string {
      return buildMessage(MessageTypeId.CANCEL, offerHashHex);
    }

    const OFFER_HASH = 'a' .repeat(64);

    it('passes when offer hash matches', () => {
      const data = makeCancel(OFFER_HASH);
      const api: ApiCounterpartyMessage = {
        messageType: 'cancel',
        messageTypeId: MessageTypeId.CANCEL,
        messageData: { offer_hash: OFFER_HASH },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects offer hash mismatch', () => {
      const data = makeCancel(OFFER_HASH);
      const api: ApiCounterpartyMessage = {
        messageType: 'cancel',
        messageTypeId: MessageTypeId.CANCEL,
        messageData: { offer_hash: 'b'.repeat(64) },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Offer hash'))).toBe(true);
    });

    it('hash comparison is case-insensitive', () => {
      const data = makeCancel(OFFER_HASH);
      const api: ApiCounterpartyMessage = {
        messageType: 'cancel',
        messageTypeId: MessageTypeId.CANCEL,
        messageData: { offer_hash: OFFER_HASH.toUpperCase() },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('supports alternative API key names', () => {
      const data = makeCancel(OFFER_HASH);
      const api: ApiCounterpartyMessage = {
        messageType: 'cancel',
        messageTypeId: MessageTypeId.CANCEL,
        messageData: { txHash: OFFER_HASH },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });
  });

  describe('destroy verification', () => {
    // Destroy binary: asset_id(8) + quantity(8) [+ tag(variable)]
    function makeDestroy(assetId: bigint, quantity: bigint): string {
      return buildMessage(
        MessageTypeId.DESTROY,
        bigintHex(assetId) + bigintHex(quantity)
      );
    }

    it('passes when asset and quantity match', () => {
      const data = makeDestroy(XCP_ID, 5000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'destroy',
        messageTypeId: MessageTypeId.DESTROY,
        messageData: { asset: 'XCP', quantity: 5000 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects asset mismatch', () => {
      const data = makeDestroy(XCP_ID, 5000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'destroy',
        messageTypeId: MessageTypeId.DESTROY,
        messageData: { asset: 'PEPECASH', quantity: 5000 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Asset'))).toBe(true);
    });

    it('detects quantity mismatch', () => {
      const data = makeDestroy(XCP_ID, 5000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'destroy',
        messageTypeId: MessageTypeId.DESTROY,
        messageData: { asset: 'XCP', quantity: 1 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Quantity'))).toBe(true);
    });
  });

  describe('sweep verification', () => {
    // Sweep binary: address(21) + flags(1) + memo_length(?) ...
    function makeSweep(addrHash: string, flags: number): string {
      const flagsHex = flags.toString(16).padStart(2, '0');
      return buildMessage(
        MessageTypeId.SWEEP,
        packedAddressHex(addrHash) + flagsHex
      );
    }

    it('passes when destination and flags match', () => {
      const data = makeSweep(TEST_HASH, 3);
      const api: ApiCounterpartyMessage = {
        messageType: 'sweep',
        messageTypeId: MessageTypeId.SWEEP,
        messageData: {
          destination: TEST_ADDR,
          flags: 3,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects destination mismatch', () => {
      const data = makeSweep(TEST_HASH, 3);
      const api: ApiCounterpartyMessage = {
        messageType: 'sweep',
        messageTypeId: MessageTypeId.SWEEP,
        messageData: {
          destination: TEST_ADDR2,
          flags: 3,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Destination'))).toBe(true);
    });

    it('detects flags mismatch', () => {
      const data = makeSweep(TEST_HASH, 3);
      const api: ApiCounterpartyMessage = {
        messageType: 'sweep',
        messageTypeId: MessageTypeId.SWEEP,
        messageData: {
          destination: TEST_ADDR,
          flags: 7,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Flags'))).toBe(true);
    });
  });

  describe('btcpay verification', () => {
    // BTCPay binary: tx0Hash(32 bytes) + tx1Hash(32 bytes)
    // orderMatchId is derived as "${tx0Hash}_${tx1Hash}"
    const TX0_HASH = 'aa'.repeat(32);
    const TX1_HASH = 'bb'.repeat(32);

    function makeBTCPay(tx0Hex: string, tx1Hex: string): string {
      return buildMessage(MessageTypeId.BTC_PAY, tx0Hex + tx1Hex);
    }

    it('passes when order match ID matches', () => {
      const data = makeBTCPay(TX0_HASH, TX1_HASH);
      const api: ApiCounterpartyMessage = {
        messageType: 'btcpay',
        messageTypeId: MessageTypeId.BTC_PAY,
        messageData: { order_match_id: `${TX0_HASH}_${TX1_HASH}` },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects order match ID mismatch', () => {
      const data = makeBTCPay(TX0_HASH, TX1_HASH);
      const api: ApiCounterpartyMessage = {
        messageType: 'btcpay',
        messageTypeId: MessageTypeId.BTC_PAY,
        messageData: { order_match_id: `${'cd'.repeat(32)}_${'ef'.repeat(32)}` },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Order match ID'))).toBe(true);
    });
  });

  describe('dispenser verification', () => {
    // Dispenser binary: asset_id(8) + give_quantity(8) + escrow_quantity(8) + status(1) + [mainchainrate(8)]
    function makeDispenser(
      assetId: bigint, giveQty: bigint, escrowQty: bigint, rate: bigint
    ): string {
      const status = '00'; // OPEN
      return buildMessage(
        MessageTypeId.DISPENSER,
        bigintHex(assetId) + bigintHex(giveQty) + bigintHex(escrowQty) +
        status + bigintHex(rate)
      );
    }

    it('passes when all fields match', () => {
      const data = makeDispenser(XCP_ID, 100n, 1000n, 50000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'dispenser',
        messageTypeId: MessageTypeId.DISPENSER,
        messageData: {
          asset: 'XCP',
          give_quantity: 100,
          escrow_quantity: 1000,
          mainchainrate: 50000,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects give_quantity mismatch', () => {
      const data = makeDispenser(XCP_ID, 100n, 1000n, 50000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'dispenser',
        messageTypeId: MessageTypeId.DISPENSER,
        messageData: {
          asset: 'XCP',
          give_quantity: 999,
          escrow_quantity: 1000,
          mainchainrate: 50000,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Give quantity'))).toBe(true);
    });

    it('detects escrow_quantity mismatch', () => {
      const data = makeDispenser(XCP_ID, 100n, 1000n, 50000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'dispenser',
        messageTypeId: MessageTypeId.DISPENSER,
        messageData: {
          asset: 'XCP',
          give_quantity: 100,
          escrow_quantity: 5555,
          mainchainrate: 50000,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Escrow quantity'))).toBe(true);
    });

    it('detects rate mismatch', () => {
      const data = makeDispenser(XCP_ID, 100n, 1000n, 50000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'dispenser',
        messageTypeId: MessageTypeId.DISPENSER,
        messageData: {
          asset: 'XCP',
          give_quantity: 100,
          escrow_quantity: 1000,
          mainchainrate: 1,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Rate'))).toBe(true);
    });
  });

  describe('issuance verification', () => {
    // Issuance binary: asset_id(8) + quantity(8) + divisible(1) [+ callable(1) + callDate(4) + callPrice(4) + description]
    function makeIssuance(
      assetId: bigint, quantity: bigint, divisible: boolean
    ): string {
      const divByte = divisible ? '01' : '00';
      // Add FORMAT_2 fields: callable(0) + callDate(0) + callPrice(0) + empty description
      const callable = '00';
      const callDate = '00000000';
      const callPrice = '00000000';
      return buildMessage(
        MessageTypeId.ISSUANCE,
        bigintHex(assetId) + bigintHex(quantity) + divByte + callable + callDate + callPrice
      );
    }

    it('passes when all fields match', () => {
      const data = makeIssuance(XCP_ID, 100000n, true);
      const api: ApiCounterpartyMessage = {
        messageType: 'issuance',
        messageTypeId: MessageTypeId.ISSUANCE,
        messageData: {
          asset: 'XCP',
          quantity: 100000,
          divisible: true,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects quantity mismatch', () => {
      const data = makeIssuance(XCP_ID, 100000n, true);
      const api: ApiCounterpartyMessage = {
        messageType: 'issuance',
        messageTypeId: MessageTypeId.ISSUANCE,
        messageData: {
          asset: 'XCP',
          quantity: 999999,
          divisible: true,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Quantity'))).toBe(true);
    });

    it('detects divisible mismatch', () => {
      const data = makeIssuance(XCP_ID, 100000n, false);
      const api: ApiCounterpartyMessage = {
        messageType: 'issuance',
        messageTypeId: MessageTypeId.ISSUANCE,
        messageData: {
          asset: 'XCP',
          quantity: 100000,
          divisible: true,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Divisible'))).toBe(true);
    });
  });

  describe('dividend verification', () => {
    // Dividend binary: quantity_per_unit(8) + asset_id(8) + dividend_asset_id(8)
    function makeDividend(qtyPerUnit: bigint, assetId: bigint, divAssetId: bigint): string {
      return buildMessage(
        MessageTypeId.DIVIDEND,
        bigintHex(qtyPerUnit) + bigintHex(assetId) + bigintHex(divAssetId)
      );
    }

    it('passes when all fields match', () => {
      const data = makeDividend(500n, XCP_ID, 0n); // BTC dividend on XCP
      const api: ApiCounterpartyMessage = {
        messageType: 'dividend',
        messageTypeId: MessageTypeId.DIVIDEND,
        messageData: {
          asset: 'XCP',
          quantity_per_unit: 500,
          dividend_asset: 'BTC',
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects quantity_per_unit mismatch', () => {
      const data = makeDividend(500n, XCP_ID, 0n);
      const api: ApiCounterpartyMessage = {
        messageType: 'dividend',
        messageTypeId: MessageTypeId.DIVIDEND,
        messageData: {
          asset: 'XCP',
          quantity_per_unit: 999,
          dividend_asset: 'BTC',
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Quantity per unit'))).toBe(true);
    });

    it('detects dividend_asset mismatch', () => {
      const data = makeDividend(500n, XCP_ID, 0n); // BTC
      const api: ApiCounterpartyMessage = {
        messageType: 'dividend',
        messageTypeId: MessageTypeId.DIVIDEND,
        messageData: {
          asset: 'XCP',
          quantity_per_unit: 500,
          dividend_asset: 'XCP', // wrong, should be BTC
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Dividend asset'))).toBe(true);
    });
  });

  describe('broadcast verification', () => {
    // Broadcast binary: timestamp(4) + value(8 as double) + fee_fraction_int(4) + text_length(variable)
    function makeBroadcast(timestamp: number, value: number, feeFractionInt: number): string {
      const tsHex = timestamp.toString(16).padStart(8, '0');
      // IEEE 754 double -> 8 bytes hex
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, value, false); // big-endian
      const valueHex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      const feeHex = feeFractionInt.toString(16).padStart(8, '0');
      const textLen = '00'; // empty text
      return buildMessage(
        MessageTypeId.BROADCAST,
        tsHex + valueHex + feeHex + textLen
      );
    }

    it('passes when all fields match', () => {
      const data = makeBroadcast(1700000000, 1.5, 5000000);
      const api: ApiCounterpartyMessage = {
        messageType: 'broadcast',
        messageTypeId: MessageTypeId.BROADCAST,
        messageData: {
          timestamp: 1700000000,
          value: 1.5,
          fee_fraction: 5000000,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects timestamp mismatch', () => {
      const data = makeBroadcast(1700000000, 1.5, 5000000);
      const api: ApiCounterpartyMessage = {
        messageType: 'broadcast',
        messageTypeId: MessageTypeId.BROADCAST,
        messageData: {
          timestamp: 9999999,
          value: 1.5,
          fee_fraction: 5000000,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Timestamp'))).toBe(true);
    });

    it('detects value mismatch', () => {
      const data = makeBroadcast(1700000000, 1.5, 5000000);
      const api: ApiCounterpartyMessage = {
        messageType: 'broadcast',
        messageTypeId: MessageTypeId.BROADCAST,
        messageData: {
          timestamp: 1700000000,
          value: 99.9,
          fee_fraction: 5000000,
        },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Value'))).toBe(true);
    });
  });

  describe('fairmint verification', () => {
    // Fairmint uses CBOR or pipe-delimited format.
    // CBOR 2-element array: 0x82 + encoded asset_id + encoded quantity
    // For small values, CBOR encodes integers directly (0x00-0x17 for 0-23, 0x18 XX for 24-255, 0x19 XXXX for 256-65535, 0x1a XXXXXXXX for larger)
    function makeFairmintCbor(assetId: bigint, quantity: bigint): string {
      // Build CBOR: 0x82 (2-element array) + encoded integers
      const encodeCborUint = (n: bigint): string => {
        if (n <= 23n) return n.toString(16).padStart(2, '0');
        if (n <= 0xffn) return '18' + n.toString(16).padStart(2, '0');
        if (n <= 0xffffn) return '19' + n.toString(16).padStart(4, '0');
        if (n <= 0xffffffffn) return '1a' + n.toString(16).padStart(8, '0');
        return '1b' + n.toString(16).padStart(16, '0');
      };
      return buildMessage(
        MessageTypeId.FAIRMINT,
        '82' + encodeCborUint(assetId) + encodeCborUint(quantity)
      );
    }

    it('passes when fields match', () => {
      const data = makeFairmintCbor(XCP_ID, 1000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'fairmint',
        messageTypeId: MessageTypeId.FAIRMINT,
        messageData: { asset: 'XCP', quantity: 1000 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects quantity mismatch', () => {
      const data = makeFairmintCbor(XCP_ID, 1000n);
      const api: ApiCounterpartyMessage = {
        messageType: 'fairmint',
        messageTypeId: MessageTypeId.FAIRMINT,
        messageData: { asset: 'XCP', quantity: 9999 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
    });
  });

  describe('send (legacy) verification', () => {
    // Send binary: asset_id(8) + quantity(8)
    function makeSend(assetId: bigint, quantity: bigint): string {
      return buildMessage(MessageTypeId.SEND, bigintHex(assetId) + bigintHex(quantity));
    }

    it('passes when fields match', () => {
      // SEND uses 4-byte type ID format (first byte is 0)
      // MessageTypeId.SEND = 0, so the message starts with 00000000
      const typeHex = '00000000';
      const payload = bigintHex(XCP_ID) + bigintHex(2000n);
      const data = COUNTERPARTY_PREFIX_HEX + typeHex + payload;

      const api: ApiCounterpartyMessage = {
        messageType: 'send',
        messageTypeId: MessageTypeId.SEND,
        messageData: { asset: 'XCP', quantity: 2000 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detects asset mismatch', () => {
      const typeHex = '00000000';
      const payload = bigintHex(XCP_ID) + bigintHex(2000n);
      const data = COUNTERPARTY_PREFIX_HEX + typeHex + payload;

      const api: ApiCounterpartyMessage = {
        messageType: 'send',
        messageTypeId: MessageTypeId.SEND,
        messageData: { asset: 'PEPECASH', quantity: 2000 },
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.some(m => m.includes('Asset'))).toBe(true);
    });
  });

  describe('multiple mismatches', () => {
    it('reports all mismatches in a single verification', () => {
      const payload = bigintHex(XCP_ID) + bigintHex(1000n) + packedAddressHex(TEST_HASH);
      const data = buildMessage(MessageTypeId.ENHANCED_SEND, payload);

      const api: ApiCounterpartyMessage = {
        messageType: 'enhanced_send',
        messageTypeId: MessageTypeId.ENHANCED_SEND,
        messageData: {
          asset: 'WRONG',
          quantity: 9999,
          destination: TEST_ADDR2,
        },
        description: '',
      };

      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(false);
      expect(result.mismatches.length).toBeGreaterThanOrEqual(2);
      expect(result.warning).toContain('Verification failed');
    });
  });

  describe('dispense and detach (minimal payload types)', () => {
    it('dispense passes with matching type (no field-level checks)', () => {
      // Dispense has just a marker byte
      const data = buildMessage(MessageTypeId.DISPENSE, '00');
      const api: ApiCounterpartyMessage = {
        messageType: 'dispense',
        messageTypeId: MessageTypeId.DISPENSE,
        messageData: {},
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });

    it('detach passes with matching type (minimal verification)', () => {
      // Detach payload is a destination address string
      const destBytes = new TextEncoder().encode('mn6q3dS2EnDUx3bmyWc6D4szJNVGtaR7zc');
      const destHex = Array.from(destBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const data = buildMessage(MessageTypeId.UTXO_DETACH, destHex);
      const api: ApiCounterpartyMessage = {
        messageType: 'detach',
        messageTypeId: MessageTypeId.UTXO_DETACH,
        messageData: {},
        description: '',
      };
      const result = verifyProviderTransaction(data, api);
      expect(result.passed).toBe(true);
    });
  });
});
