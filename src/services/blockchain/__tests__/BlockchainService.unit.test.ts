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
  fetchDispensers: vi.fn(),
  fetchAssetInfo: vi.fn(),
  composeTransaction: vi.fn(),
}));

vi.mock('@/utils/blockchain/bitcoin', () => ({
  fetchBTCBalance: vi.fn(),
  fetchUTXOs: vi.fn(),
  getCurrentBlockHeight: vi.fn(),
  estimateFeeRate: vi.fn(),
  broadcastTransaction: vi.fn(),
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
    describe('fetchBTCBalance', () => {
      it('should fetch Bitcoin balance for address', async () => {
        const mockBalance = 50000000; // 0.5 BTC
        const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchBTCBalance).mockResolvedValue(mockBalance);
        
        const result = await blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toBe(mockBalance);
        expect(fetchBTCBalance).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      });

      it('should handle API errors gracefully', async () => {
        const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchBTCBalance).mockRejectedValue(new Error('API unavailable'));
        
        const result = await blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toBe(0); // Should return 0 on error
      });

      it('should cache balance results', async () => {
        const mockBalance = 25000000;
        const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchBTCBalance).mockResolvedValue(mockBalance);
        
        const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        
        // First call
        await blockchainService.fetchBTCBalance(address);
        // Second call (should use cache)
        await blockchainService.fetchBTCBalance(address);
        
        // Should only call the actual API once due to caching
        expect(fetchBTCBalance).toHaveBeenCalledTimes(1);
      });
    });

    describe('fetchUTXOs', () => {
      it('should fetch UTXOs for address', async () => {
        const mockUTXOs = [
          { txid: 'abc123', vout: 0, value: 10000, script: 'script1' },
          { txid: 'def456', vout: 1, value: 25000, script: 'script2' },
        ];
        const { fetchUTXOs } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(fetchUTXOs).mockResolvedValue(mockUTXOs);
        
        const result = await blockchainService.fetchUTXOs('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockUTXOs);
        expect(fetchUTXOs).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      });
    });

    describe('getCurrentBlockHeight', () => {
      it('should fetch current block height', async () => {
        const mockHeight = 800000;
        const { getCurrentBlockHeight } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(getCurrentBlockHeight).mockResolvedValue(mockHeight);
        
        const result = await blockchainService.getCurrentBlockHeight();
        
        expect(result).toBe(mockHeight);
        expect(getCurrentBlockHeight).toHaveBeenCalled();
      });

      it('should cache block height with TTL', async () => {
        const mockHeight = 800001;
        const { getCurrentBlockHeight } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(getCurrentBlockHeight).mockResolvedValue(mockHeight);
        
        // Multiple calls within cache period
        await blockchainService.getCurrentBlockHeight();
        await blockchainService.getCurrentBlockHeight();
        
        // Should only call API once due to caching
        expect(getCurrentBlockHeight).toHaveBeenCalledTimes(1);
      });
    });

    describe('estimateFeeRate', () => {
      it('should estimate fee rate with target blocks', async () => {
        const mockFeeRate = 5; // sat/vbyte
        const { estimateFeeRate } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(estimateFeeRate).mockResolvedValue(mockFeeRate);
        
        const result = await blockchainService.estimateFeeRate(6); // 6 blocks target
        
        expect(result).toBe(mockFeeRate);
        expect(estimateFeeRate).toHaveBeenCalledWith(6);
      });
    });

    describe('broadcastTransaction', () => {
      it('should broadcast transaction successfully', async () => {
        const mockTxid = 'abcdef123456789...';
        const { broadcastTransaction } = await import('@/utils/blockchain/bitcoin');
        vi.mocked(broadcastTransaction).mockResolvedValue(mockTxid);
        
        const result = await blockchainService.broadcastTransaction('0x1234567890...');
        
        expect(result).toEqual({
          txid: mockTxid,
          status: 'success',
        });
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
    describe('fetchTokenBalances', () => {
      it('should fetch token balances for address', async () => {
        const mockBalances = [
          { asset: 'XCP', quantity: 100000000, quantity_normalized: 1.0 },
          { asset: 'PEPECASH', quantity: 50000000000, quantity_normalized: 500.0 },
        ];
        const { fetchTokenBalances } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchTokenBalances).mockResolvedValue(mockBalances);
        
        const result = await blockchainService.fetchTokenBalances('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockBalances);
        expect(fetchTokenBalances).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {});
      });

      it('should support balance query options', async () => {
        const { fetchTokenBalances } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchTokenBalances).mockResolvedValue([]);
        
        await blockchainService.fetchTokenBalances('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          verbose: true,
          limit: 10,
        });
        
        expect(fetchTokenBalances).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          verbose: true,
          limit: 10,
        });
      });
    });

    describe('fetchTransactions', () => {
      it('should fetch transaction history for address', async () => {
        const mockTransactions = [
          {
            tx_hash: 'abc123',
            block_index: 800000,
            tx_index: 1,
            category: 'sends',
            bindings: { source: '1A1z...', destination: '1B2v...', asset: 'XCP', quantity: 100000000 },
          },
        ];
        const { fetchTransactions } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchTransactions).mockResolvedValue(mockTransactions);
        
        const result = await blockchainService.fetchTransactions('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockTransactions);
        expect(fetchTransactions).toHaveBeenCalledWith('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {});
      });
    });

    describe('fetchOrders', () => {
      it('should fetch DEX orders for address', async () => {
        const mockOrders = [
          {
            tx_hash: 'order123',
            give_asset: 'XCP',
            give_quantity: 100000000,
            get_asset: 'PEPECASH',
            get_quantity: 50000000000,
            status: 'open',
          },
        ];
        const { fetchOrders } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchOrders).mockResolvedValue({ orders: mockOrders, total: 1 });
        
        const result = await blockchainService.fetchOrders('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        
        expect(result).toEqual(mockOrders);
        expect(fetchOrders).toHaveBeenCalledWith({ address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' });
      });

      it('should support order query filters', async () => {
        const { fetchOrders } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchOrders).mockResolvedValue({ orders: [], total: 0 });
        
        await blockchainService.fetchOrders('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', {
          status: 'open',
          give_asset: 'XCP',
        });
        
        expect(fetchOrders).toHaveBeenCalledWith({
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          status: 'open',
          give_asset: 'XCP',
        });
      });
    });

    describe('fetchAssetInfo', () => {
      it('should fetch asset information', async () => {
        const mockAssetInfo = {
          asset: 'PEPECASH',
          asset_longname: null,
          description: 'Rare Pepe Cash',
          divisible: true,
          locked: false,
          supply: 100000000000000,
        };
        const { fetchAssetInfo } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchAssetInfo).mockResolvedValue(mockAssetInfo);
        
        const result = await blockchainService.fetchAssetInfo('PEPECASH');
        
        expect(result).toEqual(mockAssetInfo);
        expect(fetchAssetInfo).toHaveBeenCalledWith('PEPECASH');
      });

      it('should cache asset information', async () => {
        const mockAssetInfo = { asset: 'XCP', divisible: true };
        const { fetchAssetInfo } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(fetchAssetInfo).mockResolvedValue(mockAssetInfo);
        
        // Multiple calls for same asset
        await blockchainService.fetchAssetInfo('XCP');
        await blockchainService.fetchAssetInfo('XCP');
        
        // Should only call API once due to caching
        expect(fetchAssetInfo).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('transaction composition', () => {
    describe('composeSend', () => {
      it('should compose send transaction', async () => {
        const mockResult = {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,
          params: {
            destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
            asset: 'XCP',
            quantity: 100000000,
          },
        };
        
        const { composeTransaction } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(composeTransaction).mockResolvedValue({ result: mockResult });
        
        const result = await blockchainService.composeSend({
          destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
          asset: 'XCP',
          quantity: 100000000,
        });
        
        expect(result).toEqual({
          rawtransaction: mockResult.rawtransaction,
          psbt: mockResult.psbt,
          fee: mockResult.btc_fee,
          params: mockResult.params,
        });
      });
    });

    describe('composeOrder', () => {
      it('should compose DEX order', async () => {
        const mockResult = {
          rawtransaction: '0xabcdef...',
          psbt: 'psbt-order...',
          btc_fee: 3000,
          params: {
            give_asset: 'XCP',
            give_quantity: 100000000,
            get_asset: 'PEPECASH',
            get_quantity: 50000000000,
          },
        };
        
        const { composeTransaction } = await import('@/utils/blockchain/counterparty/api');
        vi.mocked(composeTransaction).mockResolvedValue({ result: mockResult });
        
        const result = await blockchainService.composeOrder({
          give_asset: 'XCP',
          give_quantity: 100000000,
          get_asset: 'PEPECASH',
          get_quantity: 50000000000,
          expiration: 1000,
        });
        
        expect(result).toEqual({
          rawtransaction: mockResult.rawtransaction,
          psbt: mockResult.psbt,
          fee: mockResult.btc_fee,
          params: mockResult.params,
        });
      });
    });
  });

  describe('caching and performance', () => {
    it('should respect cache TTL for different data types', async () => {
      // Test BTC balance caching (short TTL)
      const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
      vi.mocked(fetchBTCBalance).mockResolvedValue(25000000);
      
      await blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      await blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      
      expect(fetchBTCBalance).toHaveBeenCalledTimes(1);
      
      // Test asset info caching (long TTL)
      const { fetchAssetInfo } = await import('@/utils/blockchain/counterparty/api');
      vi.mocked(fetchAssetInfo).mockResolvedValue({ asset: 'XCP', divisible: true });
      
      await blockchainService.fetchAssetInfo('XCP');
      await blockchainService.fetchAssetInfo('XCP');
      
      expect(fetchAssetInfo).toHaveBeenCalledTimes(1);
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
          await blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        } catch (error) {
          // Expected to fail
        }
      }
      
      // After many failures, circuit breaker should be open
      await expect(
        blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
      ).rejects.toThrow('Circuit breaker is open');
    });

    it('should retry failed requests with exponential backoff', async () => {
      const { fetchBTCBalance } = await import('@/utils/blockchain/bitcoin');
      
      // Mock one failure then success
      vi.mocked(fetchBTCBalance)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(25000000);
      
      const result = await blockchainService.fetchBTCBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      
      expect(result).toBe(25000000);
      expect(fetchBTCBalance).toHaveBeenCalledTimes(2); // Initial call + 1 retry
    });
  });


  describe('state persistence', () => {
    it('should persist cache state across service restarts', async () => {
      // Add some cached data
      const { fetchAssetInfo } = await import('@/utils/blockchain/counterparty/api');
      vi.mocked(fetchAssetInfo).mockResolvedValue({ asset: 'XCP', divisible: true });
      
      await blockchainService.fetchAssetInfo('XCP');
      
      // Simulate service restart
      await blockchainService.destroy();
      
      // Mock storage returning saved cache
      const savedCache = Array.from((blockchainService as any).cache.entries());
      mockStorage.get.mockResolvedValue({
        blockchainServiceState: {
          cache: savedCache,
          circuitBreakerState: { isOpen: false, failureCount: 0 },
        },
      });
      
      blockchainService = new BlockchainService();
      await blockchainService.initialize();
      
      // Should use cached data without API call
      const result = await blockchainService.fetchAssetInfo('XCP');
      expect(result).toEqual({ asset: 'XCP', divisible: true });
      expect(fetchAssetInfo).toHaveBeenCalledTimes(1); // Only the original call, not after restart
    });
  });
});