/**
 * Integration Tests for Counterparty Message Unpacking
 *
 * These tests call the real Counterparty API with validate=0 to get composed
 * transactions, then verify that our local unpacker correctly extracts the data.
 *
 * These tests require network access and may be slow. They're marked with
 * .skip() by default and can be enabled by removing the skip.
 *
 * To run integration tests:
 *   npm test -- --run integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  unpackCounterpartyMessage,
  verifyTransaction,
  extractOpReturnData,
  MessageTypeId,
} from '../index';

// API base URL
const API_BASE = 'https://api.counterparty.io:4000';

// Test addresses (real addresses with XCP holdings for testing)
const TEST_SOURCE = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // Satoshi's address
const TEST_DEST = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

/**
 * Helper to call Counterparty API compose endpoint
 */
async function composeTransaction(
  endpoint: string,
  params: Record<string, string | number | boolean>
): Promise<{ rawtx: string; data: string } | null> {
  // Add validate=0 to skip balance/validity checks
  const queryParams = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
    validate: '0',
  });

  const url = `${API_BASE}/v2/addresses/${params.source || TEST_SOURCE}/compose/${endpoint}?${queryParams}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`API error for ${endpoint}:`, response.status, await response.text());
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.warn(`API returned error for ${endpoint}:`, data.error);
      return null;
    }

    // The API returns { result: { rawtx, data, ... } }
    if (data.result?.rawtx && data.result?.data) {
      return {
        rawtx: data.result.rawtx,
        data: data.result.data,
      };
    }

    console.warn(`Unexpected API response for ${endpoint}:`, data);
    return null;
  } catch (error) {
    console.warn(`Network error for ${endpoint}:`, error);
    return null;
  }
}

/**
 * Extract the Counterparty data from a composed transaction's data field
 */
function getDataFromCompose(composeResult: { data: string }): string {
  // The data field from compose is the full OP_RETURN content
  // It should start with the CNTRPRTY prefix (434e545250525459)
  return composeResult.data;
}

describe.skip('Integration: Counterparty API Compose & Unpack', () => {
  // Increase timeout for API calls
  beforeAll(() => {
    // Warm up the connection
  });

  describe('Enhanced Send', () => {
    it('should compose and unpack an enhanced send', async () => {
      const result = await composeTransaction('send', {
        source: TEST_SOURCE,
        destination: TEST_DEST,
        asset: 'XCP',
        quantity: 100000000, // 1 XCP
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      expect(unpacked.messageTypeId).toBe(MessageTypeId.ENHANCED_SEND);
      expect(unpacked.data).toMatchObject({
        asset: 'XCP',
        quantity: 100000000n,
      });

      // Also verify using the verify function
      const verification = verifyTransaction(data, {
        type: 'enhanced_send',
        params: {
          asset: 'XCP',
          quantity: 100000000,
          destination: TEST_DEST,
        },
      });

      expect(verification.valid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    }, 30000);

    it('should detect quantity mismatch in enhanced send', async () => {
      const result = await composeTransaction('send', {
        source: TEST_SOURCE,
        destination: TEST_DEST,
        asset: 'XCP',
        quantity: 100000000, // 1 XCP
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);

      // Verify with wrong quantity - should detect mismatch
      const verification = verifyTransaction(data, {
        type: 'enhanced_send',
        params: {
          asset: 'XCP',
          quantity: 200000000, // WRONG! Should be 100000000
          destination: TEST_DEST,
        },
      });

      expect(verification.valid).toBe(false);
      expect(verification.errors.some(e => e.includes('Quantity mismatch'))).toBe(true);
    }, 30000);
  });

  describe('Order', () => {
    it('should compose and unpack a DEX order', async () => {
      const result = await composeTransaction('order', {
        source: TEST_SOURCE,
        give_asset: 'XCP',
        give_quantity: 100000000, // 1 XCP
        get_asset: 'BTC',
        get_quantity: 10000000, // 0.1 BTC
        expiration: 100,
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      expect(unpacked.messageTypeId).toBe(MessageTypeId.ORDER);
      expect(unpacked.data).toMatchObject({
        giveAsset: 'XCP',
        giveQuantity: 100000000n,
        getAsset: 'BTC',
        getQuantity: 10000000n,
        expiration: 100,
      });

      // Verify
      const verification = verifyTransaction(data, {
        type: 'order',
        params: {
          give_asset: 'XCP',
          give_quantity: 100000000,
          get_asset: 'BTC',
          get_quantity: 10000000,
          expiration: 100,
        },
      });

      expect(verification.valid).toBe(true);
    }, 30000);
  });

  describe('Dispenser', () => {
    it('should compose and unpack a dispenser', async () => {
      const result = await composeTransaction('dispenser', {
        source: TEST_SOURCE,
        asset: 'XCP',
        give_quantity: 10000000, // 0.1 XCP per dispense
        escrow_quantity: 100000000, // 1 XCP total
        mainchainrate: 100000, // 100,000 sats per dispense
        status: 0, // Open
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      expect(unpacked.messageTypeId).toBe(MessageTypeId.DISPENSER);
      expect(unpacked.data).toMatchObject({
        asset: 'XCP',
        giveQuantity: 10000000n,
        escrowQuantity: 100000000n,
        mainchainrate: 100000n,
        status: 0,
      });

      // Verify
      const verification = verifyTransaction(data, {
        type: 'dispenser',
        params: {
          asset: 'XCP',
          give_quantity: 10000000,
          escrow_quantity: 100000000,
          mainchainrate: 100000,
          status: 0,
        },
      });

      expect(verification.valid).toBe(true);
    }, 30000);
  });

  describe('Cancel', () => {
    it('should compose and unpack a cancel', async () => {
      // Use a fake order hash
      const fakeOrderHash = 'a'.repeat(64);

      const result = await composeTransaction('cancel', {
        source: TEST_SOURCE,
        offer_hash: fakeOrderHash,
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      expect(unpacked.messageTypeId).toBe(MessageTypeId.CANCEL);
      expect(unpacked.data).toMatchObject({
        offerHash: fakeOrderHash,
      });

      // Verify
      const verification = verifyTransaction(data, {
        type: 'cancel',
        params: {
          offer_hash: fakeOrderHash,
        },
      });

      expect(verification.valid).toBe(true);
    }, 30000);
  });

  describe('Destroy', () => {
    it('should compose and unpack a destroy', async () => {
      const result = await composeTransaction('destroy', {
        source: TEST_SOURCE,
        asset: 'XCP',
        quantity: 10000000, // 0.1 XCP
        tag: 'test burn',
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      expect(unpacked.messageTypeId).toBe(MessageTypeId.DESTROY);
      expect(unpacked.data).toMatchObject({
        asset: 'XCP',
        quantity: 10000000n,
      });

      // Verify
      const verification = verifyTransaction(data, {
        type: 'destroy',
        params: {
          asset: 'XCP',
          quantity: 10000000,
        },
      });

      expect(verification.valid).toBe(true);
    }, 30000);
  });

  describe('Sweep', () => {
    it('should compose and unpack a sweep', async () => {
      const result = await composeTransaction('sweep', {
        source: TEST_SOURCE,
        destination: TEST_DEST,
        flags: 3, // BALANCES | OWNERSHIP
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      expect(unpacked.messageTypeId).toBe(MessageTypeId.SWEEP);
      expect(unpacked.data).toMatchObject({
        destination: TEST_DEST,
        flags: 3,
        sweepBalances: true,
        sweepOwnership: true,
      });

      // Verify
      const verification = verifyTransaction(data, {
        type: 'sweep',
        params: {
          destination: TEST_DEST,
          flags: 3,
        },
      });

      expect(verification.valid).toBe(true);
    }, 30000);
  });

  describe('Issuance', () => {
    it('should compose and unpack an issuance', async () => {
      // Generate a random asset name to avoid conflicts
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const assetName = `TEST${randomSuffix}`;

      const result = await composeTransaction('issuance', {
        source: TEST_SOURCE,
        asset: assetName,
        quantity: 1000000000, // 10 units (divisible)
        divisible: true,
        description: 'Test asset',
      });

      if (!result) {
        console.log('Skipping test - API unavailable');
        return;
      }

      const data = getDataFromCompose(result);
      const unpacked = unpackCounterpartyMessage(data);

      expect(unpacked.success).toBe(true);
      // Could be ISSUANCE or SUBASSET_ISSUANCE depending on the asset
      expect([
        MessageTypeId.ISSUANCE,
        MessageTypeId.SUBASSET_ISSUANCE,
      ]).toContain(unpacked.messageTypeId);

      expect(unpacked.data).toMatchObject({
        quantity: 1000000000n,
        divisible: true,
      });
    }, 30000);
  });
});

describe('Contraexample Tests (Mocked)', () => {
  /**
   * These tests verify that we correctly detect tampered transactions
   * by manually constructing malicious payloads.
   */

  it('should detect when asset is changed to different asset', () => {
    // Construct a valid-looking enhanced send for PEPECASH
    // but verify it against a request for XCP
    const CNTRPRTY = '434e545250525459';
    const typeId = '02'; // enhanced send

    // Asset ID for a random asset (not XCP/BTC)
    const assetId = '00000000000186a0'; // Some random asset ID
    const quantity = '000000003b9aca00'; // 1 unit

    // Pack a destination address
    const destBytes = new Uint8Array(21);
    destBytes[0] = 0x00; // P2PKH version
    for (let i = 1; i < 21; i++) destBytes[i] = i;
    const destHex = Array.from(destBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const data = CNTRPRTY + typeId + assetId + quantity + destHex;

    // Verify against XCP request - should fail
    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 1000000000n,
        destination: '1111111111111111111114oLvT2', // Matches our packed address
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Asset mismatch'))).toBe(true);
  });

  it('should detect when quantity is increased', () => {
    const CNTRPRTY = '434e545250525459';
    const typeId = '02';
    const assetId = '0000000000000001'; // XCP
    const quantity = '0000000077359400'; // 2 billion (2 XCP) - MALICIOUS!

    const destBytes = new Uint8Array(21);
    destBytes[0] = 0x00;
    for (let i = 1; i < 21; i++) destBytes[i] = 0;
    const destHex = Array.from(destBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const data = CNTRPRTY + typeId + assetId + quantity + destHex;

    // User requested 1 XCP but malicious API returned 2 XCP
    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 1000000000n, // 1 XCP
        destination: '1111111111111111111114oLvT2',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Quantity mismatch'))).toBe(true);
    expect(result.errors[0]).toContain('expected 1000000000');
    expect(result.errors[0]).toContain('got 2000000000');
  });

  it('should detect when destination is changed', () => {
    const CNTRPRTY = '434e545250525459';
    const typeId = '02';
    const assetId = '0000000000000001'; // XCP
    const quantity = '000000003b9aca00'; // 1 XCP

    // Attacker's address packed (all 0xff = different from expected)
    const attackerDest = 'ff'.repeat(21);

    const data = CNTRPRTY + typeId + assetId + quantity + attackerDest;

    // User expected to send to their address
    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 1000000000n,
        destination: '1111111111111111111114oLvT2', // NOT the attacker's address
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Destination mismatch'))).toBe(true);
  });

  it('should detect message type mismatch', () => {
    // Compose returns a dispenser but user requested a send
    const CNTRPRTY = '434e545250525459';
    const typeId = '0c'; // DISPENSER (12) instead of ENHANCED_SEND (2)

    // Build a valid dispenser payload
    const assetId = '0000000000000001';
    const giveQty = '000000003b9aca00';
    const escrowQty = '000000003b9aca00';
    const rate = '00000000000186a0';
    const status = '00';

    const data = CNTRPRTY + typeId + assetId + giveQty + escrowQty + rate + status;

    // User requested a send
    const result = verifyTransaction(data, {
      type: 'enhanced_send',
      params: {
        asset: 'XCP',
        quantity: 1000000000n,
        destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Message type mismatch'))).toBe(true);
  });

  it('should detect order with wrong expiration', () => {
    const CNTRPRTY = '434e545250525459';
    const typeId = '0a'; // ORDER (10)

    const giveAssetId = '0000000000000001'; // XCP
    const giveQuantity = '000000003b9aca00'; // 1 XCP
    const getAssetId = '0000000000000000'; // BTC
    const getQuantity = '0000000000989680'; // 0.1 BTC
    const expiration = '03e8'; // 1000 blocks - WRONG! User requested 100
    const feeRequired = '0000000000000000';

    const data = CNTRPRTY + typeId + giveAssetId + giveQuantity +
                 getAssetId + getQuantity + expiration + feeRequired;

    const result = verifyTransaction(data, {
      type: 'order',
      params: {
        give_asset: 'XCP',
        give_quantity: 1000000000n,
        get_asset: 'BTC',
        get_quantity: 10000000n,
        expiration: 100, // User requested 100, got 1000
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Expiration mismatch'))).toBe(true);
  });
});
