/**
 * Tests for Counterparty Transaction Decoding Utilities
 *
 * Tests decodeRawTransaction, fetchInputValues, decodeCounterpartyMessage,
 * describeCounterpartyMessage, hasCounterpartyPrefix, and enrichWithAssetInfo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decodeRawTransaction,
  fetchInputValues,
  decodeCounterpartyMessage,
  describeCounterpartyMessage,
  hasCounterpartyPrefix,
  COUNTERPARTY_PREFIX_HEX,
  type DecodedBitcoinTransaction,
  type UnpackedCounterpartyData,
} from '../transaction';
import { apiClient } from '@/utils/apiClient';
import { walletManager } from '@/utils/wallet/walletManager';

// Mock dependencies
vi.mock('@/utils/apiClient');
vi.mock('@/utils/wallet/walletManager', () => ({
  walletManager: {
    getSettings: vi.fn().mockReturnValue({
      counterpartyApiBase: 'https://api.counterparty.io',
    }),
  },
}));
vi.mock('../api', () => ({
  fetchAssetDetails: vi.fn().mockImplementation(async (asset: string) => {
    if (asset === 'BTC' || asset === 'XCP') return { divisible: true };
    if (asset === 'PEPECASH') return { divisible: false };
    return null;
  }),
}));

const mockedApiClient = vi.mocked(apiClient, true);
const mockedGetSettings = vi.mocked(walletManager.getSettings);

const mockApiBase = 'https://api.counterparty.io';

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetSettings.mockReturnValue({
    counterpartyApiBase: mockApiBase,
  } as any);
});

// ── hasCounterpartyPrefix ───────────────────────────────────────────

describe('hasCounterpartyPrefix', () => {
  it('returns true when data contains CNTRPRTY prefix', () => {
    expect(hasCounterpartyPrefix(COUNTERPARTY_PREFIX_HEX + '020000')).toBe(true);
  });

  it('returns true when prefix is embedded in data', () => {
    expect(hasCounterpartyPrefix('aabb' + COUNTERPARTY_PREFIX_HEX + 'ccdd')).toBe(true);
  });

  it('returns false for data without prefix', () => {
    expect(hasCounterpartyPrefix('deadbeef0102030405060708')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasCounterpartyPrefix('')).toBe(false);
  });

  it('returns false for partial prefix', () => {
    expect(hasCounterpartyPrefix('434e54525052')).toBe(false);
  });
});

// ── describeCounterpartyMessage ─────────────────────────────────────

describe('describeCounterpartyMessage', () => {
  it('describes enhanced_send', () => {
    const desc = describeCounterpartyMessage('enhanced_send', {
      quantity: 100000000,
      asset: 'XCP',
      destination: 'bc1qtest',
    });
    expect(desc).toContain('Send');
    expect(desc).toContain('XCP');
    expect(desc).toContain('bc1qtest');
  });

  it('describes send (legacy)', () => {
    const desc = describeCounterpartyMessage('send', {
      quantity: 50000,
      asset: 'PEPECASH',
      destination: '1Abc',
    });
    expect(desc).toContain('Send');
    expect(desc).toContain('PEPECASH');
  });

  it('describes order with give/get assets', () => {
    const desc = describeCounterpartyMessage('order', {
      give_quantity: 100000000,
      give_asset: 'XCP',
      get_quantity: 50000,
      get_asset: 'BTC',
    });
    expect(desc).toContain('DEX Order');
    expect(desc).toContain('XCP');
    expect(desc).toContain('BTC');
  });

  it('describes dispenser', () => {
    const desc = describeCounterpartyMessage('dispenser', {
      give_quantity: 1000,
      asset: 'PEPECASH',
      mainchainrate: 10000,
    });
    expect(desc).toContain('Dispenser');
    expect(desc).toContain('PEPECASH');
  });

  it('describes issuance', () => {
    const desc = describeCounterpartyMessage('issuance', {
      asset: 'MYTOKEN',
      quantity: 1000000,
    });
    expect(desc).toContain('Issue Asset');
    expect(desc).toContain('MYTOKEN');
  });

  it('describes dividend', () => {
    const desc = describeCounterpartyMessage('dividend', {
      quantity_per_unit: 100,
      dividend_asset: 'XCP',
      asset: 'PEPECASH',
    });
    expect(desc).toContain('Dividend');
    expect(desc).toContain('XCP');
    expect(desc).toContain('PEPECASH');
  });

  it('describes cancel', () => {
    const desc = describeCounterpartyMessage('cancel', {
      offer_hash: 'abc123',
    });
    expect(desc).toContain('Cancel');
    expect(desc).toContain('abc123');
  });

  it('describes btcpay', () => {
    const desc = describeCounterpartyMessage('btcpay', {});
    expect(desc).toContain('BTC Pay');
  });

  it('describes sweep', () => {
    const desc = describeCounterpartyMessage('sweep', {
      destination: 'bc1qsweep',
    });
    expect(desc).toContain('Sweep');
    expect(desc).toContain('bc1qsweep');
  });

  it('describes broadcast', () => {
    const desc = describeCounterpartyMessage('broadcast', {
      text: 'Hello World',
    });
    expect(desc).toContain('Broadcast');
    expect(desc).toContain('Hello World');
  });

  it('describes fairminter', () => {
    const desc = describeCounterpartyMessage('fairminter', {
      asset: 'FAIRTOKEN',
    });
    expect(desc).toContain('Fairminter');
    expect(desc).toContain('FAIRTOKEN');
  });

  it('describes fairmint', () => {
    const desc = describeCounterpartyMessage('fairmint', {
      asset: 'FAIRTOKEN',
    });
    expect(desc).toContain('Mint');
    expect(desc).toContain('FAIRTOKEN');
  });

  it('describes attach', () => {
    const desc = describeCounterpartyMessage('attach', {
      quantity: 500,
      asset: 'PEPECASH',
    });
    expect(desc).toContain('Attach');
    expect(desc).toContain('PEPECASH');
  });

  it('describes detach', () => {
    const desc = describeCounterpartyMessage('detach', {});
    expect(desc).toContain('Detach');
  });

  it('describes destroy', () => {
    const desc = describeCounterpartyMessage('destroy', {
      quantity: 100,
      asset: 'XCP',
    });
    expect(desc).toContain('Destroy');
    expect(desc).toContain('XCP');
  });

  it('describes utxo_move', () => {
    const desc = describeCounterpartyMessage('utxo_move', {
      destination: 'bc1qdest',
    });
    expect(desc).toContain('Move UTXO');
    expect(desc).toContain('bc1qdest');
  });

  it('handles unknown message type', () => {
    const desc = describeCounterpartyMessage('unknown_type', {});
    expect(desc).toContain('Counterparty');
    expect(desc).toContain('unknown_type');
  });

  it('uses _normalized quantity when available', () => {
    const desc = describeCounterpartyMessage('enhanced_send', {
      quantity: 100000000,
      quantity_normalized: '1.00000000',
      asset: 'XCP',
      destination: 'bc1q',
    });
    expect(desc).toContain('1.00000000');
  });

  it('normalizes quantity using asset_info divisibility', () => {
    const desc = describeCounterpartyMessage('enhanced_send', {
      quantity: 100000000,
      asset: 'XCP',
      asset_info: { divisible: true },
      destination: 'bc1q',
    });
    // fromSatoshis(100000000) = "1.00000000"
    expect(desc).toContain('1');
  });

  it('handles broadcast with no text', () => {
    const desc = describeCounterpartyMessage('broadcast', {});
    expect(desc).toContain('Broadcast');
    expect(desc).toContain('message');
  });
});

// ── decodeRawTransaction ────────────────────────────────────────────

describe('decodeRawTransaction', () => {
  const mockDecodedTx: DecodedBitcoinTransaction = {
    txid: 'abc123',
    vin: [{ txid: 'input1', vout: 0 }],
    vout: [{
      value: 0.001,
      n: 0,
      scriptPubKey: { asm: 'OP_DUP', hex: '76a914...88ac', address: 'bc1qtest', type: 'pubkeyhash' },
    }],
  };

  it('returns decoded transaction on success', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: { result: mockDecodedTx },
    } as any);

    const result = await decodeRawTransaction('0200000001...');
    expect(result).toEqual(mockDecodedTx);
    expect(mockedApiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/v2/bitcoin/transactions/decode'),
      expect.any(Object)
    );
  });

  it('passes rawtx and verbose params', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: { result: mockDecodedTx },
    } as any);

    await decodeRawTransaction('deadbeef', false);
    const callUrl = mockedApiClient.get.mock.calls[0][0];
    expect(callUrl).toContain('rawtx=deadbeef');
    expect(callUrl).toContain('verbose=false');
  });

  it('throws on non-200 status', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 500,
      data: null,
    } as any);

    await expect(decodeRawTransaction('bad')).rejects.toThrow('Failed to decode transaction');
  });

  it('throws when result is missing', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: {},
    } as any);

    await expect(decodeRawTransaction('bad')).rejects.toThrow('Failed to decode transaction');
  });

  it('uses counterpartyApiBase from settings', async () => {
    mockedGetSettings.mockReturnValue({
      counterpartyApiBase: 'https://custom-api.example.com',
    } as any);

    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: { result: mockDecodedTx },
    } as any);

    await decodeRawTransaction('0200');
    const callUrl = mockedApiClient.get.mock.calls[0][0];
    expect(callUrl).toContain('https://custom-api.example.com/v2/bitcoin/transactions/decode');
  });

  it('defaults API base when setting is empty', async () => {
    mockedGetSettings.mockReturnValue({} as any);

    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: { result: mockDecodedTx },
    } as any);

    await decodeRawTransaction('0200');
    const callUrl = mockedApiClient.get.mock.calls[0][0];
    expect(callUrl).toContain('https://api.counterparty.io/v2/bitcoin/transactions/decode');
  });
});

// ── fetchInputValues ────────────────────────────────────────────────

describe('fetchInputValues', () => {
  it('returns map of txid:vout to satoshi values', async () => {
    mockedApiClient.get.mockResolvedValue({
      status: 200,
      data: {
        vout: [{ value: 50000 }, { value: 100000 }],
      },
    } as any);

    const inputs = [
      { txid: 'tx1', vout: 0 },
      { txid: 'tx1', vout: 1 },
    ];

    const result = await fetchInputValues(inputs);
    expect(result.get('tx1:0')).toBe(50000);
    expect(result.get('tx1:1')).toBe(100000);
  });

  it('deduplicates API calls for same txid', async () => {
    mockedApiClient.get.mockResolvedValue({
      status: 200,
      data: {
        vout: [{ value: 1000 }, { value: 2000 }],
      },
    } as any);

    const inputs = [
      { txid: 'same_tx', vout: 0 },
      { txid: 'same_tx', vout: 1 },
    ];

    await fetchInputValues(inputs);
    // Should only call once since both inputs share the same txid
    // (calls mempool.space, succeeds, skips blockstream fallback)
    expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to blockstream when mempool fails', async () => {
    let callCount = 0;
    mockedApiClient.get.mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('mempool.space')) {
        throw new Error('mempool down');
      }
      return {
        status: 200,
        data: { vout: [{ value: 12345 }] },
      } as any;
    });

    const result = await fetchInputValues([{ txid: 'tx1', vout: 0 }]);
    expect(result.get('tx1:0')).toBe(12345);
    // Called mempool (failed) + blockstream (succeeded)
    expect(callCount).toBe(2);
  });

  it('returns empty map when all endpoints fail', async () => {
    mockedApiClient.get.mockRejectedValue(new Error('all down'));

    const result = await fetchInputValues([{ txid: 'tx1', vout: 0 }]);
    expect(result.size).toBe(0);
  });

  it('handles multiple different txids in parallel', async () => {
    mockedApiClient.get.mockImplementation(async (url: string) => {
      if (url.includes('txA')) {
        return { status: 200, data: { vout: [{ value: 111 }] } } as any;
      }
      if (url.includes('txB')) {
        return { status: 200, data: { vout: [{ value: 222 }] } } as any;
      }
      throw new Error('unknown');
    });

    const result = await fetchInputValues([
      { txid: 'txA', vout: 0 },
      { txid: 'txB', vout: 0 },
    ]);
    expect(result.get('txA:0')).toBe(111);
    expect(result.get('txB:0')).toBe(222);
  });

  it('returns empty map for empty inputs', async () => {
    const result = await fetchInputValues([]);
    expect(result.size).toBe(0);
    expect(mockedApiClient.get).not.toHaveBeenCalled();
  });
});

// ── decodeCounterpartyMessage ───────────────────────────────────────

describe('decodeCounterpartyMessage', () => {
  const mockUnpackResult: UnpackedCounterpartyData = {
    message_type: 'enhanced_send',
    message_type_id: 2,
    message_data: {
      asset: 'XCP',
      quantity: 100000000,
      destination: 'bc1qtest',
    },
  };

  it('returns decoded message with description', async () => {
    // Mock the unpack API call
    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: { result: mockUnpackResult },
    } as any);

    const result = await decodeCounterpartyMessage(COUNTERPARTY_PREFIX_HEX + '020000');

    expect(result).not.toBeNull();
    expect(result!.messageType).toBe('enhanced_send');
    expect(result!.messageTypeId).toBe(2);
    expect(result!.description).toContain('Send');
    expect(result!.description).toContain('XCP');
  });

  it('returns null when unpack API fails', async () => {
    mockedApiClient.get.mockRejectedValueOnce(new Error('API error'));

    const result = await decodeCounterpartyMessage('deadbeef');
    expect(result).toBeNull();
  });

  it('returns null when unpack returns error in message_data', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: {
        result: {
          message_type: 'unknown',
          message_type_id: 999,
          message_data: { error: 'Invalid data' },
        },
      },
    } as any);

    const result = await decodeCounterpartyMessage('baddata');
    expect(result).toBeNull();
  });

  it('returns null on non-200 response', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 500,
      data: null,
    } as any);

    const result = await decodeCounterpartyMessage('data');
    expect(result).toBeNull();
  });

  it('enriches BTC/XCP with divisibility info', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      status: 200,
      data: {
        result: {
          message_type: 'order',
          message_type_id: 10,
          message_data: {
            give_asset: 'XCP',
            give_quantity: 100000000,
            get_asset: 'BTC',
            get_quantity: 50000,
          },
        },
      },
    } as any);

    const result = await decodeCounterpartyMessage(COUNTERPARTY_PREFIX_HEX);

    expect(result).not.toBeNull();
    // BTC and XCP should get asset_info injected
    expect(result!.messageData.give_asset_info).toEqual({ divisible: true });
    expect(result!.messageData.get_asset_info).toEqual({ divisible: true });
  });
});
