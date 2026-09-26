import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import {
  clearBitcoinCaches, 
  fetchBitcoinTransaction,
  fetchPreviousRawTransaction,
  fetchUTXOs,
  formatInputsSet,
  getUtxoByTxid,
  type UTXO
} from '@/core/bitcoin/utxo';
import { getActiveSettings } from '@/core/settings';

vi.mock('@/core/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/api/client')>();
  return {
    ...actual,
    apiClient: { get: vi.fn(), post: vi.fn() },
  };
});
vi.mock('@/core/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: vi.fn().mockReturnValue({
    counterpartyApiBase: 'https://api.counterparty.io',
  }),
}));

const mockApiClient = vi.mocked(apiClient, true);
const mockGetSettings = vi.mocked(getActiveSettings);

/** Helper to create a mock apiClient response */
function mockApiResponse<T>(data: T) {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

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
    mockApiClient.get.mockReset();
    // Clear all caches to ensure test isolation
    clearBitcoinCaches();

    // Setup the settings mock
    mockGetSettings.mockReturnValue({
      counterpartyApiBase: 'https://api.counterparty.io',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUTXOs', () => {
    // API response format from mempool.space - direct array
    const mockApiUtxo = {
      txid: mockTxid,
      vout: 0,
      value: 100000,
      status: {
        confirmed: true,
        block_height: 850000,
        block_hash: 'block-hash-123',
        block_time: 1640995200
      }
    };

    it('should fetch UTXOs successfully', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse([mockApiUtxo]));

      const result = await fetchUTXOs(mockAddress);

      // Result should match the API response format
      expect(result).toHaveLength(1);
      expect(result[0]!.txid).toBe(mockTxid);
      expect(result[0]!.vout).toBe(0);
      expect(result[0]!.value).toBe(100000);
      expect(result[0]!.status.confirmed).toBe(true);
      expect(result[0]!.status.block_height).toBe(850000);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://mempool.space/api/address/${mockAddress}/utxo`,
        { retries: 0, signal: undefined }
      );
    });

    it('should fetch UTXOs with AbortSignal', async () => {
      const abortController = new AbortController();
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse([mockApiUtxo]));

      const result = await fetchUTXOs(mockAddress, abortController.signal);

      expect(result).toHaveLength(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://mempool.space/api/address/${mockAddress}/utxo`,
        { retries: 0, signal: abortController.signal }
      );
    });

    it('should return empty array when no UTXOs found', async () => {
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse([]));

      const result = await fetchUTXOs(mockAddress);

      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should handle HTTP error responses', async () => {
      // apiClient.get throws on non-ok HTTP responses
      mockApiClient.get.mockRejectedValue(new Error('HTTP 500'));

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should re-throw cancellation errors', async () => {
      const cancelError = new DOMException('Request cancelled', 'AbortError');
      mockApiClient.get.mockRejectedValue(cancelError);

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Request cancelled');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
      mockApiClient.get.mockRejectedValue(timeoutError);

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should handle malformed response data', async () => {
      // Both endpoints return non-array data
      mockApiClient.get.mockResolvedValue(mockApiResponse(null));

      await expect(fetchUTXOs(mockAddress)).rejects.toThrow('Failed to fetch UTXOs.');
    });

    it('should handle multiple UTXOs', async () => {
      const confirmedStatus = { confirmed: true, block_height: 850000, block_hash: 'hash', block_time: 1640995200 };
      const apiUtxos = [
        { txid: mockTxid, vout: 0, value: 100000, status: confirmedStatus },
        { txid: mockTxid, vout: 1, value: 100000, status: confirmedStatus },
        { txid: mockTxid, vout: 2, value: 200000, status: confirmedStatus }
      ];
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse(apiUtxos));

      const result = await fetchUTXOs(mockAddress);

      expect(result).toHaveLength(3);
      expect(result[0]!.vout).toBe(0);
      expect(result[1]!.vout).toBe(1);
      expect(result[2]!.vout).toBe(2);
      expect(result[2]!.value).toBe(200000);
    });

    it('should handle UTXOs with different confirmation statuses', async () => {
      const confirmedStatus = { confirmed: true, block_height: 850000, block_hash: 'hash', block_time: 1640995200 };
      const unconfirmedStatus = { confirmed: false, block_height: 0, block_hash: '', block_time: 0 };
      const apiUtxos = [
        { txid: mockTxid, vout: 0, value: 100000, status: confirmedStatus },
        { txid: mockTxid, vout: 1, value: 100000, status: unconfirmedStatus }
      ];
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse(apiUtxos));

      const result = await fetchUTXOs(mockAddress);

      expect(result[0]!.status.confirmed).toBe(true);
      expect(result[1]!.status.confirmed).toBe(false);
    });

    it('should handle very large UTXO values', async () => {
      const confirmedStatus = { confirmed: true, block_height: 850000, block_hash: 'hash', block_time: 1640995200 };
      const apiUtxos = [{ txid: mockTxid, vout: 0, value: 2100000000000000, status: confirmedStatus }];
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse(apiUtxos));

      const result = await fetchUTXOs(mockAddress);

      expect(result[0]!.value).toBe(2100000000000000);
    });

    it('should handle zero-value UTXOs', async () => {
      const confirmedStatus = { confirmed: true, block_height: 850000, block_hash: 'hash', block_time: 1640995200 };
      const apiUtxos = [{ txid: mockTxid, vout: 0, value: 0, status: confirmedStatus }];
      mockApiClient.get.mockResolvedValueOnce(mockApiResponse(apiUtxos));

      const result = await fetchUTXOs(mockAddress);

      expect(result[0]!.value).toBe(0);
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

    /** Answer by host, since the Counterparty leg is paced and so is not called synchronously. */
    function route(answers: { mempool?: () => unknown; counterparty?: () => unknown }) {
      mockApiClient.get.mockImplementation(async (url: string) => {
        const answer = new URL(url).hostname === 'mempool.space' ? answers.mempool : answers.counterparty;
        if (!answer) throw new Error(`unexpected request: ${url}`);
        return mockApiResponse(await answer()) as any;
      });
    }
    const fails = () => { throw new Error('Network error'); };

    it('asks mempool.space first and does not touch the Counterparty node when it answers', async () => {
      route({ mempool: () => `${mockRawHex}
` });

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBe(mockRawHex);
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://mempool.space/api/tx/${mockTxid}/hex`,
        { retries: 0 }
      );
    });

    it('falls back to the Counterparty API when mempool.space fails', async () => {
      route({ mempool: fails, counterparty: () => ({ result: { hex: mockRawHex } }) });

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBe(mockRawHex);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://api.counterparty.io/v2/bitcoin/transactions/${mockTxid}`,
        { retries: 1 }
      );
    });

    it('falls back when mempool.space answers something that is not hex', async () => {
      route({ mempool: () => 'Transaction not found', counterparty: () => ({ result: { hex: mockRawHex } }) });

      await expect(fetchPreviousRawTransaction(mockTxid)).resolves.toBe(mockRawHex);
    });

    it.each([
      ['a null result', { result: null }],
      ['no hex field', { result: { no_hex_field: 'data' } }],
      ['malformed data', null],
      ['an undefined result', { result: undefined }],
      ['a null hex', { result: { hex: null } }],
      ['an undefined hex', { result: { hex: undefined } }],
    ])('returns null when mempool.space is empty and the node answers with %s', async (_name, answer) => {
      route({ mempool: () => '', counterparty: () => answer });

      await expect(fetchPreviousRawTransaction(mockTxid)).resolves.toBeNull();
    });

    it('should return null when all sources fail', async () => {
      route({ mempool: fails, counterparty: fails });

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBeNull();
    });

    it('should use custom counterparty API base URL', async () => {
      mockGetSettings.mockReturnValueOnce({
        counterpartyApiBase: 'https://custom.api.com'
      } as any);
      mockApiClient.get.mockImplementation(async (url: string) => {
        if (url.startsWith('https://mempool.space/')) throw new Error('down');
        return mockApiResponse({ result: { hex: mockRawHex } }) as any;
      });

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBe(mockRawHex);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `https://custom.api.com/v2/bitcoin/transactions/${mockTxid}`,
        { retries: 1 }
      );
    });

    it('should handle very long transaction hex', async () => {
      const longHex = 'a'.repeat(10000);
      route({ mempool: () => longHex });

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBe(longHex);
    });

    it('should handle response with extra fields', async () => {
      route({
        mempool: fails,
        counterparty: () => ({
          result: { hex: mockRawHex, extra_field: 'extra_data', another_field: 123 },
          extra_top_level: 'data',
        }),
      });

      const result = await fetchPreviousRawTransaction(mockTxid);

      expect(result).toBe(mockRawHex);
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

  describe('fetchBitcoinTransaction', () => {
    const mockBtcTx = {
      hex: '0200000001...',
      txid: mockTxid,
      version: 2,
      locktime: 0,
      size: 225,
      vsize: 141,
      weight: 561,
      vin: [{ txid: 'input-txid', vout: 0, sequence: 0xffffffff }],
      vout: [{ value: 0.001, n: 0, scriptPubKey: { asm: '', hex: '', type: 'witness_v0_keyhash', address: 'bc1qtest' } }],
    };

    const mockStatus = {
      confirmed: true,
      block_height: 850000,
      block_hash: 'block-hash',
      block_time: 1700000000,
    };

    beforeEach(() => {
      clearBitcoinCaches();
    });

    /**
     * The Counterparty leg is paced, so it is not called before the mempool leg: answer by host,
     * each host from its own queue, rather than by call order.
     */
    const queues = { counterparty: [] as Array<() => unknown>, mempool: [] as Array<() => unknown> };
    const counterpartyAnswers = (answer: () => unknown) => { queues.counterparty.push(answer); };
    const mempoolAnswers = (answer: () => unknown) => { queues.mempool.push(answer); };
    beforeEach(() => {
      queues.counterparty.length = 0;
      queues.mempool.length = 0;
      mockApiClient.get.mockImplementation(async (url: string) => {
        const queue = new URL(url).hostname === 'mempool.space' ? queues.mempool : queues.counterparty;
        const answer = queue.shift();
        if (!answer) throw new Error(`unexpected request: ${url}`);
        return mockApiResponse(await answer()) as any;
      });
    });
    const ok = (data: unknown) => () => data;
    const fail = (message: string) => () => { throw new Error(message); };

    it('returns transaction with status from parallel fetches', async () => {
      // Counterparty API call
      counterpartyAnswers(ok({ result: { ...mockBtcTx } }));
      // Mempool status call
      mempoolAnswers(ok(mockStatus));

      const result = await fetchBitcoinTransaction(mockTxid);
      expect(result).not.toBeNull();
      expect(result!.txid).toBe(mockTxid);
      expect(result!.status).toEqual(mockStatus);
      expect(result!.blocktime).toBe(1700000000);
    });

    it('returns transaction without status when mempool fails', async () => {
      // Counterparty API call
      counterpartyAnswers(ok({ result: { ...mockBtcTx } }));
      // Mempool status call fails
      mempoolAnswers(fail('mempool down'));

      const result = await fetchBitcoinTransaction(mockTxid);
      expect(result).not.toBeNull();
      expect(result!.txid).toBe(mockTxid);
      // Status not set since mempool failed (catch returns null)
      expect(result!.status).toBeUndefined();
    });

    it('returns null when counterparty API fails', async () => {
      // Both calls are in Promise.all, but the outer try/catch handles the error
      counterpartyAnswers(fail('API error'));
      // Mempool call would also happen but Promise.all rejects on first failure
      mempoolAnswers(ok(mockStatus));

      const result = await fetchBitcoinTransaction(mockTxid);
      expect(result).toBeNull();
    });

    it('returns null when counterparty API returns no result', async () => {
      // Counterparty returns empty data
      counterpartyAnswers(ok({}));
      // Mempool status call
      mempoolAnswers(ok(mockStatus));

      const result = await fetchBitcoinTransaction(mockTxid);
      expect(result).toBeNull();
    });

    it('uses settings for API base URL', async () => {
      mockGetSettings.mockReturnValue({
        counterpartyApiBase: 'https://custom-api.example.com',
      } as any);

      // Counterparty API call
      counterpartyAnswers(ok({ result: { ...mockBtcTx } }));
      // Mempool status call
      mempoolAnswers(ok(mockStatus));

      await fetchBitcoinTransaction(mockTxid);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('https://custom-api.example.com/v2/bitcoin/transactions/'),
        { retries: 1 }
      );
    });

    it('caches results and returns cached value on second call', async () => {
      // Counterparty API call
      counterpartyAnswers(ok({ result: { ...mockBtcTx } }));
      // Mempool status call
      mempoolAnswers(ok(mockStatus));

      const result1 = await fetchBitcoinTransaction(mockTxid);
      const result2 = await fetchBitcoinTransaction(mockTxid);

      expect(result1).toEqual(result2);
      // Two API calls on first fetch (counterparty + mempool), none on second (cached)
      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
    });

    it('does not cache null results', async () => {
      // First attempt: Counterparty fails, mempool succeeds but doesn't matter
      counterpartyAnswers(fail('fail'));
      mempoolAnswers(ok(mockStatus));

      const result1 = await fetchBitcoinTransaction(mockTxid);
      expect(result1).toBeNull();

      // Second call should retry since null wasn't cached
      counterpartyAnswers(ok({ result: { ...mockBtcTx } }));
      mempoolAnswers(ok(mockStatus));

      const result2 = await fetchBitcoinTransaction(mockTxid);
      expect(result2).not.toBeNull();
      // 4 total calls: 2 per attempt (counterparty + mempool) x 2 attempts
      expect(mockApiClient.get).toHaveBeenCalledTimes(4);
    });
  });
});
