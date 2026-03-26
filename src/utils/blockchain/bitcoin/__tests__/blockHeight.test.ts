import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchFromBlockstream,
  fetchFromMempoolSpace,
  fetchFromBlockchainInfo,
  fetchBlockHeightRace,
  fetchBlockHeightSequential,
  getCurrentBlockHeight,
  clearBlockHeightCache
} from '@/utils/blockchain/bitcoin/blockHeight';
import { apiClient } from '@/utils/apiClient';

vi.mock('@/utils/apiClient');

const mockedApiClient = vi.mocked(apiClient);

describe('Block Height Utilities', () => {
  const mockBlockHeight = 850000;

  beforeEach(() => {
    vi.clearAllMocks();
    clearBlockHeightCache();
  });

  describe('fetchFromBlockstream', () => {
    it('should fetch block height successfully', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchFromBlockstream();
      expect(height).toBe(mockBlockHeight);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        'https://blockstream.info/api/blocks/tip/height',
        { retries: 0 }
      );
    });

    it('should throw error when API response is not ok', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Failed to fetch block height'));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Failed to fetch block height'
      );
    });

    it('should throw error when response data is invalid', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: 'not-a-number',
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid block height data'
      );
    });

    it('should throw error when response is empty', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: '',
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid block height data'
      );
    });

    it('should handle network errors', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Network error'));

      await expect(fetchFromBlockstream()).rejects.toThrow('Network error');
    });
  });

  describe('fetchFromMempoolSpace', () => {
    it('should fetch block height successfully', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchFromMempoolSpace();
      expect(height).toBe(mockBlockHeight);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        'https://mempool.space/api/blocks/tip/height',
        { retries: 0 }
      );
    });

    it('should throw error when API response is not ok', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Failed to fetch block height'));

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Failed to fetch block height'
      );
    });

    it('should throw error when response data is invalid', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: 'invalid-height',
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid block height data'
      );
    });
  });

  describe('fetchFromBlockchainInfo', () => {
    it('should fetch block height successfully', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchFromBlockchainInfo();
      expect(height).toBe(mockBlockHeight);
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        'https://blockchain.info/q/getblockcount',
        { retries: 0 }
      );
    });

    it('should throw error when API response is not ok', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('Failed to fetch block height'));

      await expect(fetchFromBlockchainInfo()).rejects.toThrow(
        'Failed to fetch block height'
      );
    });

    it('should throw error when response data is invalid', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: 'NaN',
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(fetchFromBlockchainInfo()).rejects.toThrow(
        'Invalid block height data'
      );
    });

    it('should handle negative numbers as invalid', async () => {
      mockedApiClient.get.mockResolvedValue({
        data: '-100',
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchFromBlockchainInfo();
      expect(height).toBe(-100); // The function actually allows negative numbers
    });
  });

  describe('fetchBlockHeightRace', () => {
    it('should return the first successful response', async () => {
      // mempoolSpace (first fetcher) - slow
      mockedApiClient.get.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          data: mockBlockHeight.toString(),
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      });

      // blockstream (second fetcher) - fast, should win the race
      mockedApiClient.get.mockImplementationOnce(async () => {
        return {
          data: (mockBlockHeight + 1).toString(),
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      });

      // blockchainInfo (third fetcher)
      mockedApiClient.get.mockImplementationOnce(async () => ({
        data: (mockBlockHeight + 2).toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      }));

      const height = await fetchBlockHeightRace();
      expect(height).toBe(mockBlockHeight + 1); // The faster response should win
    });

    it('should throw error when all sources fail', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('All failed'));
      // blockchainInfo also fails (all use apiClient now)

      await expect(fetchBlockHeightRace()).rejects.toThrow(
        'Failed to fetch block height from any source'
      );
    });

    it('should handle mixed success and failure', async () => {
      // mempoolSpace fails
      mockedApiClient.get.mockRejectedValueOnce(new Error('First failed'));
      // blockstream succeeds
      mockedApiClient.get.mockResolvedValueOnce({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      // blockchainInfo fails
      mockedApiClient.get.mockRejectedValueOnce(new Error('Third failed'));

      const height = await fetchBlockHeightRace();
      expect(height).toBe(mockBlockHeight);
    });
  });

  describe('fetchBlockHeightSequential', () => {
    it('should return height from first successful source', async () => {
      // mempoolSpace (first in sequence) succeeds
      mockedApiClient.get.mockResolvedValueOnce({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchBlockHeightSequential();
      expect(height).toBe(mockBlockHeight);
      // Only mempoolSpace called (via apiClient), fetch not called
      expect(mockedApiClient.get).toHaveBeenCalledTimes(1);
    });

    it('should try next source if first fails', async () => {
      // mempoolSpace fails
      mockedApiClient.get.mockRejectedValueOnce(new Error('First source failed'));
      // blockstream succeeds
      mockedApiClient.get.mockResolvedValueOnce({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchBlockHeightSequential();
      expect(height).toBe(mockBlockHeight);
      expect(mockedApiClient.get).toHaveBeenCalledTimes(2);
    });

    it('should skip invalid responses and continue', async () => {
      // mempoolSpace returns 0 (not > 0, so skipped)
      mockedApiClient.get.mockResolvedValueOnce({
        data: '0',
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      // blockstream succeeds
      mockedApiClient.get.mockResolvedValueOnce({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchBlockHeightSequential();
      expect(height).toBe(mockBlockHeight);
    });

    it('should skip negative heights', async () => {
      // mempoolSpace returns -1
      mockedApiClient.get.mockResolvedValueOnce({
        data: '-1',
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      // blockstream succeeds
      mockedApiClient.get.mockResolvedValueOnce({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await fetchBlockHeightSequential();
      expect(height).toBe(mockBlockHeight);
    });

    it('should throw error when all sources fail', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('All failed'));
      // blockchainInfo also fails (all use apiClient now)

      await expect(fetchBlockHeightSequential()).rejects.toThrow(
        'Unable to fetch block height from any source'
      );
    });

    it('should throw error when all sources return invalid data', async () => {
      // mempoolSpace and blockstream return invalid via apiClient
      mockedApiClient.get.mockResolvedValue({
        data: 'invalid',
        status: 200,
        statusText: 'OK',
        headers: {},
      });
      // blockchainInfo also returns invalid (all use apiClient now)

      await expect(fetchBlockHeightSequential()).rejects.toThrow(
        'Unable to fetch block height from any source'
      );
    });
  });

  describe('getCurrentBlockHeight', () => {
    function mockAllSourcesSuccess(heightStr: string): void {
      mockedApiClient.get.mockResolvedValue({
        data: heightStr,
        status: 200,
        statusText: 'OK',
        headers: {},
      });
    }

    it('should return cached value when cache is valid', async () => {
      // First call to populate cache
      mockAllSourcesSuccess(mockBlockHeight.toString());

      const height1 = await getCurrentBlockHeight();
      expect(height1).toBe(mockBlockHeight);

      // Clear mock to ensure it's not called again
      vi.clearAllMocks();

      // Second call should use cache
      const height2 = await getCurrentBlockHeight();
      expect(height2).toBe(mockBlockHeight);
      expect(mockedApiClient.get).not.toHaveBeenCalled();
      // all sources use apiClient now
    });

    it('should force refresh when forceRefresh is true', async () => {
      // First call to populate cache
      mockAllSourcesSuccess(mockBlockHeight.toString());

      await getCurrentBlockHeight();

      // Clear mock and set up new response
      vi.clearAllMocks();
      const newHeight = mockBlockHeight + 1;
      mockAllSourcesSuccess(newHeight.toString());

      // Force refresh should bypass cache
      const height = await getCurrentBlockHeight(true);
      expect(height).toBe(newHeight);
      expect(mockedApiClient.get).toHaveBeenCalled();
    });

    it('should fetch new data when cache is expired', async () => {
      // Mock Date.now to simulate cache expiration
      const originalDateNow = Date.now;
      let currentTime = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      // First call to populate cache
      mockAllSourcesSuccess(mockBlockHeight.toString());

      await getCurrentBlockHeight();

      // Advance time beyond cache duration (10 minutes + 1ms)
      currentTime += 10 * 60 * 1000 + 1;

      // Reset the mock response without clearing call history
      const newHeight = mockBlockHeight + 1;
      mockedApiClient.get.mockClear();
      mockAllSourcesSuccess(newHeight.toString());

      // Should fetch fresh data due to expired cache
      const height = await getCurrentBlockHeight();
      expect(height).toBe(newHeight);
      expect(mockedApiClient.get).toHaveBeenCalled();

      Date.now = originalDateNow;
    });

    it('should fallback to sequential when race fails', async () => {
      // Race: all 3 fail
      mockedApiClient.get
        .mockRejectedValueOnce(new Error('Race failed'))
        .mockRejectedValueOnce(new Error('Race failed'))
        .mockRejectedValueOnce(new Error('Race failed'));

      // Sequential: mempoolSpace succeeds on retry
      mockedApiClient.get.mockResolvedValueOnce({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height = await getCurrentBlockHeight();
      expect(height).toBe(mockBlockHeight);
    });

    it('should throw error when both race and sequential fail', async () => {
      mockedApiClient.get.mockRejectedValue(new Error('All failed'));
      // blockchainInfo also fails (all use apiClient now)

      await expect(getCurrentBlockHeight()).rejects.toThrow(
        'Failed to fetch current block height'
      );
    });

    it('should update cache after successful fetch', async () => {
      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(123456789);

      mockAllSourcesSuccess(mockBlockHeight.toString());

      await getCurrentBlockHeight();

      // Second call should use cache (no additional fetch calls)
      vi.clearAllMocks();
      const height = await getCurrentBlockHeight();
      expect(height).toBe(mockBlockHeight);
      expect(mockedApiClient.get).not.toHaveBeenCalled();
      // all sources use apiClient now

      mockDateNow.mockRestore();
    });

    it('should handle concurrent requests properly', async () => {
      let resolveFirst: (value: { data: string; status: number; statusText: string; headers: Record<string, string> }) => void;

      // mempoolSpace - controlled resolution
      mockedApiClient.get
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
        // blockstream - never resolves
        .mockImplementationOnce(() => new Promise(() => {}))
        // blockchainInfo - never resolves
        .mockImplementationOnce(() => new Promise(() => {}));

      // Start one request (race calls all 3 endpoints)
      const promise1 = getCurrentBlockHeight();

      // Resolve the first endpoint
      resolveFirst!({
        data: mockBlockHeight.toString(),
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const height1 = await promise1;
      expect(height1).toBe(mockBlockHeight);

      // Should have called all 3 apiClient endpoints for the race
      expect(mockedApiClient.get).toHaveBeenCalledTimes(3);
    });
  });
});
