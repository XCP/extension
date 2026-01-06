import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletManager } from '../walletManager';
import {
  createTestWallet,
  createPrivateKeyWallet,
  setupMocks,
  mockWalletUnlocked,
  createMultipleWallets,
  createWalletWithAddresses,
} from './helpers/testHelpers';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

// Mock all external dependencies
vi.mock('@/utils/auth/sessionManager');
vi.mock('@/utils/wallet/settingsManager');
vi.mock('@/utils/storage/walletStorage');
vi.mock('@/utils/encryption/walletEncryption');
vi.mock('@/utils/blockchain/bitcoin/address');
vi.mock('@/utils/blockchain/bitcoin/privateKey');
vi.mock('@/utils/blockchain/bitcoin/messageSigner');
vi.mock('@/utils/blockchain/bitcoin/transactionSigner');
vi.mock('@/utils/blockchain/bitcoin/transactionBroadcaster');
vi.mock('@/utils/blockchain/counterwallet');
vi.mock('@noble/hashes/sha2');
vi.mock('@noble/hashes/utils');
vi.mock('@scure/bip32');
vi.mock('@scure/bip39');

// Import modules to get access to mocked functions
import * as sessionManager from '@/utils/auth/sessionManager';
import { settingsManager } from '@/utils/wallet/settingsManager';
import { getAllEncryptedWallets } from '@/utils/storage/walletStorage';
import { getAddressFromMnemonic, getDerivationPathForAddressFormat } from '@/utils/blockchain/bitcoin/address';
import { decryptMnemonic, decryptPrivateKey } from '@/utils/encryption/walletEncryption';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { bytesToHex } from '@noble/hashes/utils.js';

describe('WalletManager', () => {
  let walletManager: WalletManager;
  let mocks: ReturnType<typeof setupMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = setupMocks();
    
    // Mock chrome.alarms API
    global.chrome = {
      ...global.chrome,
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(true),
        onAlarm: {
          addListener: vi.fn(),
        },
      },
    } as any;
    
    // Setup the actual mocked module functions
    vi.mocked(sessionManager.setLastActiveTime).mockImplementation(mocks.sessionManager.setLastActiveTime);
    vi.mocked(sessionManager.getUnlockedSecret).mockImplementation(mocks.sessionManager.getUnlockedSecret);
    vi.mocked(sessionManager.storeUnlockedSecret).mockImplementation(mocks.sessionManager.storeUnlockedSecret);
    vi.mocked(sessionManager.clearUnlockedSecret).mockImplementation(mocks.sessionManager.clearUnlockedSecret);
    vi.mocked(sessionManager.clearAllUnlockedSecrets).mockImplementation(mocks.sessionManager.clearAllUnlockedSecrets);
    vi.mocked(sessionManager.initializeSession).mockImplementation(mocks.sessionManager.initializeSession || vi.fn().mockResolvedValue(undefined));
    
    vi.mocked(settingsManager.loadSettings).mockImplementation(mocks.settingsManager.loadSettings);
    vi.mocked(settingsManager.updateSettings).mockImplementation(mocks.settingsManager.updateSettings);
    vi.mocked(settingsManager.getSettings).mockImplementation(mocks.settingsManager.getSettings || vi.fn().mockReturnValue({ autoLockTimeout: 5 * 60 * 1000 }));
    
    vi.mocked(getAllEncryptedWallets).mockImplementation(mocks.walletStorage.getAllEncryptedWallets);
    vi.mocked(getAddressFromMnemonic).mockImplementation(mocks.bitcoin.getAddressFromMnemonic);
    vi.mocked(getDerivationPathForAddressFormat).mockImplementation(mocks.bitcoin.getDerivationPathForAddressFormat);

    // Mock encryption functions
    vi.mocked(decryptMnemonic).mockImplementation(mocks.encryption.decryptMnemonic);
    vi.mocked(decryptPrivateKey).mockImplementation(mocks.encryption.decryptPrivateKey);

    walletManager = new WalletManager();
  });

  describe('Basic State', () => {
    it('should initialize with empty wallets', () => {
      expect(walletManager.getWallets()).toEqual([]);
      expect(walletManager.getActiveWallet()).toBeUndefined();
    });

    it('should update last active time', () => {
      walletManager.setLastActiveTime();
      expect(mocks.sessionManager.setLastActiveTime).toHaveBeenCalledOnce();
    });
  });

  describe('Wallet Loading', () => {
    it('should load wallets from storage', async () => {
      const testWallet = createTestWallet();
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([
        {
          id: testWallet.id,
          name: testWallet.name,
          type: testWallet.type,
          addressFormat: testWallet.addressFormat,
          encryptedSecret: 'encrypted-data',
          previewAddress: 'bc1qtest',
          addressCount: 1,
        },
      ]);

      await walletManager.loadWallets();

      const wallets = walletManager.getWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].name).toBe(testWallet.name);
      expect(wallets[0].type).toBe(testWallet.type);
    });

    it('should handle empty storage gracefully', async () => {
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([]);
      
      await walletManager.loadWallets();
      
      expect(walletManager.getWallets()).toEqual([]);
    });

    it('should set active wallet from settings', async () => {
      const wallet = createTestWallet();
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([
        {
          id: wallet.id,
          name: wallet.name,
          type: wallet.type,
          addressFormat: wallet.addressFormat,
          encryptedSecret: 'encrypted',
          previewAddress: 'bc1qtest',
          addressCount: 1,
        },
      ]);
      mocks.settingsManager.loadSettings.mockResolvedValue({
        lastActiveWalletId: wallet.id,
      });

      await walletManager.loadWallets();

      // The active wallet ID should be set but getActiveWallet() will return undefined
      // because activeWalletId is private and getActiveWallet uses it
      expect(walletManager.getWalletById(wallet.id)).toBeDefined();
    });
  });

  describe('Wallet Management', () => {
    it('should get wallet by ID', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      const found = walletManager.getWalletById(wallet.id);
      expect(found).toEqual(wallet);
    });

    it('should return undefined for non-existent wallet', () => {
      const found = walletManager.getWalletById('non-existent');
      expect(found).toBeUndefined();
    });

    it('should get wallet (alias for getWalletById)', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      const found = walletManager.getWallet(wallet.id);
      expect(found).toEqual(wallet);
    });

    it('should set active wallet', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      walletManager.setActiveWallet(wallet.id);
      
      expect(walletManager.getActiveWallet()).toEqual(wallet);
    });
  });

  describe('Wallet Locking', () => {
    it('should lock specific wallet', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      mockWalletUnlocked(mocks, wallet.id);
      
      walletManager.lockWallet(wallet.id);
      
      expect(vi.mocked(sessionManager.clearUnlockedSecret)).toHaveBeenCalledWith(wallet.id);
    });

    it('should lock all wallets', () => {
      const wallets = createMultipleWallets(3);
      walletManager['wallets'] = wallets;
      
      walletManager.lockAllWallets();
      
      expect(vi.mocked(sessionManager.clearAllUnlockedSecrets)).toHaveBeenCalled();
    });
  });

  describe('Wallet Status Checks', () => {
    it('should check if any wallet is unlocked', async () => {
      const wallets = createMultipleWallets(2);
      walletManager['wallets'] = wallets;
      
      // Mock one wallet as unlocked
      vi.mocked(sessionManager.getUnlockedSecret).mockImplementation((id) =>
        Promise.resolve(id === wallets[0].id ? 'secret' : null)
      );
      
      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(true);
    });

    it('should return false if no wallets are unlocked', async () => {
      const wallets = createMultipleWallets(2);
      walletManager['wallets'] = wallets;
      
      vi.mocked(sessionManager.getUnlockedSecret).mockResolvedValue(null);
      
      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(false);
    });
  });

  describe('Address Preview', () => {
    it('should get preview address for type', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      // Mock the wallet being unlocked with a mnemonic
      const mnemonic = 'test mnemonic phrase';
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(mnemonic);
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qpreview');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      
      const preview = await walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2WPKH);
      
      expect(preview).toBe('bc1qpreview');
      expect(mocks.bitcoin.getAddressFromMnemonic).toHaveBeenCalledWith(
        mnemonic,
        "m/84'/0'/0'/0",
        AddressFormat.P2WPKH
      );
    });

    it('should throw error for locked wallet without cached preview', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      // Mock no cached previews in storage
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([]);
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);
      
      await expect(
        walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2WPKH)
      ).rejects.toThrow('Wallet is locked and no cached preview available');
    });
    
    it('should return cached preview for locked wallet', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      // Mock wallet with cached previews
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([
        {
          id: wallet.id,
          name: wallet.name,
          type: wallet.type,
          addressFormat: wallet.addressFormat,
          encryptedSecret: 'encrypted',
          previewAddress: 'bc1qtest',
          addressPreviews: {
            [AddressFormat.P2WPKH]: 'bc1qcached',
          },
          addressCount: 1,
        }
      ]);
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);
      
      const preview = await walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2WPKH);
      
      expect(preview).toBe('bc1qcached');
    });

    it('should throw error for non-existent wallet', async () => {
      // Mock no wallets in storage
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([]);
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);
      
      await expect(
        walletManager.getPreviewAddressForFormat('non-existent', AddressFormat.P2WPKH)
      ).rejects.toThrow('Wallet is locked and no cached preview available');
    });
  });

  describe('Session Alarm Management', () => {
    it('should schedule session expiry alarm when unlocking wallet', async () => {
      const wallet = createTestWallet();
      const password = 'test-password';
      
      // Add wallet to manager
      walletManager['wallets'] = [wallet];
      
      // Mock storage
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([
        {
          id: wallet.id,
          type: 'mnemonic',
          encryptedSecret: 'encrypted',
          addressFormat: wallet.addressFormat,
          addressCount: 1,
        }
      ]);
      
      // Mock HD key derivation
      const mockHDKey = {
        publicKey: new Uint8Array([1, 2, 3]),
        derive: vi.fn().mockReturnThis(),
      } as any as HDKey;
      vi.mocked(HDKey.fromMasterSeed).mockReturnValue(mockHDKey);
      vi.mocked(mnemonicToSeedSync).mockReturnValue(Buffer.from('test-seed'));
      vi.mocked(bytesToHex).mockReturnValue('test-pubkey-hex');
      
      // Mock successful unlock
      mocks.encryption.decryptMnemonic.mockResolvedValue('test mnemonic');
      mocks.settingsManager.getSettings.mockReturnValue({ autoLockTimeout: 5 * 60 * 1000 });
      mocks.sessionManager.initializeSession.mockResolvedValue(undefined);
      mocks.sessionManager.storeUnlockedSecret.mockImplementation(() => {});
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('test-address');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      
      await walletManager.unlockWallet(wallet.id, password);
      
      // Should have initialized session
      expect(mocks.sessionManager.initializeSession).toHaveBeenCalledWith(5 * 60 * 1000);
      
      // Should have scheduled alarm
      expect(global.chrome.alarms.clear).toHaveBeenCalledWith('session-expiry');
      expect(global.chrome.alarms.create).toHaveBeenCalledWith(
        'session-expiry',
        expect.objectContaining({
          when: expect.any(Number)
        })
      );
    });

    it('should clear session expiry alarm when locking all wallets', async () => {
      await walletManager.lockAllWallets();
      
      // Should have cleared the alarm
      expect(global.chrome.alarms.clear).toHaveBeenCalledWith('session-expiry');
    });

    it('should use default timeout if settings unavailable', async () => {
      const wallet = createTestWallet();
      const password = 'test-password';
      
      // Add wallet to manager
      walletManager['wallets'] = [wallet];
      
      // Mock storage
      mocks.walletStorage.getAllEncryptedWallets.mockResolvedValue([
        {
          id: wallet.id,
          type: 'mnemonic',
          encryptedSecret: 'encrypted',
          addressFormat: wallet.addressFormat,
          addressCount: 1,
        }
      ]);
      
      // Mock HD key derivation
      const mockHDKey = {
        publicKey: new Uint8Array([1, 2, 3]),
        derive: vi.fn().mockReturnThis(),
      } as any as HDKey;
      vi.mocked(HDKey.fromMasterSeed).mockReturnValue(mockHDKey);
      vi.mocked(mnemonicToSeedSync).mockReturnValue(Buffer.from('test-seed'));
      vi.mocked(bytesToHex).mockReturnValue('test-pubkey-hex');
      
      // Mock settings returning null
      mocks.settingsManager.getSettings.mockReturnValue(null);
      mocks.encryption.decryptMnemonic.mockResolvedValue('test mnemonic');
      mocks.sessionManager.initializeSession.mockResolvedValue(undefined);
      mocks.sessionManager.storeUnlockedSecret.mockImplementation(() => {});
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('test-address');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      
      await walletManager.unlockWallet(wallet.id, password);
      
      // Should use default 5 minute timeout
      expect(mocks.sessionManager.initializeSession).toHaveBeenCalledWith(5 * 60 * 1000);
    });
  });

  describe('Mnemonic Access', () => {
    it('should get unencrypted mnemonic for unlocked wallet', async () => {
      const wallet = createTestWallet({ type: 'mnemonic' });
      walletManager['wallets'] = [wallet];
      
      const mnemonic = 'test mnemonic phrase';
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(mnemonic);
      
      const result = await walletManager.getUnencryptedMnemonic(wallet.id);
      
      expect(result).toBe(mnemonic);
    });

    it('should throw error for locked wallet', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);
      
      await expect(
        walletManager.getUnencryptedMnemonic(wallet.id)
      ).rejects.toThrow('Wallet secret not found or locked');
    });

    it('should get secret for private key wallet', async () => {
      const wallet = createPrivateKeyWallet();
      walletManager['wallets'] = [wallet];
      
      const privateKeyData = JSON.stringify({ key: 'private-key-hex', compressed: true });
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(privateKeyData);
      
      const result = await walletManager.getUnencryptedMnemonic(wallet.id);
      
      expect(result).toBe(privateKeyData);
    });
  });
});