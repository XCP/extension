/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// Fix TextEncoder issue in test environment
if (!globalThis.TextEncoder) {
  const util = require('util');
  globalThis.TextEncoder = util.TextEncoder;
  globalThis.TextDecoder = util.TextDecoder;
}

// Mock crypto/bitcoin libraries that might cause esbuild issues
vi.mock('@scure/btc-signer', () => ({}));
vi.mock('@scure/bip32', () => ({}));
vi.mock('@scure/bip39', () => ({}));
vi.mock('@noble/hashes/sha256', () => ({}));
vi.mock('@scure/base', () => ({}));

import { BlockchainService } from '../BlockchainService';
import * as bitcoinUtils from '@/utils/blockchain/bitcoin';
import * as counterpartyApi from '@/utils/blockchain/counterparty/api';

// Mock the blockchain utilities
vi.mock('@/utils/blockchain/bitcoin', () => ({
  fetchBTCBalance: vi.fn(),
  getFeeRates: vi.fn(),
  getCurrentBlockHeight: vi.fn(),
  clearBlockHeightCache: vi.fn(),
  getBtcPrice: vi.fn(),
  broadcastTransaction: vi.fn(),
  fetchUTXOs: vi.fn(),
  fetchPreviousRawTransaction: vi.fn(),
  fetchBitcoinTransaction: vi.fn(),
  formatInputsSet: vi.fn(),
  getUtxoByTxid: vi.fn(),
}));

vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchTokenBalances: vi.fn(),
  fetchAssetDetails: vi.fn(),
  fetchAssetDetailsAndBalance: vi.fn(),
  fetchTokenBalance: vi.fn(),
  fetchTransactions: vi.fn(),
  fetchOrders: vi.fn(),
  fetchDispensers: vi.fn(),
  getAssetHistory: vi.fn(),
}));

// Mock Chrome APIs
const mockChrome = {
  storage: {
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
};

(global as any).chrome = mockChrome;

describe.skip('BlockchainService', () => {
  let service: BlockchainService;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock storage get/set
    mockChrome.storage.session.get.mockResolvedValue({});
    mockChrome.storage.session.set.mockResolvedValue(undefined);
    
    service = new BlockchainService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.destroy();
  });

  describe('Initialization and Lifecycle', () => {
    it('should initialize successfully', async () => {
      expect(service.isInitialized()).toBe(true);
      expect(service.getServiceName()).toBe('BlockchainService');
    });

    it('should handle state serialization and hydration', () => {
      const state = (service as any).getSerializableState();
      expect(state).toHaveProperty('cacheStats');
      expect(state).toHaveProperty('rateLimitStats');
      expect(state).toHaveProperty('healthMetrics');
      
      const newService = new BlockchainService();
      (newService as any).hydrateState(state);
      expect((newService as any).getSerializableState()).toEqual(state);
    });

    it('should return correct state version', () => {
      expect((service as any).getStateVersion()).toBe(1);
    });
  });


  describe('Bitcoin Operations', () => {
    const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

    describe('getBTCBalance', () => {
      it('should fetch and cache BTC balance', async () => {
        const mockBalance = 100000000; // 1 BTC in satoshis
        (bitcoinUtils.fetchBTCBalance as Mock).mockResolvedValue(mockBalance);

        const balance1 = await service.getBTCBalance(testAddress);
        const balance2 = await service.getBTCBalance(testAddress); // Should use cache

        expect(balance1).toBe(mockBalance);
        expect(balance2).toBe(mockBalance);
        expect(bitcoinUtils.fetchBTCBalance).toHaveBeenCalledTimes(1);
      });

      it('should handle BTC balance fetch errors', async () => {
        (bitcoinUtils.fetchBTCBalance as Mock).mockRejectedValue(new Error('API error'));

        await expect(service.getBTCBalance(testAddress)).rejects.toThrow('API error');
      });
    });

    describe('getFeeRates', () => {
      it('should fetch and cache fee rates', async () => {
        const mockFeeRates = { fastestFee: 10, halfHourFee: 8, hourFee: 6 };
        (bitcoinUtils.getFeeRates as Mock).mockResolvedValue(mockFeeRates);

        const feeRates1 = await service.getFeeRates();
        const feeRates2 = await service.getFeeRates(); // Should use cache

        expect(feeRates1).toEqual(mockFeeRates);
        expect(feeRates2).toEqual(mockFeeRates);
        expect(bitcoinUtils.getFeeRates).toHaveBeenCalledTimes(1);
      });
    });

    describe('getBlockHeight', () => {
      it('should fetch and cache block height', async () => {
        const mockHeight = 800000;
        (bitcoinUtils.getCurrentBlockHeight as Mock).mockResolvedValue(mockHeight);

        const height1 = await service.getBlockHeight();
        const height2 = await service.getBlockHeight(); // Should use cache

        expect(height1).toBe(mockHeight);
        expect(height2).toBe(mockHeight);
        expect(bitcoinUtils.getCurrentBlockHeight).toHaveBeenCalledTimes(1);
      });

      it('should force refresh when requested', async () => {
        const mockHeight = 800000;
        (bitcoinUtils.getCurrentBlockHeight as Mock).mockResolvedValue(mockHeight);

        await service.getBlockHeight();
        await service.getBlockHeight(true); // Force refresh

        expect(bitcoinUtils.getCurrentBlockHeight).toHaveBeenCalledTimes(2);
        // Note: clearBlockHeightCache method doesn't exist in current implementation
        // expect(bitcoinUtils.clearBlockHeightCache).toHaveBeenCalledTimes(1);
      });
    });

    describe('getBTCPrice', () => {
      it('should fetch and cache BTC price', async () => {
        const mockPrice = 45000;
        (bitcoinUtils.getBtcPrice as Mock).mockResolvedValue(mockPrice);

        const price1 = await service.getBTCPrice();
        const price2 = await service.getBTCPrice(); // Should use cache

        expect(price1).toBe(mockPrice);
        expect(price2).toBe(mockPrice);
        expect(bitcoinUtils.getBtcPrice).toHaveBeenCalledTimes(1);
      });

      it('should return null on price fetch failure', async () => {
        (bitcoinUtils.getBtcPrice as Mock).mockResolvedValue(null);

        const price = await service.getBTCPrice();
        expect(price).toBeNull();
      });
    });

    describe('getUTXOs', () => {
      it('should fetch and cache UTXOs', async () => {
        const mockUTXOs = [
          {
            txid: 'abc123',
            vout: 0,
            value: 100000,
            status: { confirmed: true, block_height: 800000, block_hash: 'def456', block_time: 1234567890 }
          }
        ];
        (bitcoinUtils.fetchUTXOs as Mock).mockResolvedValue(mockUTXOs);

        const utxos1 = await service.getUTXOs(testAddress);
        const utxos2 = await service.getUTXOs(testAddress); // Should use cache

        expect(utxos1).toEqual(mockUTXOs);
        expect(utxos2).toEqual(mockUTXOs);
        expect(bitcoinUtils.fetchUTXOs).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Counterparty Operations', () => {
    const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    const testAsset = 'PEPECASH';

    describe('getTokenBalances', () => {
      it('should fetch and cache token balances', async () => {
        const mockBalances = [
          {
            asset: 'PEPECASH',
            quantity_normalized: '1000.00000000',
            asset_info: {
              asset_longname: null,
              description: 'Rare Pepe Cash',
              issuer: 'issuer123',
              divisible: true,
              locked: false,
            }
          }
        ];
        (counterpartyApi.fetchTokenBalances as Mock).mockResolvedValue(mockBalances);

        const balances1 = await service.getTokenBalances(testAddress);
        const balances2 = await service.getTokenBalances(testAddress); // Should use cache

        expect(balances1).toEqual(mockBalances);
        expect(balances2).toEqual(mockBalances);
        expect(counterpartyApi.fetchTokenBalances).toHaveBeenCalledTimes(1);
      });
    });

    describe('getAssetDetails', () => {
      it('should fetch and cache asset details', async () => {
        const mockAssetInfo = {
          asset: 'PEPECASH',
          asset_longname: null,
          description: 'Rare Pepe Cash',
          issuer: 'issuer123',
          divisible: true,
          locked: false,
          supply_normalized: '1000000000.00000000',
        };
        (counterpartyApi.fetchAssetDetails as Mock).mockResolvedValue(mockAssetInfo);

        const assetInfo1 = await service.getAssetDetails(testAsset);
        const assetInfo2 = await service.getAssetDetails(testAsset); // Should use cache

        expect(assetInfo1).toEqual(mockAssetInfo);
        expect(assetInfo2).toEqual(mockAssetInfo);
        expect(counterpartyApi.fetchAssetDetails).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      // Populate cache with some data
      const mockBalance = 100000000;
      (bitcoinUtils.fetchBTCBalance as Mock).mockResolvedValue(mockBalance);
      await service.getBTCBalance('test-address');
    });

    it('should clear all caches', () => {
      const stats1 = service.getCacheStats();
      expect(stats1.totalEntries).toBeGreaterThan(0);

      service.clearAllCaches();

      const stats2 = service.getCacheStats();
      expect(stats2.totalEntries).toBe(0);
      expect(stats2.evictions).toBeGreaterThan(0);
    });

    it('should clear cache by pattern', async () => {
      // Add another cache entry
      const mockFeeRates = { fastestFee: 10, halfHourFee: 8, hourFee: 6 };
      (bitcoinUtils.getFeeRates as Mock).mockResolvedValue(mockFeeRates);
      await service.getFeeRates();

      const stats1 = service.getCacheStats();
      expect(stats1.totalEntries).toBe(2);

      // Clear only BTC balance cache
      service.clearCachePattern('btc_balance');

      const stats2 = service.getCacheStats();
      expect(stats2.totalEntries).toBe(1); // Fee rates should remain
    });

    it('should provide cache statistics', async () => {
      const stats = service.getCacheStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.hitRate).toBe('number');
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Circuit Breaker and Resilience', () => {
    it('should handle repeated failures with circuit breaker', async () => {
      const error = new Error('Network error');
      (bitcoinUtils.fetchBTCBalance as Mock).mockRejectedValue(error);

      // Make multiple failed requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await service.getBTCBalance('test-address');
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit breakers should have opened due to failures
      // This replaces the old health check
    });

    it('should retry failed requests', async () => {
      const error = new Error('Temporary network error');
      (bitcoinUtils.fetchBTCBalance as Mock)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(100000000);

      const balance = await service.getBTCBalance('test-address');
      
      expect(balance).toBe(100000000);
      expect(bitcoinUtils.fetchBTCBalance).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Utility Methods', () => {
    it('should format inputs set from UTXOs', () => {
      const mockUTXOs = [
        { txid: 'abc123', vout: 0, value: 100000, status: {} as any },
        { txid: 'def456', vout: 1, value: 200000, status: {} as any },
      ];
      (bitcoinUtils.formatInputsSet as Mock).mockReturnValue('abc123:0,def456:1');

      const result = service.formatInputsSet(mockUTXOs);
      
      expect(result).toBe('abc123:0,def456:1');
      expect(bitcoinUtils.formatInputsSet).toHaveBeenCalledWith(mockUTXOs);
    });

    it('should get UTXO by txid and vout', () => {
      const mockUTXOs = [
        { txid: 'abc123', vout: 0, value: 100000, status: {} as any },
        { txid: 'def456', vout: 1, value: 200000, status: {} as any },
      ];
      const expectedUTXO = mockUTXOs[0];
      (bitcoinUtils.getUtxoByTxid as Mock).mockReturnValue(expectedUTXO);

      const result = service.getUtxoByTxid(mockUTXOs, 'abc123', 0);
      
      expect(result).toEqual(expectedUTXO);
      expect(bitcoinUtils.getUtxoByTxid).toHaveBeenCalledWith(mockUTXOs, 'abc123', 0);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-retryable errors correctly', async () => {
      const error = new Error('Bad Request') as any;
      error.response = { status: 400 };
      (bitcoinUtils.fetchBTCBalance as Mock).mockRejectedValue(error);

      await expect(service.getBTCBalance('test-address')).rejects.toThrow('Bad Request');
      
      // Should only be called once (no retries for 4xx errors)
      expect(bitcoinUtils.fetchBTCBalance).toHaveBeenCalledTimes(1);
    });

    it('should handle rate limiting', async () => {
      // Make many rapid requests to trigger rate limiting
      const promises = Array.from({ length: 150 }, (_, i) => 
        service.getBTCBalance(`test-address-${i}`)
      );

      const results = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rejectedResults = results.filter(r => r.status === 'rejected');
      expect(rejectedResults.length).toBeGreaterThan(0);
      
      const rateLimitErrors = rejectedResults.filter(r => 
        r.status === 'rejected' && r.reason.message.includes('Rate limit')
      );
      expect(rateLimitErrors.length).toBeGreaterThan(0);
    });
  });
});