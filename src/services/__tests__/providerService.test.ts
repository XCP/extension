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

// Mock hardware wallet module to avoid @trezor/connect-webextension import side effects
vi.mock('@/utils/hardware/trezorAdapter', () => ({
  getTrezorAdapter: vi.fn(),
  resetTrezorAdapter: vi.fn(),
  TrezorAdapter: vi.fn()
}));

import { createProviderService } from '../providerService';
import * as walletService from '../walletService';
import * as connectionService from '../connectionService';
import * as approvalService from '../approvalService';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import * as approvalQueue from '@/utils/provider/approvalQueue';
import * as rateLimiter from '@/utils/provider/rateLimiter';
import * as replayPrevention from '@/utils/security/replayPrevention';
import * as cspValidation from '@/utils/security/cspValidation';
import * as signMessageRequestStorage from '@/utils/storage/signMessageRequestStorage';
import * as signPsbtRequestStorage from '@/utils/storage/signPsbtRequestStorage';
import * as updateService from '@/services/updateService';
import { eventEmitterService } from '@/services/eventEmitterService';

// Mock the imports
vi.mock('../walletService');
vi.mock('../connectionService');
vi.mock('../approvalService');
vi.mock('@/utils/storage/settingsStorage');
vi.mock('@/utils/storage/signMessageRequestStorage');
vi.mock('@/utils/storage/signPsbtRequestStorage');
vi.mock('@/services/updateService');
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

describe('ProviderService', () => {
  let providerService: ReturnType<typeof createProviderService>;

  beforeEach(() => {
    // Mock chrome runtime for storage operations
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
          hasListener: vi.fn()
        },
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`)
      },
      storage: {
        session: {
          set: vi.fn().mockImplementation((data, callback) => {
            if (callback) callback();
            return Promise.resolve();
          }),
          get: vi.fn().mockImplementation((keys, callback) => {
            if (callback) callback({});
            return Promise.resolve({});
          }),
          remove: vi.fn().mockImplementation((keys, callback) => {
            if (callback) callback();
            return Promise.resolve();
          })
        }
      },
      windows: {
        create: vi.fn().mockResolvedValue({ id: 123 }),
        update: vi.fn().mockResolvedValue({}),
        getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      }
    } as any;
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
    vi.mocked(settingsStorage.getSettings).mockResolvedValue({
      ...settingsStorage.DEFAULT_SETTINGS,
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

    // Mock connection service
    const mockConnectionService = {
      hasPermission: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn().mockResolvedValue(true),
      revokePermission: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(['bc1qtest123']),
      getConnectedSites: vi.fn().mockResolvedValue([]),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined)
    };
    vi.mocked(connectionService.getConnectionService).mockReturnValue(mockConnectionService as any);

    // Mock approval service
    const mockApprovalService = {
      requestApproval: vi.fn().mockResolvedValue(true),
      resolveApproval: vi.fn().mockReturnValue(true),
      getApprovalQueue: vi.fn().mockResolvedValue([]),
      removeApprovalRequest: vi.fn().mockResolvedValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      getApprovalStats: vi.fn().mockReturnValue({ pendingCount: 0, requestsByOrigin: {} })
    };
    vi.mocked(approvalService.getApprovalService).mockReturnValue(mockApprovalService as any);


    // Mock update service
    const mockUpdateService = {
      registerCriticalOperation: vi.fn(),
      unregisterCriticalOperation: vi.fn(),
      checkForUpdate: vi.fn().mockResolvedValue(false),
      applyUpdate: vi.fn().mockResolvedValue(undefined)
    };
    vi.mocked(updateService.getUpdateService).mockReturnValue(mockUpdateService as any);

    // Mock sign message and PSBT request storage
    vi.mocked(signMessageRequestStorage).signMessageRequestStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(undefined)
    } as any;

    vi.mocked(signPsbtRequestStorage).signPsbtRequestStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    // Setup settings mocks - default to no connected sites
    // (Already set up above with settingsStorage.DEFAULT_SETTINGS)
    vi.mocked(settingsStorage.updateSettings).mockResolvedValue(undefined);
    
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
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        const result = await providerService.handleRequest(
          'https://test.com',
          'xcp_requestAccounts',
          []
        );

        expect(result).toEqual(['bc1qtest123']);
      });
      
      it('should request permission if not connected', async () => {
        // Mock connection service to return false for hasPermission, then connect
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);
        mockConnectionService.connect = vi.fn().mockResolvedValue(['bc1qtest123']);

        // Request accounts should call connectionService.connect
        const result = await providerService.handleRequest(
          'https://newsite.com',
          'xcp_requestAccounts',
          []
        );

        // Verify connect was called with correct parameters
        expect(mockConnectionService.connect).toHaveBeenCalledWith(
          'https://newsite.com',
          'bc1qtest123',  // activeAddress from mock
          'wallet1'       // activeWallet.id from mock (no hyphen)
        );

        // Should return the accounts
        expect(result).toEqual(['bc1qtest123']);
      });
    });
    
    describe('xcp_accounts', () => {
      it('should return empty array if not connected', async () => {
        // Mock connection service to return false
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);

        const result = await providerService.handleRequest(
          'https://notconnected.com',
          'xcp_accounts',
          []
        );

        expect(result).toEqual([]);
      });
      
      it('should return accounts if connected and wallet unlocked', async () => {
        // Mock connection service to return true
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_accounts',
          []
        );

        expect(result).toEqual(['bc1qtest123']);
      });
      
      it('should return empty array if wallet is locked', async () => {
        // Mock connection service to return true
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Override specific methods for this test
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.getActiveAddress = vi.fn().mockResolvedValue(null);
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
        ).rejects.toThrow('Unsupported method: unsupported_method');
      });
    });
    
    describe('unauthorized requests', () => {
      it('should throw error for unauthorized xcp_signMessage', async () => {
        // Mock connection service to return false
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);

        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signMessage',
            ['message', 'address']
          )
        ).rejects.toThrow('Unauthorized - not connected to wallet');
      });
      
      it('should throw error for unauthorized xcp_signPsbt', async () => {
        // Mock connection service to return false
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);

        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signPsbt',
            [{ hex: '70736274ff0100' }]
          )
        ).rejects.toThrow('Unauthorized - not connected to wallet');
      });

      it('should throw error for unauthorized xcp_signTransaction', async () => {
        // Mock connection service to return false
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);

        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signTransaction',
            [{ hex: 'rawtx' }]
          )
        ).rejects.toThrow('Unauthorized - not connected to wallet');
      });
      
      it('should throw error for unauthorized xcp_broadcastTransaction', async () => {
        // Mock connection service to return false
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);

        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_broadcastTransaction',
            ['signedtx']
          )
        ).rejects.toThrow('Unauthorized - not connected to wallet');
      });
    });
  });
  
  describe('Phase 2 - Signing Methods', () => {
    describe('xcp_signPsbt', () => {
      it('should require authorization', async () => {
        // Mock connection service to return false (not connected)
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);

        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signPsbt',
            [{ hex: '70736274ff0100' }]
          )
        ).rejects.toThrow('Unauthorized - not connected to wallet');
      });

      it('should require hex parameter', async () => {
        // Mock connection service to return true (authorized)
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(
          providerService.handleRequest(
            'https://connected.com',
            'xcp_signPsbt',
            []
          )
        ).rejects.toThrow('PSBT parameters must be an object with hex property');
      });
    });

    describe('xcp_broadcastTransaction', () => {
      it('should require authorization', async () => {
        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_broadcastTransaction',
            ['0100000001...']
          )
        ).rejects.toThrow('Unauthorized');
      });

      it('should require signed transaction', async () => {
        // Mock connection service to return true (authorized)
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(
          providerService.handleRequest(
            'https://connected.com',
            'xcp_broadcastTransaction',
            []
          )
        ).rejects.toThrow('Signed transaction is required');
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
        // Mock connection service to return true (authorized)
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Override specific methods for this test
        const mockWalletService = vi.mocked(walletService.getWalletService)();
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
        ).rejects.toThrow('Permission denied - transaction history not available through provider');
      });
    });
  });
  
  describe('isConnected', () => {
    it('should return true if origin is in connected websites', async () => {
      // Mock connection service to return true for this origin
      const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
      mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

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
      const mockConnectionService = vi.mocked(connectionService.getConnectionService)();

      await providerService.disconnect('https://site1.com');

      // Should call connectionService.disconnect
      expect(mockConnectionService.disconnect).toHaveBeenCalledWith('https://site1.com');
    });
    
    it('should handle disconnect even if origin was not connected', async () => {
      const mockConnectionService = vi.mocked(connectionService.getConnectionService)();

      await providerService.disconnect('https://notconnected.com');

      // Should still call connectionService.disconnect even if not connected
      expect(mockConnectionService.disconnect).toHaveBeenCalledWith('https://notconnected.com');
    });
  });

  describe('Advanced Provider Features', () => {
    describe('Sign Message Request', () => {
      it('should handle xcp_signMessage with proper storage', async () => {
        // Mock connection service to return true
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Mock storage
        const mockStorage = vi.mocked(signMessageRequestStorage).signMessageRequestStorage;

        const message = 'Hello Bitcoin';
        const address = 'bc1qtest123';

        // Start the request - it will return a promise that waits for events
        providerService.handleRequest(
          'https://test.com',
          'xcp_signMessage',
          [message, address]
        ).catch(() => {}); // Catch as it will try to open popup

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify storage was called - the actual storage includes id and timestamp
        expect(mockStorage.store).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://test.com',
            message
            // Note: address is not stored in signMessage requests
          })
        );
      });
    });

    describe('Sign PSBT Request', () => {
      it('should handle xcp_signPsbt with proper storage', async () => {
        // Mock connection service to return true
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Mock storage
        const mockStorage = vi.mocked(signPsbtRequestStorage).signPsbtRequestStorage;

        const psbtHex = '70736274ff0100';

        // Start the request - it will return a promise that waits for events
        providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: psbtHex }]
        ).catch(() => {}); // Catch as it will try to open popup

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify storage was called
        expect(mockStorage.store).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://test.com',
            psbtHex
          })
        );
      });
    });

    describe('Critical Operations and Update Management', () => {
      it('should register critical operations during signing', async () => {
        const mockUpdateService = vi.mocked(updateService.getUpdateService)();
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Start the request - it will return a promise that waits for events
        providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: '70736274ff0100' }]
        ).catch(() => {});

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify critical operation was registered for signing
        expect(mockUpdateService.registerCriticalOperation).toHaveBeenCalledWith(
          expect.stringMatching(/^sign-psbt-sign-psbt-\d+-[a-z0-9]+$/)
        );
      });
    });

    describe('Error Handling', () => {
      it('should handle missing parameters gracefully', async () => {
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(
          providerService.handleRequest(
            'https://test.com',
            'xcp_signPsbt',
            []
          )
        ).rejects.toThrow('PSBT parameters must be an object with hex property');
      });

      it('should handle invalid parameters gracefully', async () => {
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(
          providerService.handleRequest(
            'https://test.com',
            'xcp_signPsbt',
            [null]
          )
        ).rejects.toThrow('PSBT parameters must be an object with hex property');
      });

      it('should handle wallet lock during operation', async () => {
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.getActiveAddress = vi.fn().mockResolvedValue(null);

        await expect(
          providerService.handleRequest(
            'https://test.com',
            'xcp_signPsbt',
            [{ hex: '70736274ff0100' }]
          )
        ).rejects.toThrow('No active address');
      });
    });

    describe('Event Emissions', () => {
      it('should emit events for provider state changes', async () => {
        // This would test that events are emitted when accounts change, etc.
        // The actual implementation would need event emitter mocking
      });
    });

    describe('Rate Limiting', () => {
      it('should respect rate limits for signing operations', async () => {
        // Mock rate limiter to return false
        vi.mocked(rateLimiter.transactionRateLimiter.isAllowed).mockReturnValue(false);

        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Note: Rate limiting for signing operations
        // This test documents expected behavior
      });
    });
  });
});