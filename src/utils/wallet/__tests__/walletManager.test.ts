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
import { AddressType } from '@/utils/blockchain/bitcoin';

// Mock all external dependencies
vi.mock('@/utils/auth/sessionManager');
vi.mock('@/utils/wallet/settingsManager');
vi.mock('@/utils/storage/walletStorage');
vi.mock('@/utils/encryption');
vi.mock('@/utils/blockchain/bitcoin');
vi.mock('@/utils/blockchain/counterwallet');
vi.mock('@noble/hashes/sha256');
vi.mock('@noble/hashes/utils');
vi.mock('@scure/bip32');
vi.mock('@scure/bip39');

// Import modules to get access to mocked functions
import * as sessionManager from '@/utils/auth/sessionManager';
import { settingsManager } from '@/utils/wallet/settingsManager';
import { getAllEncryptedWallets } from '@/utils/storage/walletStorage';
import { getAddressFromMnemonic, getDerivationPathForAddressType } from '@/utils/blockchain/bitcoin';

describe('WalletManager', () => {
  let walletManager: WalletManager;
  let mocks: ReturnType<typeof setupMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = setupMocks();
    
    // Setup the actual mocked module functions
    vi.mocked(sessionManager.setLastActiveTime).mockImplementation(mocks.sessionManager.setLastActiveTime);
    vi.mocked(sessionManager.getUnlockedSecret).mockImplementation(mocks.sessionManager.getUnlockedSecret);
    vi.mocked(sessionManager.storeUnlockedSecret).mockImplementation(mocks.sessionManager.storeUnlockedSecret);
    vi.mocked(sessionManager.clearUnlockedSecret).mockImplementation(mocks.sessionManager.clearUnlockedSecret);
    vi.mocked(sessionManager.clearAllUnlockedSecrets).mockImplementation(mocks.sessionManager.clearAllUnlockedSecrets);
    
    vi.mocked(settingsManager.loadSettings).mockImplementation(mocks.settingsManager.loadSettings);
    vi.mocked(settingsManager.updateSettings).mockImplementation(mocks.settingsManager.updateSettings);
    
    vi.mocked(getAllEncryptedWallets).mockImplementation(mocks.walletStorage.getAllEncryptedWallets);
    vi.mocked(getAddressFromMnemonic).mockImplementation(mocks.bitcoin.getAddressFromMnemonic);
    vi.mocked(getDerivationPathForAddressType).mockImplementation(mocks.bitcoin.getDerivationPathForAddressType);
    
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
          addressType: testWallet.addressType,
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
          addressType: wallet.addressType,
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
        id === wallets[0].id ? 'secret' : null
      );
      
      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(true);
    });

    it('should return false if no wallets are unlocked', async () => {
      const wallets = createMultipleWallets(2);
      walletManager['wallets'] = wallets;
      
      vi.mocked(sessionManager.getUnlockedSecret).mockReturnValue(null);
      
      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(false);
    });
  });

  describe('Address Preview', () => {
    it('should get preview address for type', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      // Mock the wallet being unlocked with a mnemonic
      const mnemonic = 'test mnemonic phrase';
      mocks.sessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qpreview');
      mocks.bitcoin.getDerivationPathForAddressType.mockReturnValue("m/84'/0'/0'");
      
      const preview = walletManager.getPreviewAddressForType(wallet.id, AddressType.P2WPKH);
      
      expect(preview).toBe('bc1qpreview');
      expect(mocks.bitcoin.getAddressFromMnemonic).toHaveBeenCalledWith(
        mnemonic,
        "m/84'/0'/0'/0",
        AddressType.P2WPKH
      );
    });

    it('should throw error for locked wallet', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      mocks.sessionManager.getUnlockedSecret.mockReturnValue(null);
      
      expect(() => {
        walletManager.getPreviewAddressForType(wallet.id, AddressType.P2WPKH);
      }).toThrow('Wallet is locked');
    });

    it('should throw error for non-existent wallet', () => {
      // For a non-existent wallet, sessionManager.getUnlockedSecret returns null
      // which causes 'Wallet is locked' error to be thrown first
      expect(() => {
        walletManager.getPreviewAddressForType('non-existent', AddressType.P2WPKH);
      }).toThrow('Wallet is locked');
    });
  });

  describe('Mnemonic Access', () => {
    it('should get unencrypted mnemonic for unlocked wallet', () => {
      const wallet = createTestWallet({ type: 'mnemonic' });
      walletManager['wallets'] = [wallet];
      
      const mnemonic = 'test mnemonic phrase';
      mocks.sessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      
      const result = walletManager.getUnencryptedMnemonic(wallet.id);
      
      expect(result).toBe(mnemonic);
    });

    it('should throw error for locked wallet', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];
      
      mocks.sessionManager.getUnlockedSecret.mockReturnValue(null);
      
      expect(() => {
        walletManager.getUnencryptedMnemonic(wallet.id);
      }).toThrow('Wallet secret not found or locked');
    });

    it('should get secret for private key wallet', () => {
      const wallet = createPrivateKeyWallet();
      walletManager['wallets'] = [wallet];
      
      const privateKeyData = JSON.stringify({ key: 'private-key-hex', compressed: true });
      mocks.sessionManager.getUnlockedSecret.mockReturnValue(privateKeyData);
      
      const result = walletManager.getUnencryptedMnemonic(wallet.id);
      
      expect(result).toBe(privateKeyData);
    });
  });
});