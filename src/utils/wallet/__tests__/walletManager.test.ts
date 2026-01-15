import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletManager } from '../walletManager';
import {
  createTestWallet,
  createPrivateKeyWallet,
  setupMocks,
  mockWalletUnlocked,
  createMultipleWallets,
  createTestKeychain,
  createTestKeychainRecord,
  mockKeychainUnlocked,
} from './helpers/testHelpers';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';

// Mock all external dependencies
vi.mock('@/utils/auth/sessionManager');
vi.mock('@/utils/storage/walletStorage');
vi.mock('@/utils/encryption/encryption');
vi.mock('@/utils/encryption/settings');
vi.mock('@/utils/encryption/buffer');
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
import { getKeychainRecord, saveKeychainRecord } from '@/utils/storage/walletStorage';
import { getAddressFromMnemonic, getDerivationPathForAddressFormat } from '@/utils/blockchain/bitcoin/address';
import { deriveKey, decryptJsonWithKey, decryptWithKey } from '@/utils/encryption/encryption';
import { base64ToBuffer } from '@/utils/encryption/buffer';
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
    vi.mocked(sessionManager.getKeychainMasterKey).mockImplementation(mocks.sessionManager.getKeychainMasterKey);
    vi.mocked(sessionManager.storeKeychainMasterKey).mockImplementation(mocks.sessionManager.storeKeychainMasterKey);

    vi.mocked(getKeychainRecord).mockImplementation(mocks.walletStorage.getKeychainRecord);
    vi.mocked(saveKeychainRecord).mockImplementation(mocks.walletStorage.saveKeychainRecord);

    vi.mocked(getAddressFromMnemonic).mockImplementation(mocks.bitcoin.getAddressFromMnemonic);
    vi.mocked(getDerivationPathForAddressFormat).mockImplementation(mocks.bitcoin.getDerivationPathForAddressFormat);

    vi.mocked(deriveKey).mockImplementation(mocks.keyBased.deriveKey);
    vi.mocked(decryptJsonWithKey).mockImplementation(mocks.keyBased.decryptJsonWithKey);
    vi.mocked(decryptWithKey).mockImplementation(mocks.keyBased.decryptWithKey);
    vi.mocked(base64ToBuffer).mockReturnValue(new Uint8Array([1, 2, 3]));

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

  describe('Wallet Refresh (Service Worker Restart)', () => {
    it('should reload wallets from session when master key is available', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);

      // Mock that keychain is unlocked (master key in session)
      mockKeychainUnlocked(mocks, keychain);

      await walletManager.refreshWallets();

      const wallets = walletManager.getWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].name).toBe(testWallet.name);
      expect(wallets[0].type).toBe(testWallet.type);
    });

    it('should handle no master key gracefully (keychain locked)', async () => {
      // No master key in session (keychain locked)
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue(null);

      await walletManager.refreshWallets();

      expect(walletManager.getWallets()).toEqual([]);
    });

    it('should handle missing keychain record gracefully', async () => {
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(null);

      await walletManager.refreshWallets();

      expect(walletManager.getWallets()).toEqual([]);
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

    it('should set active wallet', async () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      await walletManager.setActiveWallet(wallet.id);

      expect(walletManager.getActiveWallet()).toEqual(wallet);
    });
  });

  describe('Wallet Locking', () => {
    it('should clear specific wallet secret', () => {
      const wallet = createTestWallet();
      walletManager['wallets'] = [wallet];

      mockWalletUnlocked(mocks, wallet.id);

      walletManager.clearWalletSecret(wallet.id);

      expect(vi.mocked(sessionManager.clearUnlockedSecret)).toHaveBeenCalledWith(wallet.id);
    });

    it('should lock entire keychain', async () => {
      const wallets = createMultipleWallets(3);
      walletManager['wallets'] = wallets;

      await walletManager.lockKeychain();

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

  describe('Keychain Unlock', () => {
    it('should unlock keychain with correct password', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);
      const keychainRecord = createTestKeychainRecord();
      const mockMasterKey = {} as CryptoKey;

      // Setup mocks for unlock flow
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(keychainRecord);
      mocks.keyBased.deriveKey.mockResolvedValue(mockMasterKey);
      mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qtest');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      mocks.settingsStorage.getSettings.mockResolvedValue({ autoLockTimer: '5m' });

      await walletManager.unlockKeychain('test-password');

      // Should have derived key from password
      expect(mocks.keyBased.deriveKey).toHaveBeenCalled();
      // Should have stored master key in session
      expect(mocks.sessionManager.storeKeychainMasterKey).toHaveBeenCalled();
      // Should have initialized settings
      expect(mocks.settingsStorage.initializeSettingsMasterKey).toHaveBeenCalled();
    });

    it('should throw error when no keychain exists', async () => {
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(null);

      await expect(walletManager.unlockKeychain('test-password')).rejects.toThrow(
        'No keychain found'
      );
    });
  });

  describe('Session Alarm Management', () => {
    it('should schedule session expiry alarm when unlocking keychain', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);
      const keychainRecord = createTestKeychainRecord();
      const mockMasterKey = {} as CryptoKey;

      // Setup mocks for unlock flow
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(keychainRecord);
      mocks.keyBased.deriveKey.mockResolvedValue(mockMasterKey);
      mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qtest');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      mocks.settingsStorage.getSettings.mockResolvedValue({ autoLockTimer: '5m' });

      await walletManager.unlockKeychain('test-password');

      // Should have initialized session with timeout
      expect(mocks.sessionManager.initializeSession).toHaveBeenCalledWith(5 * 60 * 1000);
      // Should have scheduled alarm
      expect(sessionManager.scheduleSessionExpiry).toHaveBeenCalledWith(5 * 60 * 1000);
    });

    it('should clear session expiry alarm when locking keychain', async () => {
      await walletManager.lockKeychain();

      // Should have cleared the alarm via sessionManager
      expect(sessionManager.clearSessionExpiry).toHaveBeenCalled();
    });

    it('should use default timeout if settings unavailable', async () => {
      const testWallet = createTestWallet();
      const keychain = createTestKeychain([testWallet]);
      const keychainRecord = createTestKeychainRecord();
      const mockMasterKey = {} as CryptoKey;

      // Setup mocks
      mocks.walletStorage.getKeychainRecord.mockResolvedValue(keychainRecord);
      mocks.keyBased.deriveKey.mockResolvedValue(mockMasterKey);
      mocks.keyBased.decryptJsonWithKey.mockResolvedValue(keychain);
      mocks.keyBased.decryptWithKey.mockResolvedValue('test mnemonic');
      mocks.bitcoin.getAddressFromMnemonic.mockReturnValue('bc1qtest');
      mocks.bitcoin.getDerivationPathForAddressFormat.mockReturnValue("m/84'/0'/0'");
      // Return empty settings (no autoLockTimer)
      mocks.settingsStorage.getSettings.mockResolvedValue({});

      await walletManager.unlockKeychain('test-password');

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

  describe('Keychain Status', () => {
    it('should return true when keychain is unlocked', async () => {
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue({} as CryptoKey);

      const result = await walletManager.isKeychainUnlocked();

      expect(result).toBe(true);
    });

    it('should return false when keychain is locked', async () => {
      mocks.sessionManager.getKeychainMasterKey.mockResolvedValue(null);

      const result = await walletManager.isKeychainUnlocked();

      expect(result).toBe(false);
    });
  });
});
