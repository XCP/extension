import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletManager, Wallet } from '../walletManager';
import { AddressType } from '@/utils/blockchain/bitcoin';

// Mock all external dependencies
vi.mock('@/utils/auth/sessionManager', () => ({
  setLastActiveTime: vi.fn(),
  getUnlockedSecret: vi.fn(),
  storeUnlockedSecret: vi.fn(),
  clearUnlockedSecret: vi.fn(),
  clearAllUnlockedSecrets: vi.fn(),
}));

vi.mock('@/utils/wallet/settingsManager', () => ({
  settingsManager: {
    loadSettings: vi.fn(),
    updateSettings: vi.fn(),
    getSettings: vi.fn(),
  },
}));

vi.mock('@/utils/storage/walletStorage', () => ({
  getAllEncryptedWallets: vi.fn(),
  addEncryptedWallet: vi.fn(),
  updateEncryptedWallet: vi.fn(),
  removeEncryptedWallet: vi.fn(),
}));

vi.mock('@/utils/encryption', () => ({
  encryptMnemonic: vi.fn(),
  decryptMnemonic: vi.fn(),
  encryptPrivateKey: vi.fn(),
  decryptPrivateKey: vi.fn(),
  DecryptionError: class DecryptionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DecryptionError';
    }
  },
}));

vi.mock('@/utils/blockchain/bitcoin', () => ({
  AddressType: {
    P2PKH: 'P2PKH',
    P2WPKH: 'P2WPKH',
    P2SH: 'P2SH',
    P2WSH: 'P2WSH',
    Counterwallet: 'Counterwallet',
  },
  getAddressFromMnemonic: vi.fn(),
  getPrivateKeyFromMnemonic: vi.fn(),
  getAddressFromPrivateKey: vi.fn(),
  getPublicKeyFromPrivateKey: vi.fn(),
  decodeWIF: vi.fn(),
  isWIF: vi.fn(),
  getDerivationPathForAddressType: vi.fn(),
}));

vi.mock('@/utils/blockchain/counterwallet', () => ({
  getCounterwalletSeed: vi.fn(),
}));

vi.mock('@/utils/blockchain/bitcoin/transactionSigner', () => ({
  signTransaction: vi.fn(),
}));

vi.mock('@/utils/blockchain/bitcoin/transactionBroadcaster', () => ({
  broadcastTransaction: vi.fn(),
}));

// Mock noble crypto libraries
vi.mock('@noble/hashes/sha256', () => ({
  sha256: vi.fn(),
}));

vi.mock('@noble/hashes/utils', () => ({
  utf8ToBytes: vi.fn(),
  bytesToHex: vi.fn(),
}));

vi.mock('@scure/bip32', () => ({
  HDKey: {
    fromMasterSeed: vi.fn(),
  },
}));

vi.mock('@scure/bip39', () => ({
  mnemonicToSeedSync: vi.fn(),
}));

// Get the mocked functions
const mockSessionManager = vi.mocked(await import('@/utils/auth/sessionManager'));
const mockSettingsManager = vi.mocked((await import('@/utils/wallet/settingsManager')).settingsManager);
const mockWalletStorage = vi.mocked(await import('@/utils/storage/walletStorage'));
const mockEncryption = vi.mocked(await import('@/utils/encryption'));
const mockBitcoin = vi.mocked(await import('@/utils/blockchain/bitcoin'));
const mockCounterwallet = vi.mocked(await import('@/utils/blockchain/counterwallet'));
const mockTransactionSigner = vi.mocked(await import('@/utils/blockchain/bitcoin/transactionSigner'));
const mockTransactionBroadcaster = vi.mocked(await import('@/utils/blockchain/bitcoin/transactionBroadcaster'));
const mockCrypto = vi.mocked(await import('@noble/hashes/sha256'));
const mockUtils = vi.mocked(await import('@noble/hashes/utils'));
const mockHDKey = vi.mocked((await import('@scure/bip32')).HDKey);
const mockBip39 = vi.mocked(await import('@scure/bip39'));

describe('WalletManager', () => {
  let walletManager: WalletManager;

  const mockEncryptedWallet = {
    id: 'wallet-123',
    name: 'Test Wallet',
    type: 'mnemonic' as const,
    addressType: AddressType.P2WPKH,
    addressCount: 1,
    encryptedSecret: 'encrypted-mnemonic-data',
    previewAddress: 'bc1qtest123',
  };

  const mockWallet: Wallet = {
    id: 'wallet-123',
    name: 'Test Wallet',
    type: 'mnemonic',
    addressType: AddressType.P2WPKH,
    addressCount: 1,
    addresses: [],
  };

  const mockSettings = {
    lastActiveWalletId: 'wallet-123',
    autoLockTimeout: 300000,
    connectedWebsites: [],
    showHelpText: true,
    analyticsAllowed: false,
    allowUnconfirmedTxs: true,
    autoLockTimer: '5m' as const,
    enableMPMA: false,
    enableAdvancedBroadcasts: true,
    transactionDryRun: false,
    pinnedAssets: ['BTC'],
    counterpartyApiBase: 'https://api.counterparty.io',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    walletManager = new WalletManager();

    // Setup default mocks
    mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([]);
    mockSettingsManager.loadSettings.mockResolvedValue(mockSettings);
    mockBitcoin.getDerivationPathForAddressType.mockReturnValue("m/84'/0'/0'");
    mockSessionManager.getUnlockedSecret.mockReturnValue(null);
  });

  describe('Basic Properties and State', () => {
    it('should initialize with empty wallets array', () => {
      expect(walletManager.getWallets()).toEqual([]);
    });

    it('should have no active wallet initially', () => {
      expect(walletManager.getActiveWallet()).toBeUndefined();
    });

    it('should update last active time', () => {
      walletManager.setLastActiveTime();
      expect(mockSessionManager.setLastActiveTime).toHaveBeenCalledOnce();
    });
  });

  describe('isAnyWalletUnlocked', () => {
    it('should return false when no wallets are loaded', async () => {
      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(false);
    });

    it('should return false when wallets exist but none are unlocked', async () => {
      await walletManager.loadWallets();
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      
      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(false);
    });

    it('should return true when at least one wallet is unlocked', async () => {
      // Setup a wallet in memory
      walletManager['wallets'] = [mockWallet];
      mockSessionManager.getUnlockedSecret.mockReturnValue('unlocked-secret');

      const result = await walletManager.isAnyWalletUnlocked();
      expect(result).toBe(true);
    });
  });

  describe('loadWallets', () => {
    it('should load wallets from storage', async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);

      await walletManager.loadWallets();

      expect(mockWalletStorage.getAllEncryptedWallets).toHaveBeenCalledOnce();
      expect(mockSettingsManager.loadSettings).toHaveBeenCalledOnce();
      
      const wallets = walletManager.getWallets();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].id).toBe('wallet-123');
      expect(wallets[0].name).toBe('Test Wallet');
    });

    it('should load addresses for unlocked mnemonic wallets', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      mockSessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('bc1qderived123');
      mockBip39.mnemonicToSeedSync.mockReturnValue(new Uint8Array(64));
      
      const mockHDKeyInstance = {
        derive: vi.fn().mockReturnValue({
          publicKey: new Uint8Array(33),
        }),
      };
      mockHDKey.fromMasterSeed.mockReturnValue(mockHDKeyInstance as any);
      mockUtils.bytesToHex.mockReturnValue('03abcd1234');

      await walletManager.loadWallets();

      const wallets = walletManager.getWallets();
      expect(wallets[0].addresses).toHaveLength(1);
      expect(wallets[0].addresses[0].address).toBe('bc1qderived123');
    });

    it('should set preview address for locked wallets', async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      mockSessionManager.getUnlockedSecret.mockReturnValue(null);

      await walletManager.loadWallets();

      const wallets = walletManager.getWallets();
      expect(wallets[0].addresses).toHaveLength(1);
      expect(wallets[0].addresses[0].address).toBe('bc1qtest123');
    });

    it('should set active wallet from settings', async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      
      await walletManager.loadWallets();

      expect(walletManager.getActiveWallet()?.id).toBe('wallet-123');
    });
  });

  describe('Wallet Management Getters', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should get wallet by id', () => {
      const wallet = walletManager.getWalletById('wallet-123');
      expect(wallet?.id).toBe('wallet-123');
    });

    it('should return undefined for non-existent wallet id', () => {
      const wallet = walletManager.getWalletById('non-existent');
      expect(wallet).toBeUndefined();
    });

    it('should get wallet using alternative method', () => {
      const wallet = walletManager.getWallet('wallet-123');
      expect(wallet?.id).toBe('wallet-123');
    });

    it('should set active wallet', () => {
      walletManager.setActiveWallet('wallet-123');
      expect(walletManager.getActiveWallet()?.id).toBe('wallet-123');
      expect(mockSettingsManager.updateSettings).toHaveBeenCalledWith({ 
        lastActiveWalletId: 'wallet-123' 
      });
    });
  });

  describe('getUnencryptedMnemonic', () => {
    it('should return mnemonic for unlocked wallet', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockSessionManager.getUnlockedSecret.mockReturnValue(mnemonic);

      const result = walletManager.getUnencryptedMnemonic('wallet-123');
      expect(result).toBe(mnemonic);
    });

    it('should throw error for locked wallet', () => {
      mockSessionManager.getUnlockedSecret.mockReturnValue(null);

      expect(() => walletManager.getUnencryptedMnemonic('wallet-123')).toThrow(
        'Wallet secret not found or locked'
      );
    });
  });

  describe('createMnemonicWallet', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const password = 'testpassword123';

    beforeEach(() => {
      mockEncryption.encryptMnemonic.mockResolvedValue('encrypted-mnemonic');
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('bc1qnew123');
      mockCrypto.sha256.mockReturnValue(new Uint8Array(32));
      mockUtils.bytesToHex.mockReturnValue('abcd1234');
      mockUtils.utf8ToBytes.mockReturnValue(new Uint8Array(8));
      mockBip39.mnemonicToSeedSync.mockReturnValue(new Uint8Array(64));
      
      const mockHDKeyInstance = {
        derive: vi.fn().mockReturnValue({
          publicKey: new Uint8Array(33),
          publicExtendedKey: 'xpub123',
        }),
      };
      mockHDKey.fromMasterSeed.mockReturnValue(mockHDKeyInstance as any);
    });

    it('should create a new mnemonic wallet', async () => {
      const wallet = await walletManager.createMnemonicWallet(mnemonic, password);

      expect(wallet.type).toBe('mnemonic');
      expect(wallet.addressType).toBe(AddressType.P2WPKH);
      expect(wallet.addressCount).toBe(1);
      expect(mockWalletStorage.addEncryptedWallet).toHaveBeenCalledOnce();
    });

    it('should use custom name and address type', async () => {
      const wallet = await walletManager.createMnemonicWallet(
        mnemonic, 
        password, 
        'Custom Wallet', 
        AddressType.P2PKH
      );

      expect(wallet.name).toBe('Custom Wallet');
      expect(wallet.addressType).toBe(AddressType.P2PKH);
    });

    it('should generate default name if none provided', async () => {
      const wallet = await walletManager.createMnemonicWallet(mnemonic, password);
      expect(wallet.name).toBe('Wallet 1');
    });

    it('should throw error if wallet with same mnemonic+addressType exists', async () => {
      mockUtils.bytesToHex.mockReturnValue('existing-id');
      walletManager['wallets'] = [{
        id: 'existing-id',
        name: 'Existing',
        type: 'mnemonic',
        addressType: AddressType.P2WPKH,
        addressCount: 1,
        addresses: [],
      }];

      await expect(
        walletManager.createMnemonicWallet(mnemonic, password)
      ).rejects.toThrow('A wallet with this mnemonic+addressType combination already exists.');
    });

    it('should throw error if maximum wallets reached', async () => {
      // Fill up to MAX_WALLETS (20)
      walletManager['wallets'] = Array.from({ length: 20 }, (_, i) => ({
        id: `wallet-${i}`,
        name: `Wallet ${i}`,
        type: 'mnemonic' as const,
        addressType: AddressType.P2WPKH,
        addressCount: 1,
        addresses: [],
      }));

      await expect(
        walletManager.createMnemonicWallet(mnemonic, password)
      ).rejects.toThrow('Maximum number of wallets (20) reached');
    });
  });

  describe('createPrivateKeyWallet', () => {
    const privateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const password = 'testpassword123';

    beforeEach(() => {
      mockBitcoin.isWIF.mockReturnValue(false);
      mockBitcoin.getPublicKeyFromPrivateKey.mockReturnValue('03abcd1234');
      mockBitcoin.getAddressFromPrivateKey.mockReturnValue('bc1qprivkey123');
      mockEncryption.encryptPrivateKey.mockResolvedValue('encrypted-private-key');
      mockCrypto.sha256.mockReturnValue(new Uint8Array(32));
      mockUtils.bytesToHex.mockReturnValue('privkey-id-123');
      mockUtils.utf8ToBytes.mockReturnValue(new Uint8Array(8));
    });

    it('should create a new private key wallet', async () => {
      const wallet = await walletManager.createPrivateKeyWallet(privateKey, password);

      expect(wallet.type).toBe('privateKey');
      expect(wallet.addressType).toBe(AddressType.P2WPKH);
      expect(wallet.addressCount).toBe(1);
      expect(mockWalletStorage.addEncryptedWallet).toHaveBeenCalledOnce();
    });

    it('should handle WIF format private key', async () => {
      const wifKey = 'KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2TRLShXdfjJ3tnZEjz';
      mockBitcoin.isWIF.mockReturnValue(true);
      mockBitcoin.decodeWIF.mockReturnValue({
        privateKey: privateKey,
        compressed: true,
      });

      const wallet = await walletManager.createPrivateKeyWallet(wifKey, password);
      expect(wallet.type).toBe('privateKey');
      expect(mockBitcoin.decodeWIF).toHaveBeenCalledWith(wifKey);
    });

    it('should handle hex private key with 0x prefix', async () => {
      const hexWithPrefix = '0x' + privateKey;
      await walletManager.createPrivateKeyWallet(hexWithPrefix, password);
      expect(mockBitcoin.getPublicKeyFromPrivateKey).toHaveBeenCalledWith(privateKey, true);
    });

    it('should throw error if maximum wallets reached', async () => {
      walletManager['wallets'] = Array.from({ length: 20 }, (_, i) => ({
        id: `wallet-${i}`,
        name: `Wallet ${i}`,
        type: 'mnemonic' as const,
        addressType: AddressType.P2WPKH,
        addressCount: 1,
        addresses: [],
      }));

      await expect(
        walletManager.createPrivateKeyWallet(privateKey, password)
      ).rejects.toThrow('Maximum number of wallets (20) reached');
    });
  });

  describe('unlockWallet', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should unlock mnemonic wallet', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockEncryption.decryptMnemonic.mockResolvedValue(mnemonic);
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('bc1qunlocked123');
      mockBip39.mnemonicToSeedSync.mockReturnValue(new Uint8Array(64));
      
      const mockHDKeyInstance = {
        derive: vi.fn().mockReturnValue({
          publicKey: new Uint8Array(33),
        }),
      };
      mockHDKey.fromMasterSeed.mockReturnValue(mockHDKeyInstance as any);
      mockUtils.bytesToHex.mockReturnValue('03abcd1234');

      await walletManager.unlockWallet('wallet-123', 'password');

      expect(mockEncryption.decryptMnemonic).toHaveBeenCalledWith('encrypted-mnemonic-data', 'password');
      expect(mockSessionManager.storeUnlockedSecret).toHaveBeenCalledWith('wallet-123', mnemonic);
      expect(walletManager.getActiveWallet()?.id).toBe('wallet-123');
    });

    it('should unlock private key wallet', async () => {
      const privateKeyWallet = {
        ...mockEncryptedWallet,
        type: 'privateKey' as const,
      };
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([privateKeyWallet]);
      await walletManager.loadWallets();

      const privKeyData = '{"key":"abcd1234","compressed":true}';
      mockEncryption.decryptPrivateKey.mockResolvedValue(privKeyData);
      mockBitcoin.getAddressFromPrivateKey.mockReturnValue('bc1qprivkey123');
      mockBitcoin.getPublicKeyFromPrivateKey.mockReturnValue('03abcd1234');

      await walletManager.unlockWallet('wallet-123', 'password');

      expect(mockEncryption.decryptPrivateKey).toHaveBeenCalledWith('encrypted-mnemonic-data', 'password');
      expect(mockSessionManager.storeUnlockedSecret).toHaveBeenCalledWith('wallet-123', privKeyData);
    });

    it('should throw error for non-existent wallet', async () => {
      await expect(
        walletManager.unlockWallet('non-existent', 'password')
      ).rejects.toThrow('Wallet not found in memory.');
    });

    it('should throw error for missing storage record', async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([]);

      await expect(
        walletManager.unlockWallet('wallet-123', 'password')
      ).rejects.toThrow('Wallet record not found in storage.');
    });

    it('should handle decryption errors', async () => {
      const decryptionError = new mockEncryption.DecryptionError('Invalid password');
      mockEncryption.decryptMnemonic.mockRejectedValue(decryptionError);

      await expect(
        walletManager.unlockWallet('wallet-123', 'wrong-password')
      ).rejects.toThrow('Invalid password');
    });
  });

  describe('Locking Wallets', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should lock specific wallet', () => {
      walletManager.lockWallet('wallet-123');

      expect(mockSessionManager.clearUnlockedSecret).toHaveBeenCalledWith('wallet-123');
      
      const wallet = walletManager.getWalletById('wallet-123');
      expect(wallet?.addresses).toEqual([]);
    });

    it('should lock all wallets', () => {
      walletManager.lockAllWallets();

      expect(mockSessionManager.clearAllUnlockedSecrets).toHaveBeenCalledOnce();
      
      const wallets = walletManager.getWallets();
      wallets.forEach(wallet => {
        expect(wallet.addresses).toEqual([]);
      });
    });
  });

  describe('addAddress', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should add address to unlocked mnemonic wallet', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockSessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('bc1qnewaddr123');
      mockBip39.mnemonicToSeedSync.mockReturnValue(new Uint8Array(64));
      
      const mockHDKeyInstance = {
        derive: vi.fn().mockReturnValue({
          publicKey: new Uint8Array(33),
        }),
      };
      mockHDKey.fromMasterSeed.mockReturnValue(mockHDKeyInstance as any);
      mockUtils.bytesToHex.mockReturnValue('03newaddr123');

      const newAddress = await walletManager.addAddress('wallet-123');

      expect(newAddress.address).toBe('bc1qnewaddr123');
      expect(newAddress.name).toBe('Address 2');
      expect(mockWalletStorage.updateEncryptedWallet).toHaveBeenCalledOnce();
    });

    it('should throw error for private key wallet', async () => {
      const privateKeyWallet = {
        ...mockEncryptedWallet,
        type: 'privateKey' as const,
      };
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([privateKeyWallet]);
      await walletManager.loadWallets();

      await expect(
        walletManager.addAddress('wallet-123')
      ).rejects.toThrow('Can only add addresses to a mnemonic wallet.');
    });

    it('should throw error for locked wallet', async () => {
      mockSessionManager.getUnlockedSecret.mockReturnValue(null);

      await expect(
        walletManager.addAddress('wallet-123')
      ).rejects.toThrow('Wallet is locked. Please unlock first.');
    });

    it('should throw error when maximum addresses reached', async () => {
      const walletWithMaxAddresses: Wallet = {
        ...mockWallet,
        addressCount: 100,
      };
      walletManager['wallets'] = [walletWithMaxAddresses];
      mockSessionManager.getUnlockedSecret.mockReturnValue('mnemonic');

      await expect(
        walletManager.addAddress('wallet-123')
      ).rejects.toThrow('Cannot exceed 100 addresses.');
    });
  });

  describe('removeWallet', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should remove wallet and clear its secrets', async () => {
      walletManager.setActiveWallet('wallet-123');

      await walletManager.removeWallet('wallet-123');

      expect(mockWalletStorage.removeEncryptedWallet).toHaveBeenCalledWith('wallet-123');
      expect(mockSessionManager.clearUnlockedSecret).toHaveBeenCalledWith('wallet-123');
      expect(walletManager.getWallets()).toHaveLength(0);
      expect(walletManager.getActiveWallet()).toBeUndefined();
    });

    it('should throw error for non-existent wallet', async () => {
      await expect(
        walletManager.removeWallet('non-existent')
      ).rejects.toThrow('Wallet not found in memory.');
    });

    it('should renumber remaining wallets with default names', async () => {
      const wallet2 = {
        id: 'wallet-456',
        name: 'Wallet 2',
        type: 'mnemonic' as const,
        addressType: AddressType.P2WPKH,
        addressCount: 1,
        encryptedSecret: 'encrypted-data-2',
        previewAddress: 'bc1qtest456',
      };

      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet, wallet2]);
      await walletManager.loadWallets();

      // Remove first wallet
      await walletManager.removeWallet('wallet-123');

      // Second wallet should be renamed to "Wallet 1"
      const remainingWallets = walletManager.getWallets();
      expect(remainingWallets[0].name).toBe('Wallet 1');
      expect(mockWalletStorage.updateEncryptedWallet).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Wallet 1' })
      );
    });
  });

  describe('Password Management', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
    });

    it('should verify password with existing wallet', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockEncryption.decryptMnemonic.mockResolvedValue(mnemonic);

      const result = await walletManager.verifyPassword('correct-password');

      expect(result).toBe(true);
      expect(mockEncryption.decryptMnemonic).toHaveBeenCalledWith('encrypted-mnemonic-data', 'correct-password');
    });

    it('should return false for incorrect password', async () => {
      mockEncryption.decryptMnemonic.mockRejectedValue(new Error('Invalid password'));

      const result = await walletManager.verifyPassword('wrong-password');

      expect(result).toBe(false);
    });

    it('should update password for all wallets', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockEncryption.decryptMnemonic.mockResolvedValue(mnemonic);
      mockEncryption.encryptMnemonic.mockResolvedValue('new-encrypted-mnemonic');

      await walletManager.updatePassword('old-password', 'new-password');

      expect(mockEncryption.decryptMnemonic).toHaveBeenCalledWith('encrypted-mnemonic-data', 'old-password');
      expect(mockEncryption.encryptMnemonic).toHaveBeenCalledWith(mnemonic, 'new-password', AddressType.P2WPKH);
      expect(mockWalletStorage.updateEncryptedWallet).toHaveBeenCalledOnce();
    });

    it('should throw error for incorrect current password', async () => {
      mockEncryption.decryptMnemonic.mockRejectedValue(new Error('Invalid password'));

      await expect(
        walletManager.updatePassword('wrong-password', 'new-password')
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('resetAllWallets', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should reset all wallets with valid password', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockEncryption.decryptMnemonic.mockResolvedValue(mnemonic);

      await walletManager.resetAllWallets('correct-password');

      expect(mockWalletStorage.removeEncryptedWallet).toHaveBeenCalledWith('wallet-123');
      expect(mockSessionManager.clearAllUnlockedSecrets).toHaveBeenCalled();
      expect(walletManager.getWallets()).toHaveLength(0);
      expect(walletManager.getActiveWallet()).toBeUndefined();
    });

    it('should throw error for invalid password', async () => {
      mockEncryption.decryptMnemonic.mockRejectedValue(new Error('Invalid password'));

      await expect(
        walletManager.resetAllWallets('wrong-password')
      ).rejects.toThrow('Invalid password');
    });
  });

  describe('Address Type Management', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should update wallet address type', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockSessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('bc1qnewtype123');
      mockBip39.mnemonicToSeedSync.mockReturnValue(new Uint8Array(64));
      
      const mockHDKeyInstance = {
        derive: vi.fn().mockReturnValue({
          publicKey: new Uint8Array(33),
        }),
      };
      mockHDKey.fromMasterSeed.mockReturnValue(mockHDKeyInstance as any);
      mockUtils.bytesToHex.mockReturnValue('03newtype123');

      await walletManager.updateWalletAddressType('wallet-123', AddressType.P2PKH);

      const wallet = walletManager.getWalletById('wallet-123');
      expect(wallet?.addressType).toBe(AddressType.P2PKH);
      expect(wallet?.addresses[0].address).toBe('bc1qnewtype123');
      expect(mockWalletStorage.updateEncryptedWallet).toHaveBeenCalledOnce();
    });

    it('should throw error for private key wallet', async () => {
      const privateKeyWallet = {
        ...mockEncryptedWallet,
        type: 'privateKey' as const,
      };
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([privateKeyWallet]);
      await walletManager.loadWallets();

      await expect(
        walletManager.updateWalletAddressType('wallet-123', AddressType.P2PKH)
      ).rejects.toThrow('Only mnemonic wallets can change address type.');
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
      walletManager.setActiveWallet('wallet-123');
    });

    it('should sign transaction', async () => {
      const wallet: Wallet = {
        ...mockWallet,
        addresses: [{
          name: 'Address 1',
          path: "m/84'/0'/0'/0",
          address: 'bc1qsource123',
          pubKey: '03abcd1234',
        }],
      };
      walletManager['wallets'] = [wallet];

      const rawTx = '0200000001...';
      const privateKey = 'abcd1234567890';
      const signedTx = '0200000001...signed';

      mockSessionManager.getUnlockedSecret.mockReturnValue('mnemonic');
      mockBitcoin.getPrivateKeyFromMnemonic.mockReturnValue(privateKey);
      mockTransactionSigner.signTransaction.mockReturnValue(signedTx);

      const result = await walletManager.signTransaction(rawTx, 'bc1qsource123');

      expect(result).toBe(signedTx);
      expect(mockTransactionSigner.signTransaction).toHaveBeenCalledWith(
        rawTx, wallet, wallet.addresses[0], privateKey
      );
    });

    it('should broadcast transaction', async () => {
      const signedTx = '0200000001...signed';
      const broadcastResult = { txid: 'abcd1234', fees: 1000 };
      mockTransactionBroadcaster.broadcastTransaction.mockResolvedValue(broadcastResult);

      const result = await walletManager.broadcastTransaction(signedTx);

      expect(result).toEqual(broadcastResult);
      expect(mockTransactionBroadcaster.broadcastTransaction).toHaveBeenCalledWith(signedTx);
    });

    it('should throw error when no active wallet for signing', async () => {
      walletManager['activeWalletId'] = null;

      await expect(
        walletManager.signTransaction('rawTx', 'bc1qsource123')
      ).rejects.toThrow('No active wallet set');
    });
  });

  describe('Convenience Methods', () => {
    it('should create and unlock mnemonic wallet', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const password = 'testpassword123';
      
      // Mock the create wallet flow
      mockEncryption.encryptMnemonic.mockResolvedValue('encrypted-mnemonic');
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('bc1qnew123');
      mockCrypto.sha256.mockReturnValue(new Uint8Array(32));
      mockUtils.bytesToHex.mockReturnValue('new-wallet-id');
      mockUtils.utf8ToBytes.mockReturnValue(new Uint8Array(8));
      mockBip39.mnemonicToSeedSync.mockReturnValue(new Uint8Array(64));
      
      const mockHDKeyInstance = {
        derive: vi.fn().mockReturnValue({
          publicKey: new Uint8Array(33),
          publicExtendedKey: 'xpub123',
        }),
      };
      mockHDKey.fromMasterSeed.mockReturnValue(mockHDKeyInstance as any);

      // Mock the unlock wallet flow
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([{
        id: 'new-wallet-id',
        name: 'Wallet 1',
        type: 'mnemonic' as const,
        addressType: AddressType.P2WPKH,
        addressCount: 1,
        encryptedSecret: 'encrypted-mnemonic',
        previewAddress: 'bc1qnew123',
      }]);
      mockEncryption.decryptMnemonic.mockResolvedValue(mnemonic);

      const wallet = await walletManager.createAndUnlockMnemonicWallet(mnemonic, password);

      expect(wallet.type).toBe('mnemonic');
      expect(walletManager.getActiveWallet()?.id).toBe(wallet.id);
      expect(mockSessionManager.storeUnlockedSecret).toHaveBeenCalledWith(wallet.id, mnemonic);
    });

    it('should create and unlock private key wallet', async () => {
      const privateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const password = 'testpassword123';
      
      mockBitcoin.isWIF.mockReturnValue(false);
      mockBitcoin.getPublicKeyFromPrivateKey.mockReturnValue('03abcd1234');
      mockBitcoin.getAddressFromPrivateKey.mockReturnValue('bc1qprivkey123');
      mockEncryption.encryptPrivateKey.mockResolvedValue('encrypted-private-key');
      mockCrypto.sha256.mockReturnValue(new Uint8Array(32));
      mockUtils.bytesToHex.mockReturnValue('privkey-wallet-id');
      mockUtils.utf8ToBytes.mockReturnValue(new Uint8Array(8));

      const privKeyData = '{"key":"' + privateKey + '","compressed":true}';
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([{
        id: 'privkey-wallet-id',
        name: 'Wallet 1',
        type: 'privateKey' as const,
        addressType: AddressType.P2WPKH,
        addressCount: 1,
        encryptedSecret: 'encrypted-private-key',
        previewAddress: 'bc1qprivkey123',
      }]);
      mockEncryption.decryptPrivateKey.mockResolvedValue(privKeyData);

      const wallet = await walletManager.createAndUnlockPrivateKeyWallet(privateKey, password);

      expect(wallet.type).toBe('privateKey');
      expect(walletManager.getActiveWallet()?.id).toBe(wallet.id);
    });

    it('should get preview address for different address types', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      mockSessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      mockBitcoin.getAddressFromMnemonic.mockReturnValue('1PreviewAddr123');

      const wallet: Wallet = {
        ...mockWallet,
        type: 'mnemonic',
      };
      walletManager['wallets'] = [wallet];

      const address = walletManager.getPreviewAddressForType('wallet-123', AddressType.P2PKH);

      expect(address).toBe('1PreviewAddr123');
      expect(mockBitcoin.getAddressFromMnemonic).toHaveBeenCalledWith(
        mnemonic,
        "m/84'/0'/0'/0",
        AddressType.P2PKH
      );
    });

    it('should update pinned assets (backward compatibility)', async () => {
      const pinnedAssets = ['BTC', 'XCP', 'DOGE'];

      await walletManager.updateWalletPinnedAssets(pinnedAssets);

      expect(mockSettingsManager.updateSettings).toHaveBeenCalledWith({ pinnedAssets });
    });
  });

  describe('Private Key Retrieval', () => {
    beforeEach(async () => {
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([mockEncryptedWallet]);
      await walletManager.loadWallets();
    });

    it('should get private key for mnemonic wallet', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const privateKey = 'abcd1234567890';
      
      // Set up wallet with addresses so it has a path
      const walletWithAddresses: Wallet = {
        ...mockWallet,
        addresses: [{
          name: 'Address 1',
          path: "m/84'/0'/0'/0",
          address: 'bc1qtest123',
          pubKey: '03abcd1234',
        }],
      };
      walletManager['wallets'] = [walletWithAddresses];
      
      mockSessionManager.getUnlockedSecret.mockReturnValue(mnemonic);
      mockBitcoin.getPrivateKeyFromMnemonic.mockReturnValue(privateKey);

      const result = await walletManager.getPrivateKey('wallet-123');

      expect(result).toBe(privateKey);
      expect(mockBitcoin.getPrivateKeyFromMnemonic).toHaveBeenCalledWith(
        mnemonic,
        "m/84'/0'/0'/0",
        AddressType.P2WPKH
      );
    });

    it('should get private key for private key wallet', async () => {
      const privateKeyWallet = {
        ...mockEncryptedWallet,
        type: 'privateKey' as const,
      };
      mockWalletStorage.getAllEncryptedWallets.mockResolvedValue([privateKeyWallet]);
      await walletManager.loadWallets();

      const privKeyData = '{"key":"abcd1234567890","compressed":true}';
      mockSessionManager.getUnlockedSecret.mockReturnValue(privKeyData);

      const result = await walletManager.getPrivateKey('wallet-123');

      expect(result).toBe('abcd1234567890');
    });

    it('should throw error for locked wallet', async () => {
      mockSessionManager.getUnlockedSecret.mockReturnValue(null);

      await expect(
        walletManager.getPrivateKey('wallet-123')
      ).rejects.toThrow('Wallet is locked.');
    });
  });
});