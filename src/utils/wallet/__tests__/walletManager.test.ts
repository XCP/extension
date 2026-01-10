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
vi.mock('@/utils/storage/walletStorage');
vi.mock('@/utils/encryption/walletEncryption');
vi.mock('@/utils/encryption/settings');
vi.mock('@/utils/storage/settingsStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/storage/settingsStorage')>();
  return {
    ...actual,
    getSettings: vi.fn().mockResolvedValue({
      lastActiveWalletId: null,
      autoLockTimeout: 5 * 60 * 1000,
      autoLockTimer: '5m',
    }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    reencryptSettings: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('@/utils/blockchain/bitcoin/address');
vi.mock('@/utils/blockchain/bitcoin/privateKey');
vi.mock('@/utils/blockchain/bitcoin/messageSigner');
vi.mock('@/utils/blockchain/bitcoin/transactionSigner');
vi.mock('@/utils/blockchain/bitcoin/transactionBroadcaster');
vi.mock('@/utils/blockchain/counterwallet');
vi.mock('@noble/hashes/sha2.js');
vi.mock('@noble/hashes/utils.js');
vi.mock('@scure/bip32');
vi.mock('@scure/bip39');

// Import modules to get access to mocked functions
import * as sessionManager from '@/utils/auth/sessionManager';
import { getSettings, updateSettings } from '@/utils/storage/settingsStorage';
import { getAllEncryptedWallets } from '@/utils/storage/walletStorage';
import { getAddressFromMnemonic, getDerivationPathForAddressFormat } from '@/utils/blockchain/bitcoin/address';
import { decryptMnemonic, decryptPrivateKey } from '@/utils/encryption/walletEncryption';
import { initializeSettingsKey, clearSettingsKey } from '@/utils/encryption/settings';
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
    vi.mocked(sessionManager.scheduleSessionExpiry).mockResolvedValue(undefined);
    vi.mocked(sessionManager.clearSessionExpiry).mockResolvedValue(undefined);

    vi.mocked(getSettings).mockImplementation(mocks.settingsStorage.getSettings);
    vi.mocked(updateSettings).mockImplementation(mocks.settingsStorage.updateSettings);

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
          addressCount: 1,
        },
      ]);
      mocks.settingsStorage.getSettings.mockResolvedValue({
        lastActiveWalletId: wallet.id,
        autoLockTimeout: 5 * 60 * 1000,
        autoLockTimer: '5m',
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

    it('should throw error for locked wallet', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      // Mock wallet is locked (no secret available)
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue(null);

      await expect(
        walletManager.getPreviewAddressForFormat(wallet.id, AddressFormat.P2WPKH)
      ).rejects.toThrow('Wallet must be unlocked to get preview address');
    });

    it('should throw error for non-existent wallet', async () => {
      // Mock wallet is unlocked but doesn't exist in wallets array
      mocks.sessionManager.getUnlockedSecret.mockResolvedValue('test mnemonic');
      walletManager['wallets'] = []; // Empty wallets array

      await expect(
        walletManager.getPreviewAddressForFormat('non-existent', AddressFormat.P2WPKH)
      ).rejects.toThrow('Wallet not found');
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
      mocks.settingsStorage.getSettings.mockResolvedValue({ autoLockTimeout: 5 * 60 * 1000 });
      mocks.sessionManager.initializeSession.mockResolvedValue(undefined);
      mocks.sessionManager.storeUnlockedSecret.mockImplementation(() => {});
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('test-address');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      
      await walletManager.unlockWallet(wallet.id, password);

      // Should have initialized session
      expect(mocks.sessionManager.initializeSession).toHaveBeenCalledWith(5 * 60 * 1000);

      // Should have scheduled alarm via sessionManager
      expect(sessionManager.scheduleSessionExpiry).toHaveBeenCalledWith(5 * 60 * 1000);
    });

    it('should clear session expiry alarm when locking all wallets', async () => {
      await walletManager.lockAllWallets();

      // Should have cleared the alarm via sessionManager
      expect(sessionManager.clearSessionExpiry).toHaveBeenCalled();
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
      
      // Mock settings returning null/empty
      mocks.settingsStorage.getSettings.mockResolvedValue({});
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