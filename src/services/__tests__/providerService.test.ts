import { hex } from '@scure/base';
import { Transaction } from '@scure/btc-signer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

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
vi.mock('@/core/hardware/trezorAdapter', () => ({
  getTrezorAdapter: vi.fn(),
  resetTrezorAdapter: vi.fn(),
  TrezorAdapter: vi.fn()
}));


import * as replayPrevention from '@/core/replayPrevention';
import { DEFAULT_SETTINGS } from '@/core/settings';
import * as rateLimiter from '@/platform/provider/rateLimiter';
import * as signFlow from '@/platform/provider/signFlow';
import { walletManager } from '@/platform/walletManager';
import * as updateService from '@/services/updateService';
import * as approvalService from '../approvalService';
import * as connectionService from '../connectionService';
import { createProviderService } from '../providerService';
import * as walletService from '../walletService';

const VALID_PSBT_HEX = '70736274ff01009a0200000002dcdd8cd287d40de3d260ccfc5fa3008f14ff8f13fc840164715cbb2b925874190000000000ffffffff98f9e476f918cc143cf8a6bd09042d1f2ee7c46bfd29c906166613b2d9c516c90000000000ffffffff022202000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e75c12000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e70000000000010055020000000101010101010101010101010101010101010101010101010101010101010101010000000000ffffffff0122020000000000001976a914a3c6b1ee4a49d9f2af3b3802974744fba924164a88ac000000000001011f8813000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e7000000';
const V3_PSBT_HEX = VALID_PSBT_HEX.replace('ff01009a02000000', 'ff01009a03000000');
const listingPsbtHex = (): string => {
  const source = Transaction.fromPSBT(hex.decode(VALID_PSBT_HEX), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
  });
  const listing = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true });
  listing.addInput({ txid: new Uint8Array(32), index: 0 });
  listing.addInput(source.getInput(0));
  listing.addOutput(source.getOutput(0));
  listing.addOutput(source.getOutput(1));
  return hex.encode(listing.toPSBT());
};
const BITCOIN_PAYMENT_INTENT = {
  standard: 'xcp-wallet/bitcoin-payment',
  version: 1,
  action: 'pay',
  outputs: [{
    address: 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq',
    amountSats: 21_600,
  }],
  description: 'Fund Emblem Vault',
  reference: 'vault-63',
} as const;
const MARKETPLACE_LISTING_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'create_listing',
  operationId: 'preflight-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: 'ab'.repeat(32), vout: 4 },
  }],
  seller: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  priceSats: 250_000,
  carrierValueSats: 546,
  guaranteedSellerPaymentSats: 250_546,
  delivery: { mode: 'buyer_selected_detach' },
  signingRequestExpiresAt: 2_000_000_000,
  marketplaceExpiresAt: null,
  bitcoinExpiresAt: null,
} as const;
const MARKETPLACE_ATTACH_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'attach_for_listing',
  operationId: 'attach-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
  seller: 'bc1qtest123',
  assetSource: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  expectedAttachedOutpoint: { txid: 'ac'.repeat(32), vout: 0 },
  carrierAddress: 'bc1qtest123',
  carrierValueSats: 546,
  networkFeeSats: 1_000,
  protocolFee: {
    asset: 'XCP',
    quotedAmountRaw: '25000000',
    actualAmountRaw: null,
    observedBlock: 900_000,
    variableUntilConfirmed: true,
  },
  operationExpiresAt: 2_000_000_000,
} as const;
const MARKETPLACE_BUY_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'buy_listings',
  operationId: 'checkout-1',
  protocolVersion: 'direct_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: 'ab'.repeat(32), vout: 4 },
  }],
  buyer: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  items: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: 'ab'.repeat(32), vout: 4 },
    listingId: 'listing-1',
    seller: 'bc1qtest123',
    carrierValueSats: 546,
    priceSats: 250_000,
    sellerPaymentSats: 250_546,
  }],
  subtotalSats: 250_000,
  networkFeeSats: 2_000,
  platformFeeSats: 0,
  totalSats: 252_000,
  expectedTxid: 'cd'.repeat(32),
  delivery: { mode: 'detached', address: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7' },
  marketplaceExpiresAt: 2_000_003_600,
} as const;
const MARKETPLACE_EXACT_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'authorize_exact_offer',
  operationId: 'authorization-1',
  protocolVersion: 'exact_offer_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: 'ab'.repeat(32), vout: 4 },
  }],
  authorizationId: 'authorization-1',
  bidder: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  seller: 'bc1qtest123',
  priceSats: 250_000,
  carrierValueSats: 546,
  sellerProceedsSats: 250_046,
  networkFeeSats: 500,
  expectedTxid: 'cd'.repeat(32),
  delivery: { mode: 'detached', address: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7' },
  marketplaceExpiresAt: 2_000_003_600,
  bitcoinExpiresAt: null,
  bitcoinInvalidation: {
    type: 'spend_funding_outpoint',
    outpoint: { txid: 'ef'.repeat(32), vout: 1 },
  },
} as const;
const MARKETPLACE_CPFP_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'bump_acceptance_fee',
  operationId: 'authorization-1',
  protocolVersion: 'exact_offer_v1',
  assets: MARKETPLACE_EXACT_INTENT.assets,
  authorizationId: 'authorization-1',
  seller: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  parentExpectedTxid: MARKETPLACE_EXACT_INTENT.expectedTxid,
  childExpectedTxid: 'ee'.repeat(32),
  parentSellerProceedsVout: 1,
  parentSellerProceedsSats: 250_046,
  parentNetworkFeeSats: 500,
  childNetworkFeeSats: 1_000,
  packageFeeSats: 1_500,
  packageFeeRate: 5,
  finalSellerProceedsSats: 249_046,
} as const;
const MARKETPLACE_FANOUT_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_bulk_fanout',
  operationId: 'bulk-1',
  protocolVersion: 'counterparty_bulk_attach_v1',
  assets: [],
  batchIndex: 0,
  seller: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  fundingOutpoint: { txid: '11'.repeat(32), vout: 0 },
  fundingValueSats: 5_000,
  slotCount: 1,
  slotValueSats: 546,
  networkFeeSats: 100,
  changeSats: 4_354,
  expectedTxid: '22'.repeat(32),
  operationExpiresAt: 2_000_000_000,
} as const;

// Mock the imports
vi.mock('../walletService');
vi.mock('../connectionService');
vi.mock('../approvalService');
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
vi.mock('@/core/bitcoin/messageSigner', () => ({
  signMessage: vi.fn().mockResolvedValue({ signature: 'mock-proof-sig', address: 'bc1qtest123' }),
}));
// Partial: the rest of the flow module (request keys, rejoin lookups) must stay real.
vi.mock('@/platform/provider/signFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/provider/signFlow')>()),
  beginSignFlow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/updateService');
vi.mock('@/platform/provider/rateLimiter');
vi.mock('@/platform/fathom', () => ({
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
vi.mock('@/core/replayPrevention');
vi.mock('@/platform/storage/walletStorage', () => ({
  keychainExists: vi.fn().mockResolvedValue(true),
}));
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
    vi.mocked(walletManager.getSettings).mockReturnValue({
      ...DEFAULT_SETTINGS,
      connectedWebsites: [] // Override specific properties as needed
    });
    
    // Create a comprehensive mock for wallet service
    const mockWalletService = {
      refreshWallets: vi.fn().mockResolvedValue(undefined),
      getWallets: vi.fn().mockResolvedValue([{
        id: 'wallet1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addresses: [{ address: 'bc1qtest123', path: "m/84'/0'/0'/0/0", pubKey: '02aa', name: 'Address 1' }]
      }]),
      getActiveWallet: vi.fn().mockResolvedValue({
        id: 'wallet1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addresses: [{ address: 'bc1qtest123', path: "m/84'/0'/0'/0/0", pubKey: '02aa', name: 'Address 1' }]
      }),
      unlockKeychain: vi.fn().mockResolvedValue(undefined),
      lockKeychain: vi.fn().mockResolvedValue(undefined),
      createMnemonicWallet: vi.fn(),
      createPrivateKeyWallet: vi.fn(),
      addAddress: vi.fn(),
      verifyPassword: vi.fn().mockResolvedValue(true),
      resetAllWallets: vi.fn(),
      updatePassword: vi.fn(),
      updateWalletAddressFormat: vi.fn(),
      updateWalletPinnedAssets: vi.fn(),
      getUnencryptedMnemonic: vi.fn(),
      getPrivateKey: vi.fn().mockResolvedValue({ hex: 'deadbeef'.repeat(8), wif: 'test-wif', compressed: true }),
      removeWallet: vi.fn(),
      getPreviewAddressForFormat: vi.fn(),
      getPairedAddresses: vi.fn().mockResolvedValue({
        legacy: { address: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7', pubKey: '02bb', path: "m/44'/0'/0'/0/0", name: 'Legacy', format: 'p2pkh', type: 'p2pkh' },
        segwit: { address: 'bc1qtest123', pubKey: '02aa', path: "m/84'/0'/0'/0/0", name: 'SegWit', format: 'p2wpkh', type: 'p2wpkh' },
      }),
      signTransaction: vi.fn(),
      broadcastTransaction: vi.fn(),
      getLastActiveAddress: vi.fn().mockResolvedValue('bc1qtest123'),
      setLastActiveAddress: vi.fn().mockResolvedValue(undefined),
      setLastActiveTime: vi.fn(),
      isKeychainUnlocked: vi.fn().mockResolvedValue(true),
      // Additional methods used by provider service
      getAuthState: vi.fn().mockResolvedValue('unlocked'),
      getActiveAddress: vi.fn().mockResolvedValue({
        id: 'addr1',
        address: 'bc1qtest123',
        label: 'Test Address',
        walletId: 'wallet1',
        walletName: 'Test Wallet',
        index: 0,
        pubKey: '02aa'
      })
    };
    
    vi.mocked(walletService.getWalletService).mockReturnValue(mockWalletService as any);

    // Mock connection service
    const mockConnectionService = {
      hasPermission: vi.fn().mockResolvedValue(false),
      hasPairedAddressPermission: vi.fn().mockResolvedValue(false),
      requestPairedAddressPermission: vi.fn().mockResolvedValue(undefined),
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

    vi.mocked(signFlow.beginSignFlow).mockResolvedValue(undefined);
    
    // Setup settings mocks - default to no connected sites
    // (Already set up above with DEFAULT_SETTINGS)
    vi.mocked(walletManager.updateSettings).mockResolvedValue(undefined);
    
    // Setup rate limiter mocks
    vi.mocked(rateLimiter.connectionRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(rateLimiter.transactionRateLimiter.isAllowed).mockReturnValue(true);
    vi.mocked(rateLimiter.apiRateLimiter.isAllowed).mockReturnValue(true);
    
    // Setup security mocks  
    vi.mocked(replayPrevention.checkReplayAttempt).mockResolvedValue({ isReplay: false });
    vi.mocked(replayPrevention.withReplayPrevention).mockImplementation(async (fn: any) => fn());
    
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
        ) as any;

        expect(result.accounts).toEqual(['bc1qtest123']);
        expect(result.proof).toBeDefined();
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
          'wallet1',      // activeWallet.id from mock (no hyphen)
          false            // paired addresses are opt-in
        );

        // Should return accounts with proof
        expect((result as any).accounts).toEqual(['bc1qtest123']);
        expect((result as any).proof).toBeDefined();
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
        mockWalletService.isKeychainUnlocked = vi.fn().mockResolvedValue(false);

        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_accounts',
          []
        );

        expect(result).toEqual([]);
      });
    });
    
    describe('xcp_getAddresses', () => {
      it('returns a stable active-only shape without paired permission', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(false);

        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_getAddresses',
          []
        ) as any;

        expect(result).toEqual({
          active: {
            address: 'bc1qtest123',
            publicKey: '02aa',
            type: 'p2wpkh',
          },
        });
        expect(vi.mocked(walletService.getWalletService)().getPairedAddresses).not.toHaveBeenCalled();
      });

      it('returns both formats only with identity-bound paired permission', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_getAddresses',
          []
        ) as any;

        expect(result.active.address).toBe('bc1qtest123');
        expect(result.legacy.address).toBe('1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7');
        expect(result.segwit.address).toBe('bc1qtest123');
        expect(connection.hasPairedAddressPermission).toHaveBeenCalledWith(
          'https://connected.com',
          'wallet1',
          'bc1qtest123'
        );
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
            [{ hex: VALID_PSBT_HEX }]
          )
        ).rejects.toThrow('Unauthorized - not connected to wallet');
      });

      it('should throw error for an unauthorized atomic PSBT bundle', async () => {
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(false);
        const seller = MARKETPLACE_CPFP_INTENT.seller;

        await expect(
          providerService.handleRequest(
            'https://notconnected.com',
            'xcp_signPsbts',
            [{
              requests: [
                {
                  hex: VALID_PSBT_HEX,
                  signInputs: { [seller]: [0] },
                  sighashTypes: [0x01],
                  intent: {
                    ...MARKETPLACE_EXACT_INTENT,
                    action: 'accept_exact_offer',
                    seller,
                  },
                },
                {
                  hex: VALID_PSBT_HEX,
                  signInputs: { [seller]: [0] },
                  sighashTypes: [0x01],
                  intent: MARKETPLACE_CPFP_INTENT,
                },
              ],
            }],
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
            [{ hex: VALID_PSBT_HEX }]
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
      it('rejects the reserved connection-proof namespace before opening approval', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signMessage',
          ['xcp-wallet\norigin:https://target.example\nnonce:forged\nissued:1']
        )).rejects.toThrow('connection-proof namespace');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

      it('should handle xcp_signMessage with proper storage', async () => {
        // Mock connection service to return true
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Mock storage

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
        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://test.com',
            message
            // Note: address is not stored in signMessage requests
          })
        );
      });
    });

    describe('Sign PSBT Request', () => {
      it('rejects an explicitly empty signer map before opening approval', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, signInputs: {} }]
        )).rejects.toThrow('at least one input');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });
      it.each([null, []])('rejects a malformed signer map (%j) before opening approval', async (signInputs) => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, signInputs }]
        )).rejects.toThrow('signInputs must be an address-to-input-indices object');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });
      it('rejects unknown signer addresses before opening approval', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, signInputs: { '1attacker': [0] } }]
        )).rejects.toThrow('not in this wallet');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

      it('rejects a different HD derivation index even when it belongs to the wallet', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        const wallet = vi.mocked(walletService.getWalletService)();
        wallet.getActiveWallet = vi.fn().mockResolvedValue({
          id: 'wallet1',
          name: 'Test Wallet',
          type: 'mnemonic',
          addressFormat: 'p2wpkh',
          addresses: [
            { address: 'bc1qtest123', path: "m/84'/0'/0'/0/0", pubKey: '02aa', name: 'Address 1' },
            { address: 'bc1qotherindex', path: "m/84'/0'/0'/0/1", pubKey: '02cc', name: 'Address 2' },
          ],
        });

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, signInputs: { bc1qotherindex: [0] } }]
        )).rejects.toThrow('not in this wallet');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });
      it('requires paired permission before accepting a sibling-format signer', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(false);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] } }]
        )).rejects.toThrow('Paired Legacy/SegWit address access has not been granted');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

      it('rejects sighash entries beyond the PSBT input count', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, sighashTypes: [0x01, 0x01, 0x01] }]
        )).rejects.toThrow('more entries than the PSBT has inputs');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });
      it('rejects a short sighash override instead of silently falling back', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: VALID_PSBT_HEX, sighashTypes: [0x01] }]
        )).rejects.toThrow('indexed by absolute PSBT input index and is missing entries for inputs: 1');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });
      it('should handle xcp_signPsbt with proper storage', async () => {
        // Mock connection service to return true
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        // Mock storage

        const psbtHex = VALID_PSBT_HEX;

        // Start the request - it will return a promise that waits for events
        providerService.handleRequest(
          'https://test.com',
          'xcp_signPsbt',
          [{ hex: psbtHex }]
        ).catch(() => {}); // Catch as it will try to open popup

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify storage was called
        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://test.com',
            psbtHex
          })
        );
      });

      it('stores a bounded marketplace claim for independent approval proof', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: VALID_PSBT_HEX,
            signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] },
            sighashTypes: [0x83],
            intent: MARKETPLACE_LISTING_INTENT,
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            signingPurpose: 'counterparty',
            marketplaceIntent: MARKETPLACE_LISTING_INTENT,
          })
        );
      });

      it('stores a bounded attach claim without treating its XCP fee quote as authority', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: VALID_PSBT_HEX,
            signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] },
            sighashTypes: [0x01],
            intent: MARKETPLACE_ATTACH_INTENT,
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            signingPurpose: 'counterparty',
            marketplaceIntent: MARKETPLACE_ATTACH_INTENT,
          })
        );
      });

      it('stores a bounded buy-listings claim without granting it origin-based trust', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: VALID_PSBT_HEX,
            signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] },
            sighashTypes: [0x01],
            intent: MARKETPLACE_BUY_INTENT,
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            signingPurpose: 'counterparty',
            marketplaceIntent: MARKETPLACE_BUY_INTENT,
          })
        );
      });

      it('stores a bounded exact-offer claim without granting it origin-based trust', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: VALID_PSBT_HEX,
            signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] },
            sighashTypes: [0x01],
            intent: MARKETPLACE_EXACT_INTENT,
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            signingPurpose: 'counterparty',
            marketplaceIntent: MARKETPLACE_EXACT_INTENT,
          })
        );
      });

      it('rejects an exact-offer PSBT with an incompatible transaction header', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: V3_PSBT_HEX,
            signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] },
            sighashTypes: [0x01],
            intent: MARKETPLACE_EXACT_INTENT,
          }],
        )).rejects.toThrow(
          'exact_offer_v1 requires Bitcoin transaction version 2 with locktime 0',
        );
        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

      it('stores one atomic exact-acceptance plus CPFP signing flow', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);
        const seller = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
        const acceptIntent = {
          ...MARKETPLACE_EXACT_INTENT,
          action: 'accept_exact_offer' as const,
          seller,
        };

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbts',
          [{
            requests: [
              {
                hex: VALID_PSBT_HEX,
                signInputs: { [seller]: [0] },
                sighashTypes: [0x01],
                intent: acceptIntent,
              },
              {
                hex: VALID_PSBT_HEX,
                signInputs: { [seller]: [0] },
                sighashTypes: [0x01],
                intent: MARKETPLACE_CPFP_INTENT,
              },
            ],
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            kind: 'sign-psbts',
            bundleKind: 'acceptance-cpfp',
            items: [
              expect.objectContaining({ marketplaceIntent: acceptIntent }),
              expect.objectContaining({ marketplaceIntent: MARKETPLACE_CPFP_INTENT }),
            ],
          })
        );
      });

      it('stores a bounded homogeneous bulk fan-out phase', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);
        const seller = MARKETPLACE_FANOUT_INTENT.seller;

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbts',
          [{
            requests: [{
              hex: VALID_PSBT_HEX,
              signInputs: { [seller]: [0] },
              sighashTypes: [0x01],
              intent: MARKETPLACE_FANOUT_INTENT,
            }],
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            kind: 'sign-psbts',
            bundleKind: 'bulk-fanout',
            items: [expect.objectContaining({ marketplaceIntent: MARKETPLACE_FANOUT_INTENT })],
          })
        );
      });

      it('permits only the intentional null buyer placeholder in a listing batch', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);
        const seller = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';

        providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbts',
          [{
            requests: [{
              hex: listingPsbtHex(),
              signInputs: { [seller]: [1] },
              sighashTypes: [0x01, 0x83],
              intent: { ...MARKETPLACE_LISTING_INTENT, seller },
            }],
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            bundleKind: 'bulk-listing',
            items: [expect.objectContaining({
              sighashTypes: [0x01, 0x83],
            })],
          })
        );
      });

      describe('xcp_signBitcoinPsbt', () => {
        const paymentParams = {
          hex: VALID_PSBT_HEX,
          signInputs: { '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7': [0] },
          sighashTypes: [0x01],
          intent: BITCOIN_PAYMENT_INTENT,
        };

        it('requires a versioned payment intent before approval', async () => {
          const connection = vi.mocked(connectionService.getConnectionService)();
          connection.hasPermission = vi.fn().mockResolvedValue(true);

          await expect(providerService.handleRequest(
            'https://emblem.finance',
            'xcp_signBitcoinPsbt',
            [{ ...paymentParams, intent: undefined }]
          )).rejects.toThrow('intent must be an object');

          expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
        });

        it('requires an explicit owned-input map', async () => {
          const connection = vi.mocked(connectionService.getConnectionService)();
          connection.hasPermission = vi.fn().mockResolvedValue(true);

          await expect(providerService.handleRequest(
            'https://emblem.finance',
            'xcp_signBitcoinPsbt',
            [{ ...paymentParams, signInputs: undefined }]
          )).rejects.toThrow('require explicit signInputs');

          expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
        });

        it.each([undefined, [0x81], [0x83]])(
          'requires explicit SIGHASH_ALL entries (%j)',
          async (sighashTypes) => {
            const connection = vi.mocked(connectionService.getConnectionService)();
            connection.hasPermission = vi.fn().mockResolvedValue(true);

            await expect(providerService.handleRequest(
              'https://emblem.finance',
              'xcp_signBitcoinPsbt',
              [{ ...paymentParams, sighashTypes }]
            )).rejects.toThrow(/SIGHASH_ALL/);

            expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
          }
        );

        it('still requires normal site connection permission', async () => {
          const connection = vi.mocked(connectionService.getConnectionService)();
          connection.hasPermission = vi.fn().mockResolvedValue(false);

          await expect(providerService.handleRequest(
            'https://emblem.finance',
            'xcp_signBitcoinPsbt',
            [paymentParams]
          )).rejects.toThrow('Unauthorized - not connected to wallet');

          expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
        });

        it('stores the proved-capability context without trusting the origin', async () => {
          const connection = vi.mocked(connectionService.getConnectionService)();
          connection.hasPermission = vi.fn().mockResolvedValue(true);
          connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

          providerService.handleRequest(
            'https://emblem.finance',
            'xcp_signBitcoinPsbt',
            [paymentParams]
          ).catch(() => {});

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
            expect.objectContaining({
              origin: 'https://emblem.finance',
              psbtHex: VALID_PSBT_HEX,
              signInputs: paymentParams.signInputs,
              sighashTypes: [0x01],
              signingPurpose: 'bitcoin-payment',
              bitcoinPaymentIntent: BITCOIN_PAYMENT_INTENT,
            })
          );
        });

        it('preserves permissioned mixed Legacy and SegWit signers in the payment profile', async () => {
          const connection = vi.mocked(connectionService.getConnectionService)();
          connection.hasPermission = vi.fn().mockResolvedValue(true);
          connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

          const segwitAddress = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
          const legacyAddress = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
          const wallet = vi.mocked(walletService.getWalletService)();
          wallet.getActiveAddress = vi.fn().mockResolvedValue({
            id: 'addr1',
            address: segwitAddress,
            label: 'SegWit',
            walletId: 'wallet1',
            walletName: 'Test Wallet',
            index: 0,
            pubKey: '02aa',
          });
          wallet.getActiveWallet = vi.fn().mockResolvedValue({
            id: 'wallet1',
            name: 'Test Wallet',
            type: 'mnemonic',
            addressFormat: 'p2wpkh',
            addresses: [{
              address: segwitAddress,
              path: "m/84'/0'/0'/0/0",
              pubKey: '02aa',
              name: 'SegWit',
            }],
          });
          wallet.getPairedAddresses = vi.fn().mockResolvedValue({
            legacy: {
              address: legacyAddress,
              pubKey: '02bb',
              path: "m/44'/0'/0'/0/0",
              name: 'Legacy',
              format: 'p2pkh',
              type: 'p2pkh',
            },
            segwit: {
              address: segwitAddress,
              pubKey: '02aa',
              path: "m/84'/0'/0'/0/0",
              name: 'SegWit',
              format: 'p2wpkh',
              type: 'p2wpkh',
            },
          });

          const signInputs = {
            [legacyAddress]: [0],
            [segwitAddress]: [1],
          };
          providerService.handleRequest(
            'https://rare-btc-assets.com',
            'xcp_signBitcoinPsbt',
            [{ ...paymentParams, signInputs, sighashTypes: [0x01, 0x01] }]
          ).catch(() => {});

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(connection.hasPairedAddressPermission).toHaveBeenCalledWith(
            'https://rare-btc-assets.com',
            'wallet1',
            segwitAddress
          );
          expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
            expect.objectContaining({
              origin: 'https://rare-btc-assets.com',
              psbtHex: VALID_PSBT_HEX,
              signInputs,
              sighashTypes: [0x01, 0x01],
              signingPurpose: 'bitcoin-payment',
            })
          );
        });
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
          [{ hex: VALID_PSBT_HEX }]
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
            [{ hex: VALID_PSBT_HEX }]
          )
        ).rejects.toThrow('No active address');
      });
    });

  });
});
