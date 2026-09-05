import { hex } from '@scure/base';
import { p2tr, Transaction } from '@scure/btc-signer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const session = vi.hoisted(() => ({ generation: 0 }));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => session.generation,
  assertSessionGeneration: (generation: number) => {
    if (generation !== session.generation) throw new Error('Wallet session changed');
  },
}));

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

import { AddressFormat } from '@/core/bitcoin/address';
import { signPSBT } from '@/core/bitcoin/psbt';
import * as replayPrevention from '@/core/replayPrevention';
import { DEFAULT_SETTINGS } from '@/core/settings';
import * as rateLimiter from '@/platform/provider/rateLimiter';
import { rememberSuccessfulBroadcast } from '@/platform/provider/recentBroadcasts';
import * as signFlow from '@/platform/provider/signFlow';
import { walletManager } from '@/platform/walletManager';
import * as updateService from '@/services/updateService';
import * as approvalService from '../approvalService';
import * as connectionService from '../connectionService';
import { eventEmitterService } from '../eventEmitterService';
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
  seller: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
  assetSource: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  expectedAttachedOutpoint: { txid: 'ac'.repeat(32), vout: 0 },
  carrierAddress: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
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
const MARKETPLACE_PREPARE_INTENT = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_asset',
  operationId: 'prepare-1',
  protocolVersion: 'counterparty_prepare_assets_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
  carrierOwner: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
  assetSource: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  expectedAttachedOutpoint: { txid: 'ac'.repeat(32), vout: 0 },
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
    seller: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
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
  seller: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
  priceSats: 250_000,
  carrierValueSats: 546,
  sellerProceedsSats: 250_046,
  networkFeeSats: 500,
  platformFeeSats: 6_250,
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
    getActiveWallet: vi.fn(),
    getSettings: vi.fn().mockReturnValue({
      connectedWebsites: [],
      analyticsAllowed: true,
      counterpartyApiBase: 'https://api.counterparty.io',
    }),
    updateSettings: vi.fn(),
  },
}));
vi.mock('@/core/bitcoin/messageSigner', () => ({
  signMessage: vi.fn().mockResolvedValue({ signature: 'mock-proof-sig', address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty' }),
}));
// Partial: the rest of the flow module (request keys, rejoin lookups) must stay real.
vi.mock('@/platform/provider/signFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/provider/signFlow')>()),
  beginSignFlow: vi.fn().mockResolvedValue(undefined),
  findSafeChangeSigningAddress: vi.fn().mockResolvedValue(null),
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
vi.mock('@/platform/provider/recentBroadcasts', () => ({
  rememberSuccessfulBroadcast: vi.fn().mockResolvedValue(undefined),
}));
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
    session.generation = 0;
    const sessionData: Record<string, unknown> = {};
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
            Object.assign(sessionData, structuredClone(data));
            if (callback) callback();
            return Promise.resolve();
          }),
          get: vi.fn().mockImplementation((keys, callback) => {
            const values = typeof keys === 'string' ? { [keys]: sessionData[keys] } : sessionData;
            const result = structuredClone(values);
            if (callback) callback(result);
            return Promise.resolve(result);
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
      signMessage: vi.fn().mockResolvedValue({signature: 'mock-proof-sig', address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty'}),
      refreshWallets: vi.fn().mockResolvedValue(undefined),
      getWallets: vi.fn().mockResolvedValue([{
        id: 'wallet1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addresses: [{ address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty', path: "m/84'/0'/0'/0/0", pubKey: '02aa', name: 'Address 1' }]
      }]),
      getActiveWallet: vi.fn().mockResolvedValue({
        id: 'wallet1',
        name: 'Test Wallet',
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addresses: [{ address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty', path: "m/84'/0'/0'/0/0", pubKey: '02aa', name: 'Address 1' }]
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
        segwit: { address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty', pubKey: '02aa', path: "m/84'/0'/0'/0/0", name: 'SegWit', format: 'p2wpkh', type: 'p2wpkh' },
      }),
      signTransaction: vi.fn(),
      broadcastTransaction: vi.fn(),
      getLastActiveAddress: vi.fn().mockResolvedValue('bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty'),
      setLastActiveAddress: vi.fn().mockResolvedValue(undefined),
      setLastActiveTime: vi.fn(),
      isKeychainUnlocked: vi.fn().mockResolvedValue(true),
      // Additional methods used by provider service
      getAuthState: vi.fn().mockResolvedValue('unlocked'),
      getActiveAddress: vi.fn().mockResolvedValue({
        id: 'addr1',
        address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
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
      connect: vi.fn().mockResolvedValue(['bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty']),
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

    vi.mocked(signFlow.beginSignFlow).mockImplementation(entry =>
      signFlow.signFlowStorage.store({ ...entry, status: 'pending' }));
    vi.mocked(signFlow.findSafeChangeSigningAddress).mockResolvedValue(null);
    
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('handleRequest', () => {
    describe('xcp_requestAccounts', () => {
      const activeAddress = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
      const siblingAddress = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
      const origin = 'https://test.com';

      beforeEach(async () => {
        const wallet = vi.mocked(walletService.getWalletService)();
        vi.mocked(walletManager.getActiveWallet).mockReturnValue(await wallet.getActiveWallet());
        vi.mocked(walletManager.getSettings).mockReturnValue({
          ...DEFAULT_SETTINGS, connectedWebsites: [origin, 'https://newsite.com'],
          lastActiveAddress: activeAddress,
        });
      });

      const grantPair = () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        vi.mocked(connection.hasPermission).mockResolvedValue(true);
        vi.mocked(connection.hasPairedAddressPermission).mockResolvedValue(true);
        vi.mocked(walletManager.getSettings).mockReturnValue({
          ...walletManager.getSettings(), providerCapabilities: {
            [origin]: { walletId: 'wallet1', address: activeAddress, pairedAddresses: true },
          },
        });
        const wallet = vi.mocked(walletService.getWalletService)();
        vi.mocked(wallet.signMessage).mockImplementation(async (_message, address) => ({
          address, signature: `proof-${address}`,
        }));
        return { connection, wallet };
      };

      it('should return accounts if already connected', async () => {
        // Setup: site is already connected
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);

        const result = await providerService.handleRequest(
          'https://test.com',
          'xcp_requestAccounts',
          []
        ) as any;

        expect(result.accounts).toEqual(['bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty']);
        expect(result.proof).toBeDefined();
        expect(result.proof.verification).toEqual({ method: 'BIP-322', format: 'p2wpkh' });
        const wallet = vi.mocked(walletService.getWalletService)();
        expect(wallet.signMessage).toHaveBeenCalledWith(expect.any(String), activeAddress,
          { walletId: 'wallet1', address: activeAddress });
        expect(wallet.getPrivateKey).not.toHaveBeenCalled();
        expect(wallet.getPairedAddresses).not.toHaveBeenCalled();
      });

      it('returns distinct proofs only for the approved active address and its sibling', async () => {
        const { wallet } = grantPair();
        const result = await providerService.handleRequest(origin, 'xcp_requestAccounts', []) as any;
        expect(result.accounts).toEqual([activeAddress]);
        expect(result.proof).toMatchObject({ address: activeAddress,
          verification: { method: 'BIP-322', format: 'p2wpkh' } });
        expect(result.proofs).toEqual([
          result.proof,
          expect.objectContaining({ address: siblingAddress,
            verification: { method: 'BIP-322', format: 'p2pkh' } }),
        ]);
        expect(new Set(result.proofs.map((proof: { message: string }) => proof.message)).size).toBe(2);
        expect(wallet.signMessage).toHaveBeenCalledWith(expect.any(String), siblingAddress,
          { walletId: 'wallet1', address: activeAddress });
        expect(wallet.getPrivateKey).not.toHaveBeenCalled();
      });

      it.each(['success', 'wrong address', 'declined'] as const)(
        'uses the guarded hardware signer and handles %s', async outcome => {
          const { wallet, connection } = grantPair();
          vi.mocked(connection.hasPairedAddressPermission).mockResolvedValue(false);
          const hardware = { ...walletManager.getActiveWallet()!, id: 'trezor1', type: 'hardware' as const };
          vi.mocked(wallet.getActiveWallet).mockResolvedValue(hardware);
          vi.mocked(walletManager.getActiveWallet).mockReturnValue(hardware);
          if (outcome === 'wrong address') vi.mocked(wallet.signMessage).mockResolvedValue({
            address: siblingAddress, signature: 'wrong-proof',
          });
          if (outcome === 'declined') vi.mocked(wallet.signMessage).mockRejectedValue(new Error('Device declined'));
          const result = await providerService.handleRequest(origin, 'xcp_requestAccounts', []) as any;
          expect(result.accounts).toEqual([activeAddress]);
          if (outcome === 'success') expect(result.proof).toMatchObject({ address: activeAddress,
            verification: { method: 'BIP-137', format: 'legacy_recoverable' } });
          else expect(result.proof).toBeNull();
          expect(wallet.signMessage).toHaveBeenCalledWith(
            expect.stringMatching(/^xcp-wallet\norigin:https:\/\/test\.com\nnonce:[0-9a-f]{16}\nissued:\d+$/),
            activeAddress, { walletId: 'trezor1', address: activeAddress });
          expect(wallet.getPrivateKey).not.toHaveBeenCalled();
          expect(wallet.getPairedAddresses).not.toHaveBeenCalled();
        },
      );

      it.each(['grant lookup', 'pair derivation'] as const)(
        'rejects a wallet switch during %s before signing any proof', async boundary => {
          const { wallet, connection } = grantPair();
          const other = { ...walletManager.getActiveWallet()!, id: 'other-wallet' };
          const switchWallet = () => {
            vi.mocked(wallet.getActiveWallet).mockResolvedValue(other);
            vi.mocked(walletManager.getActiveWallet).mockReturnValue(other);
          };
          if (boundary === 'grant lookup') {
            vi.mocked(connection.hasPairedAddressPermission).mockImplementationOnce(async () => {
              switchWallet();
              return true;
            });
          } else {
            const pair = await wallet.getPairedAddresses();
            vi.mocked(wallet.getPairedAddresses).mockImplementationOnce(async () => {
              switchWallet();
              return pair;
            });
          }
          await expect(providerService.handleRequest(origin, 'xcp_requestAccounts', [])).rejects.toThrow('The active address changed');
          expect(wallet.signMessage).not.toHaveBeenCalled();
        },
      );

      it.each(['lock', 'switch', 'disconnect', 'revoke pair'] as const)(
        'withholds every proof when a pending signature encounters %s', async mutation => {
          const { wallet } = grantPair();
          vi.mocked(wallet.signMessage).mockImplementationOnce(async (_message, address) => {
            if (mutation === 'lock') session.generation++;
            if (mutation === 'switch') vi.mocked(walletManager.getActiveWallet).mockReturnValue({
              ...walletManager.getActiveWallet()!, id: 'other-wallet',
            });
            if (mutation === 'disconnect') vi.mocked(walletManager.getSettings).mockReturnValue({
              ...walletManager.getSettings(), connectedWebsites: [],
            });
            if (mutation === 'revoke pair') vi.mocked(walletManager.getSettings).mockReturnValue({
              ...walletManager.getSettings(), providerCapabilities: {},
            });
            return { address, signature: 'must-not-be-disclosed' };
          });
          await expect(providerService.handleRequest(origin, 'xcp_requestAccounts', [])).rejects.toThrow();
          expect(wallet.signMessage).toHaveBeenCalledTimes(1);
        },
      );

      it('rechecks a grant revoked during the final asynchronous delivery validation', async () => {
        const { wallet } = grantPair();
        vi.mocked(wallet.signMessage).mockImplementation(async (_message, address) => {
          if (address === siblingAddress) vi.mocked(wallet.getActiveWallet).mockImplementationOnce(async () => {
            const active = walletManager.getActiveWallet();
            queueMicrotask(() => vi.mocked(walletManager.getSettings).mockReturnValue({
              ...walletManager.getSettings(), providerCapabilities: {},
            }));
            return active;
          });
          return { address, signature: 'must-not-be-disclosed' };
        });
        await expect(providerService.handleRequest(origin, 'xcp_requestAccounts', [])).rejects.toThrow('Paired address access was revoked');
        expect(wallet.signMessage).toHaveBeenCalledTimes(2);
      });
      
      it('should request permission if not connected', async () => {
        // Mock connection service to return false for hasPermission, then connect
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
        mockConnectionService.connect = vi.fn().mockResolvedValue(['bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty']);

        // Request accounts should call connectionService.connect
        const result = await providerService.handleRequest(
          'https://newsite.com',
          'xcp_requestAccounts',
          []
        );

        // Verify connect was called with correct parameters
        expect(mockConnectionService.connect).toHaveBeenCalledWith(
          'https://newsite.com',
          'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',  // activeAddress from mock
          'wallet1',      // activeWallet.id from mock (no hyphen)
          false            // paired addresses are opt-in
        );

        // Should return accounts with proof
        expect((result as any).accounts).toEqual(['bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty']);
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

        expect(result).toEqual(['bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty']);
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
            address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
            publicKey: '02aa',
            type: 'p2wpkh',
          },
          signing: {
            psbt: {
              supported: true,
              sighashTypes: [0x01, 0x81, 0x83],
              inputScope: 'selected',
              externalInputs: 'any',
            },
            psbtBatch: {
              supported: true,
              sighashTypes: [0x01, 0x83],
              inputScope: 'selected',
              externalInputs: 'any',
              maxRequests: 8,
            },
          },
        });
        expect(vi.mocked(walletService.getWalletService)().getPairedAddresses).not.toHaveBeenCalled();
      });

      it('reports the narrow hardware signing contract without exposing wallet type', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(false);
        const wallet = vi.mocked(walletService.getWalletService)();
        wallet.getActiveWallet = vi.fn().mockResolvedValue({
          id: 'wallet1',
          name: 'Trezor',
          type: 'hardware',
          addressFormat: 'p2wpkh',
          addresses: [],
        } as never);

        const result = await providerService.handleRequest(
          'https://connected.com',
          'xcp_getAddresses',
          [],
        ) as any;

        expect(result.signing).toEqual({
          psbt: {
            supported: true,
            sighashTypes: [0x01],
            inputScope: 'selected',
            externalInputs: 'presigned',
          },
          psbtBatch: {
            supported: true,
            sighashTypes: [0x01],
            inputScope: 'selected',
            externalInputs: 'presigned',
            maxRequests: 8,
          },
        });
        expect(result).not.toHaveProperty('walletType');
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

        expect(result.active.address).toBe('bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty');
        expect(result.legacy.address).toBe('1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7');
        expect(result.segwit.address).toBe('bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty');
        expect(connection.hasPairedAddressPermission).toHaveBeenCalledWith(
          'https://connected.com',
          'wallet1',
          'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty'
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
      it.each(['omitted selection', 'explicit selection', 'explicit DEFAULT'] as const)(
        'admits and signs the same real Taproot DEFAULT PSBT with %s', async mode => {
          const internalKey = hex.decode('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
          const taproot = p2tr(internalKey);
          const tx = new Transaction();
          tx.addInput({ txid: '11'.repeat(32), index: 0, sighashType: 0,
            tapInternalKey: internalKey, witnessUtxo: { script: taproot.script, amount: 100_000n } });
          tx.addOutput({ script: taproot.script, amount: 99_000n });
          const psbtHex = hex.encode(tx.toPSBT());
          const connection = vi.mocked(connectionService.getConnectionService)();
          vi.mocked(connection.hasPermission).mockResolvedValue(true);
          const wallet = vi.mocked(walletService.getWalletService)();
          vi.mocked(wallet.getActiveWallet).mockResolvedValue({
            ...(await wallet.getActiveWallet())!, addressFormat: AddressFormat.P2TR,
          });
          vi.mocked(wallet.getActiveAddress).mockResolvedValue({
            ...(await wallet.getActiveAddress())!, address: taproot.address,
          });
          vi.mocked(signFlow.beginSignFlow).mockRejectedValueOnce(new Error('preflight complete'));
          await expect(providerService.handleRequest('https://test.com', 'xcp_signPsbt', [{
            hex: psbtHex,
            ...(mode === 'omitted selection' ? {} : { signInputs: { [taproot.address]: [0] } }),
            ...(mode === 'explicit DEFAULT' ? { sighashTypes: [0] } : {}),
          }])).rejects.toThrow('preflight complete');
          expect(signFlow.beginSignFlow).toHaveBeenCalledWith(expect.objectContaining({
            signInputs: { [taproot.address]: [0] },
          }));
          const signed = signPSBT(psbtHex, '01'.padStart(64, '0'), [0], AddressFormat.P2TR,
            mode === 'explicit DEFAULT' ? [0] : undefined);
          expect(Transaction.fromPSBT(hex.decode(signed)).getInput(0).tapKeySig).toHaveLength(64);
        },
      );

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

      it('remembers safe wallet-owned outputs before returning a successful broadcast', async () => {
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.broadcastTransaction = vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32) });
        const signedTx = '01000000000000000000';
        vi.mocked(signFlow.findSafeChangeSigningAddress).mockResolvedValue('bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty');

        await providerService.handleRequest(
          'https://connected.com',
          'xcp_broadcastTransaction',
          [signedTx]
        );

        expect(rememberSuccessfulBroadcast).toHaveBeenCalledWith(signedTx, ['bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty']);
      });

      it('does not trust change from a transaction the extension did not safely sign', async () => {
        const mockConnectionService = vi.mocked(connectionService.getConnectionService)();
        mockConnectionService.hasPermission = vi.fn().mockResolvedValue(true);
        const mockWalletService = vi.mocked(walletService.getWalletService)();
        mockWalletService.broadcastTransaction = vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32) });

        await providerService.handleRequest(
          'https://connected.com',
          'xcp_broadcastTransaction',
          ['01000000000000000000']
        );

        expect(rememberSuccessfulBroadcast).not.toHaveBeenCalled();
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
        const address = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';

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
            message,
            address,
            signingAddress: address,
          })
        );
      });

      it('allows a paired sibling to sign without changing the active address', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);
        const pairedLegacy = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';

        providerService.handleRequest(
          'https://test.com',
          'xcp_signMessage',
          ['Hello Bitcoin', pairedLegacy]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(connection.hasPairedAddressPermission).toHaveBeenCalledWith(
          'https://test.com',
          'wallet1',
          'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty'
        );
        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty',
            signingAddress: pairedLegacy,
          })
        );
      });

      it('refuses a paired sibling message signer without paired permission', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(false);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signMessage',
          ['Hello Bitcoin', '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7']
        )).rejects.toThrow('Paired Legacy/SegWit address access has not been granted');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

      it('refuses a message signer outside the active pair', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);

        await expect(providerService.handleRequest(
          'https://test.com',
          'xcp_signMessage',
          ['Hello Bitcoin', '1BoatSLRHtKNngkdXEeobR76b53LETtpyT']
        )).rejects.toThrow('not the active address or its paired sibling');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });
    });

    describe('Sign PSBT Request', () => {
      it('rejects an unsigned external hardware input before opening approval', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        const wallet = vi.mocked(walletService.getWalletService)();
        wallet.getActiveWallet = vi.fn().mockResolvedValue({
          id: 'wallet1',
          name: 'Trezor',
          type: 'hardware',
          addressFormat: 'p2wpkh',
          addresses: [{
            address: 'bc1qtest123',
            path: "m/84'/0'/0'/0/0",
            pubKey: '02aa',
            name: 'Address 1',
          }],
        } as never);

        await expect(providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: VALID_PSBT_HEX,
            signInputs: { bc1qtest123: [0] },
            sighashTypes: [0x01, 0x01],
            intent: MARKETPLACE_PREPARE_INTENT,
          }],
        )).rejects.toThrow('requires external input 1 to be pre-signed');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

      it('rejects an unsupported hardware address format before opening approval', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        const wallet = vi.mocked(walletService.getWalletService)();
        wallet.getActiveWallet = vi.fn().mockResolvedValue({
          id: 'wallet1',
          name: 'Trezor',
          type: 'hardware',
          addressFormat: 'p2tr',
          addresses: [],
        } as never);

        await expect(providerService.handleRequest(
          'https://digirare.com',
          'xcp_signPsbt',
          [{
            hex: VALID_PSBT_HEX,
            signInputs: { bc1qtest123: [0, 1] },
            sighashTypes: [0x01, 0x01],
            intent: MARKETPLACE_PREPARE_INTENT,
          }],
        )).rejects.toThrow('cannot sign PSBTs through the provider');

        expect(signFlow.beginSignFlow).not.toHaveBeenCalled();
      });

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
            { address: 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty', path: "m/84'/0'/0'/0/0", pubKey: '02aa', name: 'Address 1' },
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

      it('stores a bounded price-free prepare-asset claim for independent proof', async () => {
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
            intent: MARKETPLACE_PREPARE_INTENT,
          }]
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            signingPurpose: 'counterparty',
            marketplaceIntent: MARKETPLACE_PREPARE_INTENT,
          })
        );
      });

      it('stores one linked attach-and-list flow for a single approval', async () => {
        const connection = vi.mocked(connectionService.getConnectionService)();
        connection.hasPermission = vi.fn().mockResolvedValue(true);
        connection.hasPairedAddressPermission = vi.fn().mockResolvedValue(true);
        const seller = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
        const listingIntent = {
          ...MARKETPLACE_LISTING_INTENT,
          operationId: 'attach-and-list-1',
          seller,
        };
        const attachIntent = {
          ...MARKETPLACE_ATTACH_INTENT,
          operationId: listingIntent.operationId,
          seller,
          carrierAddress: seller,
          carrierValueSats: listingIntent.carrierValueSats,
          expectedAttachedOutpoint: listingIntent.assets[0].sourceOutpoint,
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
                intent: attachIntent,
              },
              {
                hex: listingPsbtHex(),
                signInputs: { [seller]: [1] },
                sighashTypes: [0x01, 0x83],
                intent: listingIntent,
              },
            ],
          }],
        ).catch(() => {});

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(signFlow.beginSignFlow).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: 'https://digirare.com',
            kind: 'sign-psbts',
            bundleKind: 'attach-and-list',
            items: [
              expect.objectContaining({ marketplaceIntent: attachIntent }),
              expect.objectContaining({ marketplaceIntent: listingIntent }),
            ],
          }),
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
      beforeEach(() => {
        const address = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
        vi.mocked(walletManager.getSettings).mockReturnValue({
          ...DEFAULT_SETTINGS, connectedWebsites: ['https://test.com'], providerCapabilities: {
            'https://test.com': { pairedAddresses: true, walletId: 'wallet1', address },
          },
        });
        vi.mocked(walletManager.getActiveWallet).mockReturnValue({
          id: 'wallet1', name: 'Test Wallet', type: 'mnemonic', addressFormat: 'p2wpkh', addressCount: 1,
          addresses: [{ address, name: 'Address 1', path: "m/84'/0'/0'/0/0", pubKey: '02aa' }],
        });
      });
      describe.each(['live', 'poll', 'recovery'] as const)('%s signature delivery', mode => {
        it.each(['connected', 'revoked', 'paired', 'address', 'wallet', 'locked', 'session', 'late-revoked', 'late-paired', 'continuation-revoked'] as const)(
          'checks authorization after terminal storage when %s', async state => {
            vi.useFakeTimers();
            const origin = 'https://test.com';
            const address = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
            const signingAddress = state.includes('paired') ? '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7' : address;
            const identity = { address, walletId: 'wallet1' };
            const id = `delivery-${mode}-${state}`;
            const connection = vi.mocked(connectionService.getConnectionService)();
            vi.mocked(connection.hasPermission).mockResolvedValue(true);
            vi.mocked(connection.hasPairedAddressPermission).mockResolvedValue(true);
            const wallet = vi.mocked(walletService.getWalletService)();
            await signFlow.beginSignFlow({
              ...identity, origin, id, timestamp: Date.now(), kind: 'sign-message',
              message: 'deliver me', signingAddress,
              requestKey: signFlow.computeRequestKey(origin, 'xcp_signMessage', {
                message: 'deliver me', signingAddress,
              }, identity),
            });
            const storedResult = { signature: 'durable-signature' };
            const reachedStorage = Promise.withResolvers<void>();
            const releaseStorage = Promise.withResolvers<void>();
            if (mode === 'recovery') {
              await signFlow.recordSignOutcome(id, 'completed', storedResult);
              const read = signFlow.signFlowStorage.getAll.bind(signFlow.signFlowStorage);
              vi.spyOn(signFlow.signFlowStorage, 'getAll').mockImplementationOnce(async () => {
                const snapshot = await read();
                reachedStorage.resolve();
                await releaseStorage.promise;
                return snapshot;
              });
            } else {
              const update = signFlow.signFlowStorage.update.bind(signFlow.signFlowStorage);
              vi.spyOn(signFlow.signFlowStorage, 'update').mockImplementationOnce(async (requestId, change) => {
                const result = await update(requestId, change);
                reachedStorage.resolve();
                await releaseStorage.promise;
                return result;
              });
            }
            const delivery = providerService.handleRequest(origin, 'xcp_signMessage', ['deliver me', signingAddress])
              .then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
            let persistence: Promise<signFlow.SignFlowEntry | null> | undefined;
            if (mode !== 'recovery') {
              await vi.waitFor(() => expect(updateService.getUpdateService().registerCriticalOperation)
                .toHaveBeenCalledWith(`sign-message-${id}`));
              persistence = signFlow.recordSignOutcome(id, 'completed', storedResult);
            }
            await reachedStorage.promise;
            if (state === 'revoked') vi.mocked(connection.hasPermission).mockResolvedValue(false);
            if (state === 'paired') vi.mocked(connection.hasPairedAddressPermission).mockResolvedValue(false);
            if (state === 'address') vi.mocked(wallet.getActiveAddress).mockResolvedValue({
              address: 'other-address', pubKey: '02aa', path: "m/84'/0'/0'/0/1", name: 'Other',
            });
            if (state === 'wallet') {
              const activeWallet = await wallet.getActiveWallet();
              if (!activeWallet) throw new Error('Missing fixture wallet');
              vi.mocked(wallet.getActiveWallet).mockResolvedValue({ ...activeWallet, id: 'other-wallet' });
            }
            if (state === 'locked') vi.mocked(wallet.isKeychainUnlocked).mockResolvedValue(false);
            if (state === 'session') session.generation += 1;
            if (state === 'late-revoked' || state === 'late-paired') {
              const activeWallet = await wallet.getActiveWallet();
              vi.mocked(wallet.getActiveWallet).mockImplementationOnce(async () => {
                // The permission reads have returned true. A queued settings
                // mutation runs before the last awaited identity read resumes.
                queueMicrotask(() => vi.mocked(walletManager.getSettings).mockReturnValue({
                  ...DEFAULT_SETTINGS,
                  connectedWebsites: state === 'late-revoked' ? [] : [origin],
                  providerCapabilities: {},
                }));
                return activeWallet;
              });
            }
            if (state === 'continuation-revoked') {
              const granted = walletManager.getSettings();
              vi.mocked(walletManager.getSettings).mockImplementationOnce(() => {
                // The helper's final snapshot is valid, but returning its
                // Promise still yields before the provider resolves the site.
                queueMicrotask(() => vi.mocked(walletManager.getSettings).mockReturnValue({
                  ...granted, connectedWebsites: [], providerCapabilities: {},
                }));
                return granted;
              });
            }
            releaseStorage.resolve();
            await persistence;
            if (mode === 'live') {
              eventEmitterService.emit(`sign-message-complete-${id}`, { signature: 'event-payload-is-not-authoritative' });
            } else if (mode === 'poll') await vi.advanceTimersByTimeAsync(1500);
            const outcome = await delivery;
            if (state === 'connected') expect(outcome).toEqual({ ok: true, value: storedResult.signature });
            else expect(outcome).toMatchObject({ ok: false, error: expect.any(Error) });
            expect(await signFlow.getSignFlow(id)).toMatchObject({ status: 'completed', result: storedResult });
            expect(wallet.signMessage).not.toHaveBeenCalled();
          },
        );
      });

      it.each(['connected', 'revoked', 'locked', 'identity'])('rechecks authorization while recovering a completed signature: %s', async state => {
        const origin = 'https://test.com';
        const address = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
        const identity = { address, walletId: 'wallet1' };
        const connection = vi.mocked(connectionService.getConnectionService)();
        vi.mocked(connection.hasPermission).mockResolvedValue(true);
        const wallet = vi.mocked(walletService.getWalletService)();
        await signFlow.beginSignFlow({
          ...identity, origin, id: 'completed-recovery', timestamp: Date.now(), kind: 'sign-message',
          message: 'recover me', signingAddress: address,
          requestKey: signFlow.computeRequestKey(origin, 'xcp_signMessage', {
            message: 'recover me', signingAddress: address,
          }, identity),
        });
        await signFlow.recordSignOutcome('completed-recovery', 'completed', { signature: 'original-signature' });
        if (state === 'revoked') vi.mocked(connection.hasPermission).mockResolvedValueOnce(true).mockResolvedValue(false);
        if (state === 'locked') vi.mocked(wallet.isKeychainUnlocked).mockResolvedValue(false);
        if (state === 'identity') vi.mocked(wallet.getActiveAddress)
          .mockResolvedValueOnce({ address } as never).mockResolvedValue({ address: 'new-address' } as never);
        const call = providerService.handleRequest(origin, 'xcp_signMessage', ['recover me']);
        if (state === 'connected') {
          await expect(call).resolves.toBe('original-signature');
          expect(await signFlow.getSignFlow('completed-recovery')).toMatchObject({ status: 'completed' });
        } else await expect(call).rejects.toThrow();
        expect(wallet.signMessage).not.toHaveBeenCalled();
      });

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
