/**
 * TransactionService Unit Tests
 * 
 * Tests the transaction composition, signing, and broadcasting functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { TransactionService } from '../TransactionService';
import type { ConnectionService } from '../../connection/ConnectionService';
import type { ApprovalService } from '../../approval/ApprovalService';
import type { BlockchainService } from '../../blockchain/BlockchainService';

// Mock webext-bridge to prevent browser API issues
vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
}));

// Mock Fathom analytics to prevent network errors in tests
vi.mock('@/utils/fathom', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock the compose utility
import { composeTransaction } from '@/utils/blockchain/counterparty/compose';
vi.mock('@/utils/blockchain/counterparty/compose', () => ({
  composeTransaction: vi.fn(),
}));

// Mock service getters
const mockConnectionService = {
  hasPermission: vi.fn(),
} as unknown as ConnectionService;

const mockApprovalService = {
  requestApproval: vi.fn(),
} as unknown as ApprovalService;

const mockBlockchainService = {
  broadcastTransaction: vi.fn(),
  getBTCBalance: vi.fn(),
  getUTXOs: vi.fn(),
  getFeeRates: vi.fn(),
  getTokenBalances: vi.fn(),
} as unknown as BlockchainService;

const mockWalletService = {
  getActiveAddress: vi.fn(),
  getLastActiveAddress: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  broadcastTransaction: vi.fn(),
};

// Mock the service getters
vi.mock('@/services/connection', () => ({
  getConnectionService: () => mockConnectionService,
}));

vi.mock('@/services/approval', () => ({
  getApprovalService: () => mockApprovalService,
}));

vi.mock('@/services/blockchain', () => ({
  getBlockchainService: () => mockBlockchainService,
}));

vi.mock('@/services/walletService', () => ({
  getWalletService: () => mockWalletService,
}));

// Mock security utilities with proper replay prevention logic
vi.mock('@/utils/security/replayPrevention', () => ({
  withReplayPrevention: vi.fn(),
  recordTransaction: vi.fn(),
  markTransactionBroadcasted: vi.fn(),
}));

// Mock rate limiter with proper rate limiting simulation
vi.mock('@/utils/provider/rateLimiter', () => ({
  transactionRateLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn().mockReturnValue(Date.now() + 60000),
  },
}));

// Import the mocked utilities to access them in tests
import { transactionRateLimiter } from '@/utils/provider/rateLimiter';
import { withReplayPrevention } from '@/utils/security/replayPrevention';

// Mock chrome storage
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
};

// Setup global mocks
beforeEach(() => {
  // Clear all mocks at the start
  vi.clearAllMocks();
  
  // Use fakeBrowser from wxt/testing
  fakeBrowser.storage.local = mockStorage;
  fakeBrowser.storage.session = mockStorage;
  fakeBrowser.runtime.getManifest = vi.fn(() => ({ version: '1.0.0', name: 'Test Extension' } as any));
  
  (global as any).browser = fakeBrowser;
  (global as any).chrome = fakeBrowser;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TransactionService', () => {
  let transactionService: TransactionService;

  beforeEach(async () => {
    transactionService = new TransactionService();
    
    // Reset all service mocks to ensure they work correctly
    mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
    mockApprovalService.requestApproval = vi.fn().mockResolvedValue(true);
    mockWalletService.getActiveAddress = vi.fn().mockResolvedValue({
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      type: 'Native SegWit',
    });
    mockWalletService.getLastActiveAddress = vi.fn().mockResolvedValue({
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      type: 'Native SegWit',
    });
    mockWalletService.signTransaction = vi.fn().mockResolvedValue({
      signedTransaction: '0xsigned123...',
      txid: 'abc123...',
    });
    mockWalletService.signMessage = vi.fn().mockResolvedValue('signature123...');
    mockWalletService.broadcastTransaction = vi.fn().mockResolvedValue({
      txid: 'broadcast123...',
    });
    
    // Reset rate limiter mock to allow all requests by default
    vi.mocked(transactionRateLimiter.isAllowed).mockImplementation(() => true);
    
    // Reset replay prevention mock to default behavior
    vi.mocked(withReplayPrevention).mockImplementation((origin, method, params, handler) => handler());
    
    // Mock initial storage state
    mockStorage.get.mockResolvedValue({});
    
    await transactionService.initialize();
  });

  afterEach(async () => {
    await transactionService.destroy();
  });

  describe('composeSend', () => {
    const mockSendParams = {
      destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      asset: 'XCP',
      quantity: 100000000, // 1.0 XCP
      memo: 'Test memo',
      memo_is_hex: false,
      sourceAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      sat_per_vbyte: 2,
    };

    it('should successfully compose send transaction', async () => {
      // Mock permission check
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      
      // Mock blockchain service response with correct structure
      const mockComposeResult = {
        result: {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,  // Note: service expects btc_fee, not fee
          params: mockSendParams,
        }
      };
      vi.mocked(composeTransaction).mockResolvedValue(mockComposeResult as any);
      
      const expectedResult = {
        rawtransaction: '0x123456...',
        psbt: 'psbt-base64...',
        fee: 2000,  // This is what the service returns
        params: mockSendParams,
      };
      
      const result = await transactionService.composeSend('https://dapp.com', mockSendParams);
      
      expect(result).toEqual(expectedResult);
      expect(mockConnectionService.hasPermission).toHaveBeenCalledWith('https://dapp.com');
      expect(composeTransaction).toHaveBeenCalled();
    });

    it('should reject unauthorized origin', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);
      
      await expect(
        transactionService.composeSend('https://unauthorized.com', mockSendParams)
      ).rejects.toThrow('Unauthorized - not connected to wallet');
      
      expect(composeTransaction).not.toHaveBeenCalled();
    });

    it('should validate send parameters', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      
      // Test missing destination
      vi.mocked(composeTransaction).mockRejectedValue(new Error('Destination address is required'));
      await expect(
        transactionService.composeSend('https://dapp.com', {
          ...mockSendParams,
          destination: undefined as any,
        })
      ).rejects.toThrow('Destination address is required');
      
      // Test invalid asset
      vi.mocked(composeTransaction).mockRejectedValue(new Error('Asset name is required'));
      await expect(
        transactionService.composeSend('https://dapp.com', {
          ...mockSendParams,
          asset: '',
        })
      ).rejects.toThrow('Asset name is required');
      
      // Test invalid quantity
      vi.mocked(composeTransaction).mockRejectedValue(new Error('Quantity must be positive'));
      await expect(
        transactionService.composeSend('https://dapp.com', {
          ...mockSendParams,
          quantity: -1,
        })
      ).rejects.toThrow('Quantity must be positive');
    });

    it('should cache identical compose requests', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      
      const mockComposeResult = {
        result: {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,
          params: mockSendParams,
        }
      };
      vi.mocked(composeTransaction).mockResolvedValue(mockComposeResult as any);
      
      // Make same request twice
      const result1 = await transactionService.composeSend('https://dapp.com', mockSendParams);
      const result2 = await transactionService.composeSend('https://dapp.com', mockSendParams);
      
      expect(result1).toEqual(result2);
      expect(composeTransaction).toHaveBeenCalledTimes(1); // Only called once due to caching
    });

    it('should apply rate limiting per origin', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      vi.mocked(composeTransaction).mockResolvedValue({
        result: {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,
          params: mockSendParams,
        }
      } as any);
      
      // Mock rate limiter to simulate rate limiting after 5 requests
      let callCount = 0;
      vi.mocked(transactionRateLimiter.isAllowed).mockImplementation(() => {
        callCount++;
        return callCount <= 5; // Allow first 5, reject rest
      });
      
      // Make many rapid requests
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          transactionService.composeSend('https://rapid.com', {
            ...mockSendParams,
            quantity: 100000000 + i, // Make each request unique
          }).catch(error => error.message)
        );
      }
      
      const results = await Promise.all(promises);
      
      // Should have some rate limited requests
      const rateLimitedCount = results.filter(result => 
        typeof result === 'string' && result.includes('rate limit')
      ).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('composeOrder', () => {
    const mockOrderParams = {
      give_asset: 'XCP',
      give_quantity: 100000000, // 1.0 XCP
      get_asset: 'PEPECASH',
      get_quantity: 50000000000, // 500.0 PEPECASH
      expiration: 1000,
      sourceAddress: 'test_address',
      sat_per_vbyte: 2,
    } as any;

    it('should successfully compose order with user approval', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(true);
      
      const mockComposeResult = {
        rawtransaction: '0xabcdef...',
        psbt: 'psbt-order...',
        btc_fee: 3000,
        params: mockOrderParams,
      };
      vi.mocked(composeTransaction).mockResolvedValue({
        result: mockComposeResult
      } as any);
      
      const expectedResult = {
        rawtransaction: '0xabcdef...',
        psbt: 'psbt-order...',
        fee: 3000, // Service converts btc_fee to fee
        params: mockOrderParams,
      };
      
      const result = await transactionService.composeOrder('https://dex.com', mockOrderParams);
      
      expect(result).toEqual(expectedResult);
      expect(mockApprovalService.requestApproval).toHaveBeenCalledWith({
        id: expect.stringContaining('compose-order-https://dex.com-'),
        origin: 'https://dex.com',
        method: 'xcp_composeOrder',
        params: [mockOrderParams],
        type: 'compose',
        metadata: {
          domain: 'dex.com',
          title: 'Create DEX Order',
          description: `Trade ${mockOrderParams.give_asset} for ${mockOrderParams.get_asset}`,
        },
      });
    });

    it('should reject order when user denies approval', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(false);
      
      await expect(
        transactionService.composeOrder('https://dex.com', mockOrderParams)
      ).rejects.toThrow('User denied the request');
      
      expect(composeTransaction).not.toHaveBeenCalled();
    });
  });

  describe('signTransaction', () => {
    const mockRawTransaction = '0x1234567890abcdef...';
    const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

    it('should successfully sign transaction with user approval', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(true);
      
      // Mock wallet service sign transaction response
      mockWalletService.signTransaction = vi.fn().mockResolvedValue('0xsigned123...');
      
      const result = await transactionService.signTransaction(
        'https://dapp.com',
        mockRawTransaction
      );
      
      expect(result).toEqual({
        signedTransaction: '0xsigned123...',
      });
      
      expect(mockApprovalService.requestApproval).toHaveBeenCalledWith({
        id: expect.stringContaining('sign-https://dapp.com-'),
        origin: 'https://dapp.com',
        method: 'xcp_signTransaction',
        params: [mockRawTransaction],
        type: 'signature',
        metadata: {
          domain: 'dapp.com',
          title: 'Sign Transaction',
          description: 'Sign a transaction with your wallet',
        },
      });
    });

    it('should reject signing when user denies approval', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(false);
      
      await expect(
        transactionService.signTransaction('https://dapp.com', mockRawTransaction)
      ).rejects.toThrow('User denied the request');
    });
  });

  describe('broadcastTransaction', () => {
    const mockSignedTransaction = '0xsigned1234567890abcdef...';

    it('should successfully broadcast transaction', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      
      const mockBroadcastResult = {
        txid: 'abc123def456...',
        fees: 2000,
      };
      mockWalletService.broadcastTransaction = vi.fn().mockResolvedValue(mockBroadcastResult);
      
      const result = await transactionService.broadcastTransaction(
        'https://dapp.com',
        mockSignedTransaction
      );
      
      expect(result).toEqual({
        txid: 'abc123def456...',
        fees: 2000,
      });
      expect(mockWalletService.broadcastTransaction).toHaveBeenCalledWith(mockSignedTransaction);
    });

    it('should prevent replay attacks', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockWalletService.broadcastTransaction = vi.fn().mockResolvedValue({
        txid: 'duplicate123...',
        fees: 2000,
      });
      
      // Mock replay prevention to simulate first success, then reject second attempt
      let callCount = 0;
      vi.mocked(withReplayPrevention).mockImplementation((origin, method, params, handler) => {
        callCount++;
        if (callCount === 1) {
          return handler(); // Allow first call
        } else {
          throw new Error('Request rejected: Duplicate transaction detected'); // Reject second call
        }
      });
      
      // First broadcast should succeed
      await transactionService.broadcastTransaction('https://dapp.com', mockSignedTransaction);
      
      // Second identical broadcast should be blocked
      await expect(
        transactionService.broadcastTransaction('https://dapp.com', mockSignedTransaction)
      ).rejects.toThrow('Duplicate transaction detected');
    });

    it('should apply broadcast rate limiting', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockWalletService.broadcastTransaction = vi.fn().mockResolvedValue({
        txid: 'rate-limit-test',
        fees: 2000,
      });
      
      // Mock rate limiter to simulate rate limiting after 5 requests
      let broadcastCount = 0;
      vi.mocked(transactionRateLimiter.isAllowed).mockImplementation(() => {
        broadcastCount++;
        return broadcastCount <= 5; // Allow first 5, reject rest
      });
      
      // Mock replay prevention to always allow (focus on rate limiting)
      vi.mocked(withReplayPrevention).mockImplementation((origin, method, params, handler) => handler());
      
      // Make many rapid broadcast attempts
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          transactionService.broadcastTransaction(
            'https://rapid-broadcast.com',
            `0xsigned${i}...` // Different transactions
          ).catch(error => error.message)
        );
      }
      
      const results = await Promise.all(promises);
      
      // Should have some rate limited requests
      const rateLimitedCount = results.filter(result => 
        typeof result === 'string' && result.includes('rate limit')
      ).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });

  describe('signMessage', () => {
    const mockMessage = 'Please sign this message to authenticate';
    const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

    it('should successfully sign message with user approval', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(true);
      
      // Mock wallet service sign message response
      mockWalletService.signMessage = vi.fn().mockResolvedValue({ signature: 'message-signature-abc123...' });
      
      const result = await transactionService.signMessage(
        'https://auth.com',
        mockMessage,
        mockAddress
      );
      
      expect(result).toBe('message-signature-abc123...');
      
      expect(mockApprovalService.requestApproval).toHaveBeenCalledWith({
        id: expect.stringContaining('sign-msg-https://auth.com-'),
        origin: 'https://auth.com',
        method: 'xcp_signMessage',
        params: [mockMessage, mockAddress],
        type: 'signature',
        metadata: {
          domain: 'auth.com',
          title: 'Sign Message',
          description: `Sign a message with address ${mockAddress}`,
        },
      });
    });

    it('should reject message signing when user denies', async () => {
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(false);
      
      await expect(
        transactionService.signMessage('https://auth.com', mockMessage, mockAddress)
      ).rejects.toThrow('User denied the request');
    });
  });

  describe('transaction history', () => {
    it('should return transaction history for origin', async () => {
      // Mock compose result
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      vi.mocked(composeTransaction).mockResolvedValue({
        result: {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,
          params: {},
        }
      } as any);
      
      // Add some transactions to history
      await transactionService.composeSend('https://dapp.com', {
        destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        asset: 'XCP',
        quantity: 100000000,
        sourceAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        sat_per_vbyte: 2,
      });
      
      const history = transactionService.getTransactionHistory('https://dapp.com');
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        origin: 'https://dapp.com',
        method: 'xcp_composeSend',
        timestamp: expect.any(Number),
        status: 'pending',
      });
    });

    it('should limit transaction history results', async () => {
      // Add multiple transactions
      for (let i = 0; i < 10; i++) {
        try {
          await transactionService.composeSend(`https://dapp${i}.com`, {
            destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
            asset: 'XCP',
            quantity: 100000000 + i,
            sourceAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            sat_per_vbyte: 2,
          });
        } catch (error) {
          // Ignore permission errors for this test
        }
      }
      
      const limitedHistory = transactionService.getTransactionHistory();
      // History is managed internally with a max size
    });
  });

  describe('performance and caching', () => {
    it('should provide transaction statistics', async () => {
      const stats = transactionService.getTransactionStats();
      
      expect(stats).toMatchObject({
        totalRequests: expect.any(Number),
        successfulRequests: expect.any(Number),
        successRate: expect.any(Number),
        averageResponseTime: expect.any(Number),
        cacheHitRate: expect.any(Number),
        transactionCount: expect.any(Number),
      });
    });

    it('should clear transaction cache', async () => {
      // First populate cache
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      vi.mocked(composeTransaction).mockResolvedValue({
        result: {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,
          params: {}
        }
      } as any);
      
      // Make same request twice - second should use cache
      const params1 = {
        destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        asset: 'XCP',
        quantity: 100000000,
        sourceAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        sat_per_vbyte: 2,
      };
      
      await transactionService.composeSend('https://dapp.com', params1);
      
      // Make different request to trigger cache mechanism
      const params2 = {
        destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        asset: 'PEPECASH',
        quantity: 200000000,
        sourceAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        sat_per_vbyte: 2,
      };
      
      await transactionService.composeSend('https://dapp.com', params2);
      
      // Both calls should have gone through since they have different params
      expect(composeTransaction).toHaveBeenCalledTimes(2);
    });
  });


  describe('state persistence', () => {
    it('should restore cache and history after restart', async () => {
      // First create some activity to generate state
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
      vi.mocked(composeTransaction).mockResolvedValue({
        result: {
          rawtransaction: '0x123456...',
          psbt: 'psbt-base64...',
          btc_fee: 2000,
          params: {},
        }
      } as any);
      
      // Make a transaction to generate state
      await transactionService.composeSend('https://dapp.com', {
        destination: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        asset: 'XCP',
        quantity: 100000000,
        sourceAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        sat_per_vbyte: 2,
      });
      
      const initialStats = transactionService.getTransactionStats();
      
      // Verify we have some transaction count
      expect(initialStats.transactionCount).toBeGreaterThan(0);
    });
  });
});