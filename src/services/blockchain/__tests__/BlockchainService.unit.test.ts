/**
 * BlockchainService Unit Tests
 * 
 * Tests the blockchain operations and API integration functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockchainService } from '../BlockchainService';

// Mock blockchain utilities
vi.mock('@/utils/blockchain/counterparty/api', () => ({
  fetchTokenBalances: vi.fn(),
  fetchTransactions: vi.fn(),
  fetchOrders: vi.fn(),
  fetchAddressDispensers: vi.fn(),
  fetchAssetDetails: vi.fn(),
  composeSend: vi.fn(),
  composeOrder: vi.fn(),
}));

vi.mock('@/utils/blockchain/bitcoin', () => ({
  fetchBTCBalance: vi.fn(),
  fetchUTXOs: vi.fn(),
  getCurrentBlockHeight: vi.fn(),
  getFeeRates: vi.fn(),
  broadcastTransaction: vi.fn(),
  getBtcPrice: vi.fn(),
}));

// Mock chrome storage
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
};

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  
  global.chrome = {
    storage: {
      local: mockStorage,
      session: mockStorage,
    },
  } as any;
  
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BlockchainService', () => {
  let blockchainService: BlockchainService;

  beforeEach(async () => {
    blockchainService = new BlockchainService();
    
    // Mock initial storage state
    mockStorage.get.mockResolvedValue({});
    
    await blockchainService.initialize();
  });

  afterEach(async () => {
    await blockchainService.destroy();
  });

  describe('Bitcoin operations', () => {
    describe('getBTCBalance', () => {
      it('should fetch Bitcoin balance for address', async () => {
        const mockBalance = 50000000; // 0.5 BTC
        const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchBTCBalance).mockResolvedValue(mockBalance);
        
        const result = await blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toBe(mockBalance);
        expect(fetchBTCBalance).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 5000);
      });

      it('should handle API errors gracefully', async () => {
        const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchBTCBalance).mockRejectedValue(new Error('API unavailable'));
        
        await expect(blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'))
          .rejects.toThrow('API unavailable');
      });

      it('should cache balance results', async () => {
        const mockBalance = 25000000;
        const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchBTCBalance).mockResolvedValue(mockBalance);
        
        const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        
        // First call
        await blockchainService.getBTCBalance(address);
        // Second call (should use cache)
        await blockchainService.getBTCBalance(address);
        
        // Should only call the actual API once due to caching
        expect(fetchBTCBalance).toHaveBeenCalledTimes(1);
      });
    });

    describe('getUTXOs', () => {
      it('should fetch UTXOs for address', async () => {
        const mockUTXOs = [
          { txid: 'abc123', vout: 0, value: 10000, status: { confirmed: true, block_height: 800000, block_hash: 'abc', block_time: 1234567890 } },
          { txid: 'def456', vout: 1, value: 25000, status: { confirmed: true, block_height: 800001, block_hash: 'def', block_time: 1234567900 } },
        ];
        const { fetchUTXOs } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchUTXOs).mockResolvedValue(mockUTXOs);
        
        const result = await blockchainService.getUTXOs('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockUTXOs);
        expect(fetchUTXOs).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', undefined);
      });
    });

    describe('getBlockHeight', () => {
      it('should fetch current block height', async () => {
        const mockHeight = 800000;
        const { getCurrentBlockHeight } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(getCurrentBlockHeight).mockResolvedValue(mockHeight);
        
        const result = await blockchainService.getBlockHeight();
        
        expect(result).toBe(mockHeight);
        expect(getCurrentBlockHeight).toHaveBeenCalledWith(false);
      });

      it('should cache block height with TTL', async () => {
        const mockHeight = 800001;
        const { getCurrentBlockHeight } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(getCurrentBlockHeight).mockResolvedValue(mockHeight);
        
        // Multiple calls within cache period
        await blockchainService.getBlockHeight();
        await blockchainService.getBlockHeight();
        
        // Should only call API once due to caching
        expect(getCurrentBlockHeight).toHaveBeenCalledTimes(1);
      });
    });

    // describe('estimateFeeRate', () => {
    //   it('should estimate fee rate with target blocks', async () => {
    //     const mockFeeRate = 5; // sat/vbyte
    //     const { estimateFeeRate } = await import('@/utils/blockchain/bitcoin');
    //     vi.mocked(estimateFeeRate).mockResolvedValue(mockFeeRate);
    //     
    //     const result = await blockchainService.estimateFeeRate(6); // 6 blocks target
    //     
    //     expect(result).toBe(mockFeeRate);
    //     expect(estimateFeeRate).toHaveBeenCalledWith(6);
    //   });
    // });

    describe('broadcastTransaction', () => {
      it('should broadcast transaction successfully', async () => {
        const mockResponse = { txid: 'abcdef123456789...', fees: 1000 };
        const { broadcastTransaction } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(broadcastTransaction).mockResolvedValue(mockResponse);
        
        const result = await blockchainService.broadcastTransaction('0x1234567890...');
        
        expect(result).toEqual(mockResponse);
        expect(broadcastTransaction).toHaveBeenCalledWith('0x1234567890...');
      });

      it('should handle broadcast failures', async () => {
        const { broadcastTransaction } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(broadcastTransaction).mockRejectedValue(new Error('Transaction rejected'));
        
        await expect(
          blockchainService.broadcastTransaction('0xinvalid...')
        ).rejects.toThrow('Transaction rejected');
      });
    });
  });

  describe('Counterparty operations', () => {
    describe('getTokenBalances', () => {
      it('should fetch token balances for address', async () => {
        const mockBalances = [
          { asset: 'XCP', quantity: 100000000, quantity_normalized: '1.0' },
          { asset: 'PEPECASH', quantity: 50000000000, quantity_normalized: '500.0' },
        ];
        const { fetchTokenBalances } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchTokenBalances).mockResolvedValue(mockBalances);
        
        const result = await blockchainService.getTokenBalances('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockBalances);
        expect(fetchTokenBalances).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {});
      });

      it('should support balance query options', async () => {
        const { fetchTokenBalances } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchTokenBalances).mockResolvedValue([]);
        
        await blockchainService.getTokenBalances('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          verbose: true,
        });
        
        expect(fetchTokenBalances).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          verbose: true,
        });
      });
    });

    describe('fetchTransactions', () => {
      it('should fetch transaction history for address', async () => {
        const mockTransactions = [
          {
            tx_hash: 'abc123',
            block_index: 800000,
            block_hash: '000000000000000000042527f6b2f9e5f6b4f9e5f6b4f9e5f6b4f9e5f6b4f9',
            block_time: 1640995200,
            tx_index: 1,
            source: '1A1z...',
            destination: '1B2v...',
            btc_amount: 0,
            btc_amount_normalized: '0.00000000',
            fee: 1000,
            data: { asset: 'XCP', quantity: 100000000 },
            supported: true,
            status: 'valid',
            type: 'send',
            transaction_type: 'send',
          } as any,
        ];
        const { fetchTransactions } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchTransactions).mockResolvedValue({
          result: mockTransactions,
          result_count: mockTransactions.length,
        });
        
        const result = await blockchainService.getTransactions('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockTransactions);
        expect(fetchTransactions).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {});
      });
    });

    describe('getOrders', () => {
      it('should fetch DEX orders for address', async () => {
        const mockOrders = [
          {
            tx_hash: 'order123',
            give_asset: 'XCP',
            give_quantity_normalized: '1.0',
            get_asset: 'PEPECASH',
            get_quantity_normalized: '500.0',
            give_remaining_normalized: '1.0',
            get_remaining_normalized: '500.0',
            status: 'open',
            block_time: 1640995200,
            expire_index: 800100,
          },
        ];
        const { fetchOrders } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchOrders).mockResolvedValue({
          orders: mockOrders,
          total: mockOrders.length,
        });
        
        const result = await blockchainService.getOrders('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockOrders);
        expect(fetchOrders).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {});
      });

      it('should support order query filters', async () => {
        const { fetchOrders } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchOrders).mockResolvedValue({
          orders: [],
          total: 0,
        });
        
        await blockchainService.getOrders('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          status: 'open',
        });
        
        expect(fetchOrders).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          status: 'open',
        });
      });
    });

    describe('getAssetDetails', () => {
      it('should fetch asset information', async () => {
        const mockAssetInfo = {
          asset: 'PEPECASH',
          asset_longname: null,
          description: 'Rare Pepe Cash',
          divisible: true,
          locked: false,
          supply: '100000000000000',
          supply_normalized: '100000000000000',
          issuer: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          fair_minting: false,
        };
        const { fetchAssetDetails } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchAssetDetails).mockResolvedValue(mockAssetInfo);
        
        const result = await blockchainService.getAssetDetails('PEPECASH');
        
        expect(result).toEqual(mockAssetInfo);
        expect(fetchAssetDetails).toHaveBeenCalledWith('PEPECASH', { verbose: true });
      });

      it('should cache asset information', async () => {
        const mockAssetInfo = { 
          asset: 'XCP', 
          asset_longname: null,
          divisible: true, 
          locked: false,
          supply: '2649988713',
          supply_normalized: '26499887.13',
          issuer: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          fair_minting: false,
        };
        const { fetchAssetDetails } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchAssetDetails).mockResolvedValue(mockAssetInfo);
        
        // Multiple calls for same asset
        await blockchainService.getAssetDetails('XCP');
        await blockchainService.getAssetDetails('XCP');
        
        // Should only call API once due to caching
        expect(fetchAssetDetails).toHaveBeenCalledTimes(1);
      });
    });
  });

  // Transaction composition is handled by the compose utilities, not the blockchain service
  // These methods are not part of the BlockchainService interface

  describe('caching and performance', () => {
    it('should respect cache TTL for different data types', async () => {
      // Test BTC balance caching (short TTL)
      const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
      vi.mocked(fetchBTCBalance).mockResolvedValue(25000000);
      
      await blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      await blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      
      expect(fetchBTCBalance).toHaveBeenCalledTimes(1);
      
      // Test asset info caching (long TTL)
      const { fetchAssetDetails } = await import('@/utils/blockchain/counterparty/api');
      vi.mocked(fetchAssetDetails).mockResolvedValue({ 
        asset: 'XCP', 
        asset_longname: null,
        divisible: true,
        locked: false,
        supply: '2649988713',
        supply_normalized: '26499887.13',
        issuer: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        fair_minting: false,
      });
      
      await blockchainService.getAssetDetails('XCP');
      await blockchainService.getAssetDetails('XCP');
      
      expect(fetchAssetDetails).toHaveBeenCalledTimes(1);
    });

    it('should clear expired cache entries', async () => {
      // Mock cache entry that's expired
      const expiredCache = new Map([
        ['test-key', {
          data: 'expired-data',
          timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
          ttl: 5 * 60 * 1000, // 5 minute TTL (expired)
        }],
      ]);
      
      // Set up internal cache state
      (blockchainService as any).cache = expiredCache;
      
      // Trigger cache cleanup
      (blockchainService as any).cleanupExpiredCache();
      
      expect((blockchainService as any).cache.size).toBe(0);
    });
  });

  describe('error handling and resilience', () => {
    it('should implement circuit breaker for API failures', async () => {
      const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
      
      // Mock multiple failures
      for (let i = 0; i < 10; i++) {
        vi.mocked(fetchBTCBalance).mockRejectedValueOnce(new Error(`API Error ${i}`));
        
        try {
          await blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        } catch (error) {
          // Expected to fail
        }
      }
      
      // After many failures, circuit breaker should be open
      await expect(
        blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
      ).rejects.toThrow('Circuit breaker is open');
    });

    it('should retry failed requests with exponential backoff', async () => {
      const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
      
      // Mock one failure then success
      vi.mocked(fetchBTCBalance)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(25000000);
      
      const result = await blockchainService.getBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      
      expect(result).toBe(25000000);
      expect(fetchBTCBalance).toHaveBeenCalledTimes(2); // Initial call + 1 retry
    });
  });


  describe('state persistence', () => {
    it('should persist service state across restarts', async () => {
      // Add some cached data
      const { fetchAssetDetails } = await import('@/utils/blockchain/counterparty/api');
      const mockAssetInfo = { 
        asset: 'XCP', 
        asset_longname: null,
        divisible: true,
        locked: false,
        supply: '2649988713',
        supply_normalized: '26499887.13',
        issuer: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        fair_minting: false,
      };
      vi.mocked(fetchAssetDetails).mockResolvedValue(mockAssetInfo);
      
      await blockchainService.getAssetDetails('XCP');
      
      // Simulate service restart
      await blockchainService.destroy();
      
      // Mock storage returning saved state
      mockStorage.get.mockResolvedValue({
        'BlockchainService_state': {
          data: {
            cacheStats: { hits: 1, misses: 0, evictions: 0 },
            rateLimitStats: { requestCount: 1, throttledCount: 0 },
            circuitBreakerStats: {},
            healthMetrics: {
              lastSuccessfulRequest: Date.now(),
              totalRequests: 1,
              failedRequests: 0,
              averageResponseTime: 100,
            },
          },
          timestamp: Date.now(),
          version: 1,
        },
      });
      
      blockchainService = new BlockchainService();
      await blockchainService.initialize();
      
      // Should have restored state
      expect(blockchainService.getCacheStats().hits).toBe(1);
    });
  });
});