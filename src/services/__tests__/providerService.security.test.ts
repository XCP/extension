import './setup'; // Must be first to setup browser mocks
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { apiRateLimiter, connectionRateLimiter, signPopupRateLimiter, transactionRateLimiter } from '@/platform/provider/rateLimiter';
import { walletManager } from '@/platform/walletManager';
import { getApprovalService } from '../approvalService';
import { getConnectionService } from '../connectionService';
import { createProviderService } from '../providerService';
import * as walletService from '../walletService';

// Mock the dependencies

vi.mock('../walletService');
vi.mock('@/platform/walletManager', () => ({
  walletManager: {
    getSettings: vi.fn().mockReturnValue({
      connectedWebsites: [],
      analyticsAllowed: true,
      counterpartyApiBase: 'https://api.counterparty.io',
    }),
    updateSettings: vi.fn(),
  },
}));
vi.mock('@/platform/provider/rateLimiter');
vi.mock('../connectionService');
vi.mock('../approvalService');

// Mock CSP validation to avoid timeout issues

// Browser mocks are already setup in ./setup.ts

describe('ProviderService Security Tests', () => {
  let providerService: ReturnType<typeof createProviderService>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    
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
    vi.mocked(signPopupRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(apiRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(connectionRateLimiter.resetAll).mockReturnValue(undefined);
    vi.mocked(transactionRateLimiter.resetAll).mockReturnValue(undefined);
    vi.mocked(apiRateLimiter.resetAll).mockReturnValue(undefined);
    
    // Setup default mocks using the default settings constant
    vi.mocked(walletManager.getSettings).mockReturnValue({
      ...DEFAULT_SETTINGS,
      connectedWebsites: [] // Override specific properties as needed
    });
    
    vi.mocked(walletService.getWalletService).mockReturnValue({
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
      isKeychainUnlocked: vi.fn().mockResolvedValue(true)
    } as any);
    
    
    // Setup connection service mocks - will be updated per test
    const mockConnectionService = {
      hasPermission: vi.fn().mockImplementation(async (origin: string) => {
        const settings = walletManager.getSettings();
        return settings.connectedWebsites?.includes(origin) || false;
      }),
      requestPermission: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(getConnectionService).mockReturnValue(mockConnectionService as any);
    
    
    // Setup approval service mocks
    const mockApprovalService = {
      requestApproval: vi.fn().mockRejectedValue(new Error('Unauthorized')),
    };
    vi.mocked(getApprovalService).mockReturnValue(mockApprovalService as any);
    
    providerService = createProviderService();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Security: Authorization Requirements', () => {
    it('should reject sensitive methods when not connected', async () => {
      const unauthorizedMethods = [
        'xcp_signMessage',
        'xcp_signTransaction',
        'xcp_broadcastTransaction',
        'xcp_getBalances',
        'xcp_getAssets',
        'xcp_getHistory',
        'xcp_signPsbt'
      ];

      // xcp_signMessage requires specific parameters
      await expect(
        providerService.handleRequest('https://evil.com', 'xcp_signMessage', [])
      ).rejects.toThrow('Message is required');

      // Other methods should throw Unauthorized or not supported, or parameter validation errors
      const otherMethods = unauthorizedMethods.filter(m => m !== 'xcp_signMessage');
      for (const method of otherMethods) {
        if (method === 'xcp_getAssets') {
          // xcp_getAssets is not supported
          await expect(
            providerService.handleRequest('https://evil.com', method, [])
          ).rejects.toThrow('Method xcp_getAssets is not supported');
        } else if (method === 'xcp_signTransaction') {
          // xcp_signTransaction requires hex parameter
          await expect(
            providerService.handleRequest('https://evil.com', method, [])
          ).rejects.toThrow('Transaction hex is required');
        } else if (method === 'xcp_getHistory') {
          // xcp_getHistory has a special privacy error message
          await expect(
            providerService.handleRequest('https://evil.com', method, [])
          ).rejects.toThrow('Permission denied - transaction history not available through provider');
        } else if (method === 'xcp_signPsbt') {
          // xcp_signPsbt requires object with hex parameter
          await expect(
            providerService.handleRequest('https://evil.com', method, [])
          ).rejects.toThrow('PSBT parameters must be an object with hex property');
        } else {
          // Other methods check authorization first
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
      ).rejects.toThrow('Unsupported method: net_version');
    });
    
    it('should not allow websites to bypass authorization', async () => {
      // Try to access sensitive data without permission
      await expect(
        providerService.handleRequest('https://malicious.com', 'xcp_getBalances', [])
      ).rejects.toThrow('Unauthorized');
      
      // Verify the site was not added to connected websites
      const settings = walletManager.getSettings();
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
    
    it('should surface balance API failures instead of returning zero balances', async () => {
      const origin = 'https://connected.com';
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: [origin]
      });

      const balanceModule = await import('@/core/bitcoin/balance');
      vi.spyOn(balanceModule, 'fetchBTCBalance').mockRejectedValue(new Error('upstream unavailable'));

      await expect(
        providerService.handleRequest(origin, 'xcp_getBalances', [])
      ).rejects.toThrow('Unable to fetch wallet balances');
    });

    it('should fetch XCP directly instead of paging every asset balance', async () => {
      const origin = 'https://connected.com';
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: [origin]
      });

      const balanceModule = await import('@/core/bitcoin/balance');
      vi.spyOn(balanceModule, 'fetchBTCBalance').mockResolvedValue(1250);
      const apiModule = await import('@/core/counterparty/api');
      const fetchXcp = vi.spyOn(apiModule, 'fetchTokenBalance').mockResolvedValue({
        asset: 'XCP',
        quantity: '1050000000' as any,
        quantity_normalized: '10.5' as any,
        asset_info: {
          asset_longname: null,
          description: '',
          issuer: '',
          divisible: true,
          locked: false
        }
      });

      await expect(
        providerService.handleRequest(origin, 'xcp_getBalances', [])
      ).resolves.toMatchObject({ address: expect.any(String), xcp: '10.5' });
      expect(fetchXcp).toHaveBeenCalledWith(expect.any(String), 'XCP', {
        verbose: true,
        type: 'address'
      });
    });

    it('should fail closed when the XCP balance API is unavailable', async () => {
      const origin = 'https://connected.com';
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: [origin]
      });

      const balanceModule = await import('@/core/bitcoin/balance');
      vi.spyOn(balanceModule, 'fetchBTCBalance').mockResolvedValue(1250);
      const apiModule = await import('@/core/counterparty/api');
      vi.spyOn(apiModule, 'fetchTokenBalance').mockRejectedValue(new Error('upstream unavailable'));

      await expect(
        providerService.handleRequest(origin, 'xcp_getBalances', [])
      ).rejects.toThrow('Unable to fetch wallet balances');
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
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });

      // Missing parameters - service checks parameters first for xcp_signPsbt
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signPsbt', [])
      ).rejects.toThrow('PSBT parameters must be an object with hex property');

      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signTransaction', [])
      ).rejects.toThrow('Transaction hex is required');

      // xcp_broadcastTransaction requires a signed transaction
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_broadcastTransaction', [])
      ).rejects.toThrow('Signed transaction is required');
    });
    
    it('should validate parameter types for signing methods', async () => {
      // Mark as connected site
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });

      // xcp_signMessage: message must be a string
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signMessage', [{ notAString: true }])
      ).rejects.toThrow('Message must be a string');

      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signMessage', [123])
      ).rejects.toThrow('Message must be a string');

      // xcp_signMessage: address must be a string if provided
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signMessage', ['valid message', { notAString: true }])
      ).rejects.toThrow('Address must be a string');

      // xcp_signPsbt: params must be an object
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signPsbt', ['not an object'])
      ).rejects.toThrow('PSBT parameters must be an object with hex property');

      // xcp_signPsbt: hex must be a string
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_signPsbt', [{ hex: 12345 }])
      ).rejects.toThrow('PSBT hex must be a string');

      // xcp_broadcastTransaction: signedTx must be a string
      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_broadcastTransaction', [{ hex: '123' }])
      ).rejects.toThrow('Signed transaction must be a hex string');

      await expect(
        providerService.handleRequest('https://connected.com', 'xcp_broadcastTransaction', [12345])
      ).rejects.toThrow('Signed transaction must be a hex string');
    });

    it('should not expose sensitive wallet data in errors', async () => {
      const error = await providerService
        .handleRequest('https://notconnected.com', 'xcp_signMessage', ['test', 'bc1qsecret'])
        .then(() => null, (reason: unknown) => reason);

      // It must be refused; a request that succeeded has no error message to check.
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe(PROVIDER_ERROR_CODES.UNAUTHORIZED);
      // Error should not contain wallet addresses or secrets
      expect((error as Error).message).toBe('Unauthorized - not connected to wallet');
      expect((error as Error).message).not.toContain('bc1qtest123');
      expect((error as Error).message).not.toContain('wallet1');
    });
  });

  describe('Security: Approval Flow Integrity', () => {
    it('should require user approval for signing operations', async () => {
      // Mock site as not connected
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: [] // Not connected
      });

      // Signing operations should require connection first
      await expect(
        providerService.handleRequest(
          'https://connected.com',
          'xcp_signPsbt',
          [{ hex: '70736274ff0100' }]
        )
      ).rejects.toThrow('Unauthorized');
    });

    it('should require authorization for broadcast operations', async () => {
      // Mock site as not connected
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: [] // Not connected
      });

      // Even broadcast should require connection
      await expect(
        providerService.handleRequest(
          'https://untrusted.com',
          'xcp_broadcastTransaction',
          ['0100000001...']
        )
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('Security: Origin Validation', () => {
    
    it('should handle malformed origins safely', async () => {
      // The proxy only ever passes an origin Chrome vouched for, so these never arrive from a
      // page; this pins what the service does if one did: public constants still answer, and
      // nothing about the wallet does, since no such origin can hold a grant.
      const malformedOrigins = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '../../../etc/passwd',
        'https://valid.com@evil.com',
        ''
      ];

      for (const origin of malformedOrigins) {
        await expect(providerService.handleRequest(origin, 'xcp_chainId', []), origin).resolves.toBe('0x0');
        await expect(providerService.handleRequest(origin, 'xcp_accounts', []), origin).resolves.toEqual([]);
        await expect(providerService.handleRequest(origin, 'xcp_getBalances', []), origin)
          .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.UNAUTHORIZED });
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
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });
      
      const accounts = await providerService.handleRequest(
        'https://connected.com',
        'xcp_accounts',
        []
      ) as string[];

      // Should only return one address, not all wallet addresses
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toBe('bc1qtest123');
    });
    
    it('should hide accounts when wallet is locked', async () => {
      vi.mocked(walletManager.getSettings).mockReturnValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });
      
      // Simulate locked wallet
      vi.mocked(walletService.getWalletService).mockReturnValue({
        getActiveAddress: vi.fn().mockResolvedValue(null),
        getLastActiveAddress: vi.fn().mockResolvedValue(undefined),
        isKeychainUnlocked: vi.fn().mockResolvedValue(false)
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
