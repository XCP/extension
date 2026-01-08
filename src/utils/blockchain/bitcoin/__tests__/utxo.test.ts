import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UTXO,
  fetchUTXOs,
  formatInputsSet,
  getUtxoByTxid,
  fetchPreviousRawTransaction
} from '@/utils/blockchain/bitcoin/utxo';
import axios from 'axios';
import { apiClient } from '@/utils/axios';

vi.mock('axios');
vi.mock('@/utils/axios');
vi.mock('@/utils/storage/settingsStorage');

const mockAxios = axios as any;
const mockApiClient = vi.mocked(apiClient, true);
const mockGetSettings = vi.fn();

describe('UTXO Utilities', () => {
  const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const mockTxid = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';
  const mockUtxo: UTXO = {
    txid: mockTxid,
    vout: 0,
    status: {
      confirmed: true,
      block_height: 850000,
      block_hash: 'block-hash-123',
      block_time: 1640995200
    },
    value: 100000
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup the settings mock
    mockGetSettings.mockResolvedValue({
      counterpartyApiBase: 'https://api.counterparty.io'
    });
    
    // Re-import the module to apply the mock
    const { getSettings } = await import('@/utils/storage/settingsStorage');
    vi.mocked(getSettings).mockImplementation(mockGetSettings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUTXOs', () => {
    it('should fetch UTXOs successfully', async () => {
      const mockUtxos = [mockUtxo];
      mockApiClient.get.mockResolvedValue({
        data: mockUtxos,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      
      expect(result).toEqual(mockUtxos);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://mempool.space/api/address/${mockAddress}/utxo`,
        { signal: undefined }
      );
    });

    it('should fetch UTXOs with AbortSignal', async () => {
      const mockUtxos = [mockUtxo];
      const abortController = new AbortController();
      mockApiClient.get.mockResolvedValue({
        data: mockUtxos,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress, abortController.signal);
      
      expect(result).toEqual(mockUtxos);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://mempool.space/api/address/${mockAddress}/utxo`,
        { signal: abortController.signal }
      );
    });

    it('should return empty array when no UTXOs found', async () => {
      mockApiClient.get.mockResolvedValue({
        data: [],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      
      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should handle HTTP error responses', async () => {
      mockApiClient.get.mockRejectedValue({
        response: { status: 404, data: 'Not found' }
      });

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should re-throw cancellation errors', async () => {
      const cancelError = new Error('Request cancelled');
      Object.defineProperty(cancelError, 'name', { value: 'AbortError' });
      mockAxios.isCancel.mockReturnValue(true);
      mockApiClient.get.mockRejectedValue(cancelError);

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Request cancelled');
      expect(mockAxios.isCancel).toHaveBeenCalledWith(cancelError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      mockAxios.isCancel.mockReturnValue(false);
      mockApiClient.get.mockRejectedValue(timeoutError);

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should handle malformed response data', async () => {
      mockApiClient.get.mockResolvedValue({
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      expect(result).toBe(null);
    });

    it('should handle multiple UTXOs', async () => {
      const mockUtxos = [
        { ...mockUtxo, vout: 0 },
        { ...mockUtxo, vout: 1 },
        { ...mockUtxo, vout: 2, value: 200000 }
      ];
      mockApiClient.get.mockResolvedValue({
        data: mockUtxos,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      
      expect(result).toEqual(mockUtxos);
      expect(result).toHaveLength(3);
    });

    it('should handle UTXOs with different statuses', async () => {
      const unconfirmedUtxo = {
        ...mockUtxo,
        status: {
          confirmed: false,
          block_height: -1,
          block_hash: '',
          block_time: 0
        }
      };
      const mockUtxos = [mockUtxo, unconfirmedUtxo];
      mockApiClient.get.mockResolvedValue({
        data: mockUtxos,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      
      expect(result).toEqual(mockUtxos);
      expect(result[0].status.confirmed).toBe(true);
      expect(result[1].status.confirmed).toBe(false);
    });

    it('should handle very large UTXO values', async () => {
      const largeUtxo = { ...mockUtxo, value: 2100000000000000 }; // 21M BTC in sats
      mockApiClient.get.mockResolvedValue({
        data: [largeUtxo],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      
      expect(result[0].value).toBe(2100000000000000);
    });

    it('should handle zero-value UTXOs', async () => {
      const zeroUtxo = { ...mockUtxo, value: 0 };
      mockApiClient.get.mockResolvedValue({
        data: [zeroUtxo],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchUTXOs(mockAddress);
      
      expect(result[0].value).toBe(0);
    });
  });

  describe('formatInputsSet', () => {
    it('should format single UTXO correctly', () => {
      const utxos = [mockUtxo];
      const result = formatInputsSet(utxos);
      
      expect(result).toBe(`${mockTxid}:0`);
    });

    it('should format multiple UTXOs correctly', () => {
      const utxos = [
        { ...mockUtxo, vout: 0 },
        { ...mockUtxo, vout: 1 },
        { ...mockUtxo, txid: 'different-txid', vout: 2 }
      ];
      const result = formatInputsSet(utxos);
      
      expect(result).toBe(`${mockTxid}:0,${mockTxid}:1,different-txid:2`);
    });

    it('should handle empty UTXO array', () => {
      const result = formatInputsSet([]);
      
      expect(result).toBe('');
    });

    it('should handle UTXOs with large vout values', () => {
      const utxos = [{ ...mockUtxo, vout: 999999 }];
      const result = formatInputsSet(utxos);
      
      expect(result).toBe(`${mockTxid}:999999`);
    });

    it('should handle UTXOs with zero vout', () => {
      const utxos = [{ ...mockUtxo, vout: 0 }];
      const result = formatInputsSet(utxos);
      
      expect(result).toBe(`${mockTxid}:0`);
    });

    it('should maintain order of UTXOs', () => {
      const utxos = [
        { ...mockUtxo, txid: 'txid-c', vout: 2 },
        { ...mockUtxo, txid: 'txid-a', vout: 0 },
        { ...mockUtxo, txid: 'txid-b', vout: 1 }
      ];
      const result = formatInputsSet(utxos);
      
      expect(result).toBe('txid-c:2,txid-a:0,txid-b:1');
    });
  });

  describe('getUtxoByTxid', () => {
    const utxos = [
      { ...mockUtxo, txid: 'txid-1', vout: 0 },
      { ...mockUtxo, txid: 'txid-2', vout: 1 },
      { ...mockUtxo, txid: 'txid-1', vout: 2 }
    ];

    it('should find UTXO by txid and vout', () => {
      const result = getUtxoByTxid(utxos, 'txid-1', 0);
      
      expect(result).toEqual(utxos[0]);
    });

    it('should find UTXO with same txid but different vout', () => {
      const result = getUtxoByTxid(utxos, 'txid-1', 2);
      
      expect(result).toEqual(utxos[2]);
    });

    it('should return undefined when UTXO not found', () => {
      const result = getUtxoByTxid(utxos, 'non-existent-txid', 0);
      
      expect(result).toBeUndefined();
    });

    it('should return undefined when vout does not match', () => {
      const result = getUtxoByTxid(utxos, 'txid-1', 999);
      
      expect(result).toBeUndefined();
    });

    it('should handle empty UTXO array', () => {
      const result = getUtxoByTxid([], 'any-txid', 0);
      
      expect(result).toBeUndefined();
    });

    it('should handle exact string matching for txid', () => {
      const result = getUtxoByTxid(utxos, 'txid-1', 0);
      
      expect(result?.txid).toBe('txid-1');
      
      // Should not match partial strings
      const partialResult = getUtxoByTxid(utxos, 'txid', 0);
      expect(partialResult).toBeUndefined();
    });

    it('should handle case-sensitive txid matching', () => {
      const upperCaseTxid = 'ABCD1234';
      const lowerCaseTxid = 'abcd1234';
      const mixedUtxos = [
        { ...mockUtxo, txid: upperCaseTxid, vout: 0 },
        { ...mockUtxo, txid: lowerCaseTxid, vout: 1 }
      ];

      const upperResult = getUtxoByTxid(mixedUtxos, upperCaseTxid, 0);
      const lowerResult = getUtxoByTxid(mixedUtxos, lowerCaseTxid, 1);
      
      expect(upperResult?.txid).toBe(upperCaseTxid);
      expect(lowerResult?.txid).toBe(lowerCaseTxid);
      
      // Should not match different case
      const wrongCaseResult = getUtxoByTxid(mixedUtxos, lowerCaseTxid, 0);
      expect(wrongCaseResult).toBeUndefined();
    });

    it('should handle negative vout values', () => {
      const negativeVoutUtxos = [{ ...mockUtxo, vout: -1 }];
      const result = getUtxoByTxid(negativeVoutUtxos, mockTxid, -1);
      
      expect(result).toEqual(negativeVoutUtxos[0]);
    });
  });

  describe('fetchPreviousRawTransaction', () => {
    const mockRawHex = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff08044c86041b020602ffffffff0100f2052a010000004341041b0e8c2567c12536aa13357b79a073dc4444acb83c4ec7a0e2f99dd7457516c5817242da796924ca4e99947d087fedf9ce467cb9f7c6287078f801df276fdf84424ac00000000';

    it('should fetch raw transaction successfully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: mockRawHex } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBe(mockRawHex);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://api.counterparty.io/v2/bitcoin/transactions/${mockTxid}`
      );
    });

    it('should return null when transaction not found', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should return null when hex not present in response', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: { no_hex_field: 'data' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should return null when response data is malformed', async () => {
      mockApiClient.get.mockResolvedValue({
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should return null when result is undefined', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: undefined },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should handle HTTP error responses', async () => {
      mockApiClient.get.mockRejectedValue({
        response: { status: 404, data: 'Transaction not found' }
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      mockApiClient.get.mockRejectedValue(timeoutError);

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBeNull();
    });

    it('should use custom counterparty API base URL', async () => {
      // Override the mock for this specific test
      mockGetSettings.mockResolvedValueOnce({
        counterpartyApiBase: 'https://custom.api.com'
      });

      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: mockRawHex } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBe(mockRawHex);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://custom.api.com/v2/bitcoin/transactions/${mockTxid}`
      );
    });

    it('should handle empty hex field', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: '' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBe('');
    });

    it('should handle very long transaction hex', async () => {
      const longHex = 'a'.repeat(10000);
      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: longHex } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBe(longHex);
    });

    it('should handle special characters in txid', async () => {
      const specialTxid = 'abc-def_123';
      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: mockRawHex } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      await fetchPreviousRawTransaction(specialTxid);
      
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://api.counterparty.io/v2/bitcoin/transactions/${specialTxid}`
      );
    });

    it('should handle response with extra fields', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          result: {
            hex: mockRawHex,
            extra_field: 'extra_data',
            another_field: 123
          },
          extra_top_level: 'data'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBe(mockRawHex);
    });

    it('should handle null hex value', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: null } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });

    it('should handle undefined hex value', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { result: { hex: undefined } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as any);

      const result = await fetchPreviousRawTransaction(mockTxid);
      
      expect(result).toBeNull();
    });
  });

  describe('UTXO interface compliance', () => {
    it('should work with complete UTXO objects', () => {
      const completeUtxo: UTXO = {
        txid: mockTxid,
        vout: 0,
        status: {
          confirmed: true,
          block_height: 850000,
          block_hash: 'hash123',
          block_time: 1640995200
        },
        value: 100000
      };

      const formatted = formatInputsSet([completeUtxo]);
      expect(formatted).toBe(`${mockTxid}:0`);

      const found = getUtxoByTxid([completeUtxo], mockTxid, 0);
      expect(found).toEqual(completeUtxo);
    });

    it('should handle various numeric types for vout and value', () => {
      const utxos: UTXO[] = [
        { ...mockUtxo, vout: 0, value: 0 },
        { ...mockUtxo, vout: 1, value: 1 },
        { ...mockUtxo, vout: 999, value: 999999999 }
      ];

      utxos.forEach((utxo, index) => {
        const found = getUtxoByTxid(utxos, mockTxid, utxo.vout);
        expect(found).toEqual(utxo);
      });
    });
  });
});