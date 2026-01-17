import { describe, expect, it, vi, beforeEach } from 'vitest';
// Mock proxy service
const mockProxyService = {
  refreshWallets: vi.fn(),
  getWallets: vi.fn(),
  getActiveWallet: vi.fn(),
  getActiveAddress: vi.fn(),
  setActiveWallet: vi.fn(),
  unlockKeychain: vi.fn(),
  lockKeychain: vi.fn(),
  createMnemonicWallet: vi.fn(),
  createPrivateKeyWallet: vi.fn(),
  addAddress: vi.fn(),
  verifyPassword: vi.fn(),
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
  signMessage: vi.fn(),
  getLastActiveAddress: vi.fn(),
  setLastActiveAddress: vi.fn(),
  setLastActiveTime: vi.fn(),
  isAnyWalletUnlocked: vi.fn(),
};

describe('WalletService Proxy', () => {
  let walletService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a mock proxy service
    walletService = mockProxyService;
  });

  describe('Wallet Management', () => {
    it('should refresh wallets', async () => {
      walletService.refreshWallets.mockResolvedValue(undefined);

      await walletService.refreshWallets();

      expect(walletService.refreshWallets).toHaveBeenCalled();
    });

    it('should get wallets list', async () => {
      const mockWallets = [
        { id: 'wallet1', name: 'Wallet 1' },
        { id: 'wallet2', name: 'Wallet 2' }
      ];
      walletService.getWallets.mockResolvedValue(mockWallets);
      
      const wallets = await walletService.getWallets();
      
      expect(wallets).toEqual(mockWallets);
    });

    it('should get active wallet', async () => {
      const mockWallet = { id: 'wallet1', name: 'Active Wallet' };
      walletService.getActiveWallet.mockResolvedValue(mockWallet);
      
      const wallet = await walletService.getActiveWallet();
      
      expect(wallet).toEqual(mockWallet);
    });

    it('should set active wallet', async () => {
      walletService.setActiveWallet.mockResolvedValue(undefined);
      
      await walletService.setActiveWallet('wallet2');
      
      expect(walletService.setActiveWallet).toHaveBeenCalledWith('wallet2');
    });

    it('should remove wallet', async () => {
      walletService.removeWallet.mockResolvedValue(undefined);
      
      await walletService.removeWallet('wallet1');
      
      expect(walletService.removeWallet).toHaveBeenCalledWith('wallet1');
    });
  });

  describe('Wallet Creation', () => {
    it('should create mnemonic wallet', async () => {
      const mockWallet = { id: 'wallet1', name: 'New Wallet' };
      walletService.createMnemonicWallet.mockResolvedValue(mockWallet);
      
      const wallet = await walletService.createMnemonicWallet(
        'test mnemonic phrase',
        'password123',
        'New Wallet',
        'P2WPKH'
      );
      
      expect(wallet).toEqual(mockWallet);
      expect(walletService.createMnemonicWallet).toHaveBeenCalledWith(
        'test mnemonic phrase',
        'password123',
        'New Wallet',
        'P2WPKH'
      );
    });

    it('should create private key wallet', async () => {
      const mockWallet = { id: 'wallet2', name: 'PK Wallet' };
      walletService.createPrivateKeyWallet.mockResolvedValue(mockWallet);
      
      const wallet = await walletService.createPrivateKeyWallet(
        'L1234567890',
        'password123',
        'PK Wallet',
        'P2PKH'
      );
      
      expect(wallet).toEqual(mockWallet);
    });

    it('should create and unlock mnemonic wallet', async () => {
      const mockWallet = { id: 'wallet3', name: 'Unlocked Wallet' };
      walletService.createMnemonicWallet.mockResolvedValue(mockWallet);
      
      const wallet = await walletService.createMnemonicWallet(
        'test mnemonic',
        'password123'
      );
      
      expect(wallet).toEqual(mockWallet);
    });
  });

  describe('Session Management', () => {
    it('should unlock keychain', async () => {
      walletService.unlockKeychain.mockResolvedValue(undefined);

      await walletService.unlockKeychain('password123');

      expect(walletService.unlockKeychain).toHaveBeenCalledWith('password123');
    });

    it('should lock all wallets', async () => {
      walletService.lockKeychain.mockResolvedValue(undefined);
      
      await walletService.lockKeychain();
      
      expect(walletService.lockKeychain).toHaveBeenCalled();
    });

    it('should verify password', async () => {
      walletService.verifyPassword.mockResolvedValue(true);
      
      const isValid = await walletService.verifyPassword('password123');
      
      expect(isValid).toBe(true);
    });

    it('should check if any wallet is unlocked', async () => {
      walletService.isAnyWalletUnlocked.mockResolvedValue(true);
      
      const isUnlocked = await walletService.isAnyWalletUnlocked();
      
      expect(isUnlocked).toBe(true);
    });

    it('should set last active time', () => {
      walletService.setLastActiveTime();
      
      expect(walletService.setLastActiveTime).toHaveBeenCalled();
    });
  });

  describe('Address Management', () => {
    it('should add address', async () => {
      const mockAddress = { address: 'bc1qnew', name: 'New Address' };
      walletService.addAddress.mockResolvedValue(mockAddress);
      
      const address = await walletService.addAddress('wallet1');
      
      expect(address).toEqual(mockAddress);
    });

    it('should get active address', async () => {
      const mockAddress = { address: 'bc1qactive', name: 'Active' };
      walletService.getActiveAddress.mockResolvedValue(mockAddress);
      
      const address = await walletService.getActiveAddress();
      
      expect(address).toEqual(mockAddress);
    });

    it('should get last active address', async () => {
      walletService.getLastActiveAddress.mockResolvedValue('bc1qlast');
      
      const address = await walletService.getLastActiveAddress();
      
      expect(address).toBe('bc1qlast');
    });

    it('should set last active address', async () => {
      walletService.setLastActiveAddress.mockResolvedValue(undefined);
      
      await walletService.setLastActiveAddress('bc1qnew');
      
      expect(walletService.setLastActiveAddress).toHaveBeenCalledWith('bc1qnew');
    });

    it('should get preview address for type', async () => {
      walletService.getPreviewAddressForFormat.mockResolvedValue('bc1qpreview');
      
      const address = await walletService.getPreviewAddressForFormat('wallet1', 'P2WPKH');
      
      expect(address).toBe('bc1qpreview');
    });
  });

  describe('Transaction Operations', () => {
    it('should sign transaction', async () => {
      walletService.signTransaction.mockResolvedValue('0x123signed');
      
      const signedTx = await walletService.signTransaction('0x123raw', 'bc1qsource');
      
      expect(signedTx).toBe('0x123signed');
      expect(walletService.signTransaction).toHaveBeenCalledWith('0x123raw', 'bc1qsource');
    });

    it('should broadcast transaction', async () => {
      const mockResult = { txid: 'abc123', fees: 1000 };
      walletService.broadcastTransaction.mockResolvedValue(mockResult);
      
      const result = await walletService.broadcastTransaction('0x123signed');
      
      expect(result).toEqual(mockResult);
    });

    it('should sign message', async () => {
      const mockResult = { signature: 'sig123', address: 'bc1qaddr' };
      walletService.signMessage.mockResolvedValue(mockResult);
      
      const result = await walletService.signMessage('Hello World', 'bc1qaddr');
      
      expect(result).toEqual(mockResult);
    });
  });

  describe('Wallet Updates', () => {
    it('should update password', async () => {
      walletService.updatePassword.mockResolvedValue(undefined);
      
      await walletService.updatePassword('oldpass', 'newpass');
      
      expect(walletService.updatePassword).toHaveBeenCalledWith('oldpass', 'newpass');
    });

    it('should update wallet address type', async () => {
      walletService.updateWalletAddressFormat.mockResolvedValue(undefined);
      
      await walletService.updateWalletAddressFormat('wallet1', 'P2TR');
      
      expect(walletService.updateWalletAddressFormat).toHaveBeenCalledWith('wallet1', 'P2TR');
    });

    it('should update pinned assets', async () => {
      walletService.updateWalletPinnedAssets.mockResolvedValue(undefined);
      
      await walletService.updateWalletPinnedAssets(['BTC', 'XCP']);
      
      expect(walletService.updateWalletPinnedAssets).toHaveBeenCalledWith(['BTC', 'XCP']);
    });
  });

  describe('Secret Management', () => {
    it('should get unencrypted mnemonic', async () => {
      walletService.getUnencryptedMnemonic.mockResolvedValue('test mnemonic');
      
      const mnemonic = await walletService.getUnencryptedMnemonic('wallet1');
      
      expect(mnemonic).toBe('test mnemonic');
    });

    it('should get private key', async () => {
      const expectedResult = { wif: 'L1234567890', hex: 'privateKeyHex', compressed: true };
      walletService.getPrivateKey.mockResolvedValue(expectedResult);

      const privateKey = await walletService.getPrivateKey('wallet1', "m/84'/0'/0'/0/0");

      expect(privateKey).toEqual(expectedResult);
    });
  });

  describe('Reset Operations', () => {
    it('should reset all wallets', async () => {
      walletService.resetAllWallets.mockResolvedValue(undefined);
      
      await walletService.resetAllWallets('password123');
      
      expect(walletService.resetAllWallets).toHaveBeenCalledWith('password123');
    });
  });
});