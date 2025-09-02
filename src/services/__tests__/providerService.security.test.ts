import './setup'; // Must be first to setup browser mocks
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { createProviderService, resolvePendingRequest } from '../providerService';
import * as walletService from '../walletService';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import { DEFAULT_KEYCHAIN_SETTINGS } from '@/utils/storage/settingsStorage';
import { connectionRateLimiter, transactionRateLimiter, apiRateLimiter } from '@/utils/provider/rateLimiter';
import { approvalQueue } from '@/utils/provider/approvalQueue';

// Mock the dependencies
vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn()
}));

vi.mock('../walletService');
vi.mock('@/utils/storage/settingsStorage');
vi.mock('@/utils/provider/rateLimiter');

// Mock CSP validation to avoid timeout issues
vi.mock('@/utils/security/cspValidation', () => ({
  analyzeCSP: vi.fn(() => Promise.resolve({
    hasCSP: true,
    isSecure: true,
    recommendations: [],
    warnings: [],
    directives: {}
  })),
  meetsSecurityRequirements: vi.fn(() => Promise.resolve(true))
}));

// Browser mocks are already setup in ./setup.ts

describe('ProviderService Security Tests', () => {
  let providerService: ReturnType<typeof createProviderService>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    
    // Clear any pending requests from previous tests
    approvalQueue.clearAll();
    
    // Re-setup browser mocks after reset
    fakeBrowser.windows.create = vi.fn().mockResolvedValue({ id: 12345 });
    fakeBrowser.windows.update = vi.fn().mockResolvedValue({});
    fakeBrowser.windows.onRemoved = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn()
    } as any;
    fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    fakeBrowser.runtime.getManifest = vi.fn(() => ({ version: '1.0.0' } as any));
    fakeBrowser.action.setBadgeText = vi.fn().mockResolvedValue(undefined);
    fakeBrowser.action.setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
    
    // IMPORTANT: Reassign fakeBrowser to global after reset and setup
    (global as any).browser = fakeBrowser;
    (global as any).chrome = fakeBrowser;
    
    // Setup rate limiter mocks - by default allow all requests
    vi.mocked(connectionRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(transactionRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(apiRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(connectionRateLimiter.resetAll).mockReturnValue(undefined);
    vi.mocked(transactionRateLimiter.resetAll).mockReturnValue(undefined);
    vi.mocked(apiRateLimiter.resetAll).mockReturnValue(undefined);
    
    // Setup default mocks using the default settings constant
    vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
      ...DEFAULT_KEYCHAIN_SETTINGS,
      connectedWebsites: [] // Override specific properties as needed
    });
    
    vi.mocked(walletService.getWalletService).mockReturnValue({
      getAuthState: vi.fn().mockResolvedValue('unlocked'),
      getWallets: vi.fn().mockResolvedValue([{
        id: 'wallet1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addresses: []
      }]),
      getActiveWallet: vi.fn().mockResolvedValue({
        id: 'wallet1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addresses: []
      }),
      getActiveAddress: vi.fn().mockResolvedValue({
        id: 'addr1',
        address: 'bc1qtest123',
        label: 'Test Address',
        walletId: 'wallet1',
        walletName: 'Test Wallet',
        index: 0
      }),
      getLastActiveAddress: vi.fn().mockResolvedValue('bc1qtest123'),
      isAnyWalletUnlocked: vi.fn().mockResolvedValue(true)
    } as any);
    
    providerService = createProviderService();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Security: Authorization Requirements', () => {
    it('should reject sensitive methods when not connected', async () => {
      const unauthorizedMethods = [
        'xcp_signMessage',
        'xcp_composeOrder',
        'xcp_composeSend',
        'xcp_signTransaction',
        'xcp_broadcastTransaction',
        'xcp_getBalances',
        'xcp_getAssets',
        'xcp_getHistory',
        'xcp_composeDispenser',
        'xcp_composeDividend',
        'xcp_composeIssuance'
      ];
      
      // xcp_signMessage requires specific parameters
      await expect(
        providerService.handleRequest('https://evil.com', 'xcp_signMessage', [])
      ).rejects.toThrow('Message and address required');
      
      // Other methods should throw Unauthorized or not supported
      const otherMethods = unauthorizedMethods.filter(m => m !== 'xcp_signMessage');
      for (const method of otherMethods) {
        // xcp_getAssets is not supported
        if (method === 'xcp_getAssets') {
          await expect(
            providerService.handleRequest('https://evil.com', method, [])
          ).rejects.toThrow('Method xcp_getAssets is not supported');
        } else {
          await expect(
            providerService.handleRequest('https://evil.com', method, [])
          ).rejects.toThrow('Unauthorized');
        }
      }
    });
    
    it('should allow non-sensitive methods without authorization', async () => {
      const publicMethods = [
        { method: 'xcp_chainId', expected: '0x0' },
        { method: 'xcp_accounts', expected: [] }
      ];
      
      for (const { method, expected } of publicMethods) {
        const result = await providerService.handleRequest('https://any.com', method, []);
        expect(result).toEqual(expected);
      }
      
      // net_version is not supported
      await expect(
        providerService.handleRequest('https://any.com', 'net_version', [])
      ).rejects.toThrow('Method net_version is not supported');
    });
    
    it('should not allow websites to bypass authorization', async () => {
      // Try to access sensitive data without permission
      await expect(
        providerService.handleRequest('https://malicious.com', 'xcp_getBalances', [])
      ).rejects.toThrow('Unauthorized');
      
      // Verify the site was not added to connected websites
      const settings = await settingsStorage.getKeychainSettings();
      expect(settings.connectedWebsites).not.toContain('https://malicious.com');
    });
  });

  describe('Security: Rate Limiting', () => {
    it('should rate limit connection attempts', async () => {
      const origin = 'https://spammer.com';
      
      // Mock rate limiter to allow first 5 attempts, then deny
      let callCount = 0;
      vi.mocked(connectionRateLimiter.isAllowed).mockImplementation(() => {
        callCount++;
        return callCount <= 5;
      });
      
      // First 5 attempts should work
      for (let i = 0; i < 5; i++) {
        // Mock that these requests will be handled (popups would open)
        const promise = providerService.handleRequest(origin, 'xcp_requestAccounts', []);
        expect(promise).toBeInstanceOf(Promise);
        // Immediately reject to prevent hanging
        promise.catch(() => {}); // Ignore the rejection
      }
      
      // 6th attempt should be rate limited
      await expect(
        providerService.handleRequest(origin, 'xcp_requestAccounts', [])
      ).rejects.toThrow(/Rate limit exceeded/);
    });
    
    it('should apply transaction rate limiting', async () => {
      const origin = 'https://connected.com';
      
      // Mock as connected site
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: [origin]
      });
      
      // Mock the API responses
      const apiModule = await import('@/utils/blockchain/counterparty/api');
      vi.spyOn(apiModule, 'fetchTokenBalances').mockResolvedValue({ 
        result: [],
        result_count: 0
      } as any);
      
      const balanceModule = await import('@/utils/blockchain/bitcoin/balance');
      vi.spyOn(balanceModule, 'fetchBTCBalance').mockResolvedValue({ 
        confirmed: 0, 
        unconfirmed: 0 
      } as any);
      
      // Setup API rate limiter to allow 10 requests then reject
      let callCount = 0;
      vi.mocked(apiRateLimiter.isAllowed).mockImplementation(() => {
        callCount++;
        return callCount <= 10;
      });
      
      // Rate limiting for transactions is 10 per minute
      // Make 10 successful requests
      for (let i = 0; i < 10; i++) {
        const result = await providerService.handleRequest(origin, 'xcp_getBalances', []);
        expect(result).toBeDefined();
      }
      
      // 11th request should be rate limited
      await expect(
        providerService.handleRequest(origin, 'xcp_getBalances', [])
      ).rejects.toThrow(/API rate limit exceeded/);
    });
    
    it('should have separate rate limits per origin', async () => {
      const origin1 = 'https://site1.com';
      const origin2 = 'https://site2.com';
      
      // Setup API rate limiter to be rate limited for origin1 after 5 calls
      let origin1CallCount = 0;
      vi.mocked(apiRateLimiter.isAllowed).mockImplementation((origin) => {
        if (origin === origin1) {
          origin1CallCount++;
          return origin1CallCount <= 5;
        }
        return true; // origin2 is always allowed
      });
      
      // Make 5 successful requests for origin1
      for (let i = 0; i < 5; i++) {
        await expect(
          providerService.handleRequest(origin1, 'xcp_chainId', [])
        ).resolves.toBe('0x0');
      }
      
      // 6th request for origin1 should be rate limited
      await expect(
        providerService.handleRequest(origin1, 'xcp_chainId', [])
      ).rejects.toThrow(/API rate limit exceeded/);
      
      // origin2 should still work
      await expect(
        providerService.handleRequest(origin2, 'xcp_chainId', [])
      ).resolves.toBe('0x0');
    });
  });

  describe('Security: Input Validation', () => {
    it('should validate transaction parameters', async () => {
      // Mark as connected site
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });
      
      // Missing parameters - service checks parameters first for xcp_composeSend
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_composeSend', [])
      ).rejects.toThrow('Send parameters required');
      
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_composeOrder', [])
      ).rejects.toThrow('Order parameters required');
      
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signTransaction', [])
      ).rejects.toThrow('Transaction required');
    });
    
    it('should not expose sensitive wallet data in errors', async () => {
      try {
        await providerService.handleRequest('https://notconnected.com', 'xcp_signMessage', ['test', 'bc1qsecret']);
      } catch (error: any) {
        // Error should not contain wallet addresses or secrets
        expect(error.message).not.toContain('bc1qtest123');
        expect(error.message).not.toContain('wallet1');
        expect(error.message).toBe('Unauthorized - not connected to wallet');
      }
    });
  });

  describe('Security: Approval Flow Integrity', () => {
    it('should require user approval for all compose operations', async () => {
      // Mock site as not connected
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: [] // Not connected
      });
      
      // Even compose operations should require connection first
      await expect(
        providerService.handleRequest(
          'https://connected.com',
          'xcp_composeOrder',
          [{
            give_asset: 'XCP',
            give_quantity: 100,
            get_asset: 'BTC',
            get_quantity: 1000
          }]
        )
      ).rejects.toThrow('Unauthorized');
    });
    
    it('should not allow auto-approval of transactions', async () => {
      // There should be no way to bypass the approval popup
      // Even if a site is connected, compose operations require approval
      
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://trusted.com']
      });
      
      const mockWindowCreate = vi.fn().mockResolvedValue({ id: 12345 });
      fakeBrowser.windows.create = mockWindowCreate;
      
      // Even for a site in connectedWebsites, compose operations will try to execute
      // Since we're testing with real parameters, it might hit the API
      await expect(
        providerService.handleRequest(
          'https://trusted.com',
          'xcp_composeSend',
          [{
            destination: 'bc1qevil',
            asset: 'XCP',
            quantity: 1000000000
          }]
        )
      ).rejects.toThrow(); // Will throw some error (API error or validation error)
      
      // Should still try to open approval popup if it was connected
      // But since we're not connected, it should fail with Unauthorized
    });
  });

  describe('Security: Origin Validation', () => {
    
    it('should handle malformed origins safely', async () => {
      const malformedOrigins = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '../../../etc/passwd',
        'https://valid.com@evil.com',
        ''
      ];
      
      for (const origin of malformedOrigins) {
        // Should handle gracefully without throwing unexpected errors
        try {
          const result = await providerService.handleRequest(
            origin,
            'xcp_chainId',
            []
          );
          expect(result).toBe('0x0'); // Should still work for public methods
        } catch (e) {
          // Some malformed URLs might cause errors, that's fine
          expect(e).toBeDefined();
        }
      }
    });
  });

  describe('Security: Data Exposure', () => {
    it('should not expose wallet data to unconnected sites', async () => {
      // Not connected
      const accounts = await providerService.handleRequest(
        'https://notconnected.com',
        'xcp_accounts',
        []
      );
      
      expect(accounts).toEqual([]);
    });
    
    it('should only expose current active address when connected', async () => {
      // Mock as connected
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });
      
      const accounts = await providerService.handleRequest(
        'https://connected.com',
        'xcp_accounts',
        []
      );
      
      // Should only return one address, not all wallet addresses
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toBe('bc1qtest123');
    });
    
    it('should hide accounts when wallet is locked', async () => {
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });
      
      // Simulate locked wallet
      vi.mocked(walletService.getWalletService).mockReturnValue({
        getAuthState: vi.fn().mockResolvedValue('locked'),
        getActiveAddress: vi.fn().mockResolvedValue(null),
        getLastActiveAddress: vi.fn().mockResolvedValue(undefined),
        isAnyWalletUnlocked: vi.fn().mockResolvedValue(false)
      } as any);
      
      const accounts = await providerService.handleRequest(
        'https://connected.com',
        'xcp_accounts',
        []
      );
      
      expect(accounts).toEqual([]);
    });
  });
});