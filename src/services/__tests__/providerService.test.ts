import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Mock webext-bridge completely before any imports that use it
vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn()
}));

// Mock webext-bridge popup module that might be imported
vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn()
}));

// Mock webext-bridge content-script module 
vi.mock('webext-bridge/content-script', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn()
}));

import { createProviderService } from '../providerService';
import * as walletService from '../walletService';
import * as settingsStorage from '@/utils/storage';
import * as approvalQueue from '@/utils/provider/approvalQueue';
import * as rateLimiter from '@/utils/provider/rateLimiter';
import * as fathom from '@/utils/fathom';
import * as replayPrevention from '@/utils/security/replayPrevention';
import * as cspValidation from '@/utils/security/cspValidation';

// Mock the imports
vi.mock('../walletService');
vi.mock('@/utils/storage/settingsStorage');
vi.mock('@/utils/provider/approvalQueue');
vi.mock('@/utils/provider/rateLimiter');
vi.mock('@/utils/fathom', () => ({
  sanitizePath: vi.fn((path: string) => path),
  fathom: vi.fn(() => ({
    name: 'fathom',
    setup: vi.fn(),
  })),
  analytics: {
    track: vi.fn().mockResolvedValue(undefined),
    page: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/utils/security/replayPrevention');
vi.mock('@/utils/security/cspValidation');
// Setup fake browser with required APIs
beforeAll(() => {
  // Setup browser.windows.create mock
  fakeBrowser.windows.create = vi.fn().mockResolvedValue({});
  
  // Setup browser.runtime mocks - fakeBrowser methods are not vi mocks
  fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
  fakeBrowser.runtime.getManifest = vi.fn(() => ({ version: '1.0.0' } as any));
  fakeBrowser.runtime.connect = vi.fn(() => ({
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn()
    },
    onDisconnect: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn()
    },
    postMessage: vi.fn(),
    disconnect: vi.fn()
  })) as any;
  
  // Setup browser.action mocks (for badge updates)
  fakeBrowser.action.setBadgeText = vi.fn().mockResolvedValue(undefined);
  fakeBrowser.action.setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
});

describe.skip('ProviderService', () => {
  let providerService: ReturnType<typeof createProviderService>;
  
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    fakeBrowser.reset();
    
    // Re-setup browser mocks after reset
    fakeBrowser.windows.create = vi.fn().mockResolvedValue({});
    fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    fakeBrowser.runtime.getManifest = vi.fn(() => ({ version: '1.0.0' } as any));
    fakeBrowser.action.setBadgeText = vi.fn().mockResolvedValue(undefined);
    fakeBrowser.action.setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
    
    // Setup default mocks using the default settings constant
    vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
      ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
      connectedWebsites: [] // Override specific properties as needed
    });
    
    // Create a comprehensive mock for wallet service
    const mockWalletService = {
      loadWallets: vi.fn().mockResolvedValue(undefined),
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
      setActiveWallet: vi.fn().mockResolvedValue(undefined),
      unlockWallet: vi.fn().mockResolvedValue(undefined),
      lockAllWallets: vi.fn().mockResolvedValue(undefined),
      createMnemonicWallet: vi.fn(),
      createPrivateKeyWallet: vi.fn(),
      addAddress: vi.fn(),
      verifyPassword: vi.fn().mockResolvedValue(true),
      resetAllWallets: vi.fn(),
      updatePassword: vi.fn(),
      updateWalletAddressFormat: vi.fn(),
      updateWalletPinnedAssets: vi.fn(),
      getUnencryptedMnemonic: vi.fn(),
      getPrivateKey: vi.fn(),
      removeWallet: vi.fn(),
      getPreviewAddressForFormat: vi.fn(),
      signTransaction: vi.fn(),
      broadcastTransaction: vi.fn(),
      getLastActiveAddress: vi.fn().mockResolvedValue('bc1qtest123'),
      setLastActiveAddress: vi.fn().mockResolvedValue(undefined),
      setLastActiveTime: vi.fn(),
      isAnyWalletUnlocked: vi.fn().mockResolvedValue(true),
      createAndUnlockMnemonicWallet: vi.fn(),
      createAndUnlockPrivateKeyWallet: vi.fn(),
      // Additional methods used by provider service
      getAuthState: vi.fn().mockResolvedValue('unlocked'),
      getActiveAddress: vi.fn().mockResolvedValue({
        id: 'addr1',
        address: 'bc1qtest123',
        label: 'Test Address',
        walletId: 'wallet1',
        walletName: 'Test Wallet',
        index: 0
      })
    };
    
    vi.mocked(walletService.getWalletService).mockReturnValue(mockWalletService as any);
    
    // Setup settings mocks - default to no connected sites
    // (Already set up above with settingsStorage.DEFAULT_KEYCHAIN_SETTINGS)
    vi.mocked(settingsStorage.updateKeychainSettings).mockResolvedValue(undefined);
    
    // Setup other mocks
    vi.mocked(approvalQueue.approvalQueue.add).mockReturnValue(undefined as any);
    vi.mocked(approvalQueue.approvalQueue.remove).mockReturnValue(true);
    vi.mocked(approvalQueue.approvalQueue.getCurrentWindow).mockReturnValue(null);
    vi.mocked(approvalQueue.approvalQueue.setCurrentWindow).mockReturnValue(undefined);
    vi.mocked(approvalQueue.getApprovalBadgeText).mockReturnValue('');
    
    // Setup rate limiter mocks
    vi.mocked(rateLimiter.connectionRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(rateLimiter.transactionRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(rateLimiter.apiRateLimiter.isAllowed).mockReturnValue(true);
    
    // Setup security mocks  
    vi.mocked(replayPrevention.checkReplayAttempt).mockResolvedValue({ isReplay: false });
    vi.mocked(replayPrevention.withReplayPrevention).mockImplementation(async (fn: any) => fn());
    vi.mocked(cspValidation.analyzeCSP).mockResolvedValue({
      hasCSP: true,
      isSecure: true,
      recommendations: [],
      warnings: [],
      directives: {}
    });
    
    // Analytics mocked in module setup
    
    // Create a fresh instance for each test
    providerService = createProviderService();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleRequest', () => {
    describe('xcp_requestAccounts', () => {
      it('should return accounts if already connected', async () => {
        // Setup: site is already connected
        vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
          ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
          connectedWebsites: ['https://test.com']
        });
        
        const result = await providerService.handleRequest(
          'https://test.com',
          'xcp_requestAccounts',
          []
        );
        
        expect(result).toEqual(['bc1qtest123']);
      });
      
      it('should request permission if not connected', async () => {
        // Mock window.create using fakeBrowser
        const mockWindowCreate = vi.fn().mockResolvedValue({ id: 123 });
        fakeBrowser.windows.create = mockWindowCreate;
        
        // Also mock windows.update and onRemoved since the code uses them
        fakeBrowser.windows.update = vi.fn().mockResolvedValue({});
        fakeBrowser.windows.onRemoved = {
          addListener: vi.fn(),
          removeListener: vi.fn()
        } as any;
        
        // Create a new service instance with the mocked browser
        const localProviderService = createProviderService();
        
        // Start the request promise (but don't await it to avoid timeout)
        const requestPromise = localProviderService.handleRequest(
          'https://newsite.com',
          'xcp_requestAccounts',
          []
        ).catch(() => {}); // Catch the promise to avoid unhandled rejection
        
        // Wait for the approval flow to start
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify popup was opened (URL should match actual implementation)
        expect(mockWindowCreate).toHaveBeenCalledWith({
          url: expect.stringContaining('/popup.html#/provider/approval-queue'),
          type: 'popup',
          width: 350,
          height: 600,
          focused: true
        });
        
        // The test passes if the window was created, indicating permission was requested
        // We don't need to wait for the full approval flow to complete
      });
    });
    
    describe('xcp_accounts', () => {
      it('should return empty array if not connected', async () => {
        const result = await providerService.handleRequest(
          'https://notconnected.com',
          'xcp_accounts',
          []
        );
        
        expect(result).toEqual([]);
      });
      
      it('should return accounts if connected and wallet unlocked', async () => {
        vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
          ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
          connectedWebsites: ['https://connected.com']
        });
        
        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_accounts',
          []
        );
        
        expect(result).toEqual(['bc1qtest123']);
      });
      
      it('should return empty array if wallet is locked', async () => {
        vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
          ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
          connectedWebsites: ['https://connected.com']
        });
        
        // Override specific methods for this test
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        (mockWalletService as any).getAuthState = vi.fn().mockResolvedValue('locked');
        mockWalletService.getActiveAddress = vi.fn().mockResolvedValue(null);
        mockWalletService.getLastActiveAddress = vi.fn().mockResolvedValue(undefined);
        mockWalletService.isAnyWalletUnlocked = vi.fn().mockResolvedValue(false);
        
        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_accounts',
          []
        );
        
        expect(result).toEqual([]);
      });
    });
    
    describe('xcp_chainId', () => {
      it('should return 0x0 for Bitcoin mainnet', async () => {
        const result = await providerService.handleRequest(
          'https://any.com',
          'xcp_chainId',
          []
        );
        
        expect(result).toBe('0x0');
      });
    });
    
    describe('unsupported methods', () => {
      it('should throw error for unsupported method', async () => {
        await expect(
          providerService.handleRequest(
            'https://test.com',
            'unsupported_method',
            []
          )
        ).rejects.toThrow('Method unsupported_method is not supported');
      });
    });
    
    describe('unauthorized requests', () => {
      it('should throw error for unauthorized xcp_signMessage', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signMessage',
            ['message', 'address']
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should throw error for unauthorized xcp_composeOrder', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeOrder',
            [{}]
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should throw error for unauthorized xcp_composeSend', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeSend',
            [{}]
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should throw error for unauthorized xcp_signTransaction', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signTransaction',
            ['rawtx']
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should throw error for unauthorized xcp_broadcastTransaction', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_broadcastTransaction',
            ['signedtx']
          )
        ).rejects.toThrow('Unauthorized');
      });
    });
  });
  
  describe('Phase 2 - Transaction Methods', () => {
    describe('xcp_composeOrder', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeOrder',
            [{
              give_asset: 'XCP',
              give_quantity: 100,
              get_asset: 'BTC',
              get_quantity: 1000,
              expiration: 1000
            }]
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should require active address', async () => {
        vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
          ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
          connectedWebsites: ['https://connected.com']
        });
        
        // Override specific methods for this test  
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.getLastActiveAddress = vi.fn().mockResolvedValue(undefined);
        mockWalletService.getActiveAddress = vi.fn().mockResolvedValue(null);
        
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
        ).rejects.toThrow('No active address');
      });
    });
    
    describe('xcp_composeSend', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeSend',
            [{
              destination: 'bc1qtest',
              asset: 'XCP',
              quantity: 100
            }]
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should require parameters', async () => {
        vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
          ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
          connectedWebsites: ['https://connected.com']
        });
        
        // Override specific methods for this test
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.getLastActiveAddress = vi.fn().mockResolvedValue('bc1qtest123');
        
        await expect(
          providerService.handleRequest(
            'https://connected.com',
            'xcp_composeSend',
            []
          )
        ).rejects.toThrow('Send parameters required');
      });
    });
  });
  
  describe('Phase 3 - Data Methods', () => {
    describe('xcp_getBalances', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_getBalances',
            []
          )
        ).rejects.toThrow('Unauthorized');
      });
      
      it('should require active address', async () => {
        vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
          ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
          connectedWebsites: ['https://connected.com']
        });
        
        // Override specific methods for this test  
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.getLastActiveAddress = vi.fn().mockResolvedValue(undefined);
        mockWalletService.getActiveAddress = vi.fn().mockResolvedValue(null);
        
        await expect(
          providerService.handleRequest(
            'https://connected.com',
            'xcp_getBalances',
            []
          )
        ).rejects.toThrow('No active address');
      });
    });
    
    describe('xcp_getAssets', () => {
      it('should not be supported', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_getAssets',
            []
          )
        ).rejects.toThrow('Method xcp_getAssets is not supported');
      });
    });
    
    describe('xcp_getHistory', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_getHistory',
            []
          )
        ).rejects.toThrow('Unauthorized');
      });
    });
    
    describe('xcp_composeDispenser', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeDispenser',
            [{
              asset: 'TEST',
              give_quantity: 100,
              escrow_quantity: 1000,
              mainchainrate: 100000000
            }]
          )
        ).rejects.toThrow('Unauthorized');
      });
    });
    
    describe('xcp_composeDividend', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeDividend',
            [{
              asset: 'TEST',
              dividend_asset: 'XCP',
              quantity_per_unit: 100000
            }]
          )
        ).rejects.toThrow('Unauthorized');
      });
    });
    
    describe('xcp_composeIssuance', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_composeIssuance',
            [{
              asset: 'TEST',
              quantity: 1000000,
              divisible: true,
              description: 'Test'
            }]
          )
        ).rejects.toThrow('Unauthorized');
      });
    });
  });
  
  describe('isConnected', () => {
    it('should return true if origin is in connected websites', async () => {
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue({
        ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://connected.com']
      });
      
      const result = await providerService.isConnected('https://connected.com');
      expect(result).toBe(true);
    });
    
    it('should return false if origin is not connected', async () => {
      const result = await providerService.isConnected('https://notconnected.com');
      expect(result).toBe(false);
    });
  });
  
  describe('disconnect', () => {
    it('should remove origin from connected websites', async () => {
      const mockSettings = {
        ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://site1.com', 'https://site2.com']
      };
      
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue(mockSettings);
      
      await providerService.disconnect('https://site1.com');
      
      // Should update settings to remove the origin
      expect(settingsStorage.updateKeychainSettings).toHaveBeenCalledWith({
        connectedWebsites: ['https://site2.com']
      });
    });
    
    it('should handle disconnect even if origin was not connected', async () => {
      const mockSettings = {
        ...settingsStorage.DEFAULT_KEYCHAIN_SETTINGS,
        connectedWebsites: ['https://site1.com']
      };
      
      vi.mocked(settingsStorage.getKeychainSettings).mockResolvedValue(mockSettings);
      
      await providerService.disconnect('https://notconnected.com');
      
      // Should update settings but the array stays the same (origin wasn't connected)
      expect(settingsStorage.updateKeychainSettings).toHaveBeenCalledWith({
        connectedWebsites: ['https://site1.com']
      });
    });
  });
});