import { defineProxyService } from '@webext-core/proxy-service';
import { sendMessage } from 'webext-bridge/background'; // Import for background context
import { AddressType } from '@/utils/blockchain/bitcoin';
import { walletManager, settingsManager, type Wallet, type Address } from '@/utils/wallet';

interface WalletService {
  loadWallets: () => Promise<void>;
  getWallets: () => Promise<Wallet[]>;
  getActiveWallet: () => Promise<Wallet | undefined>;
  getActiveAddress: () => Promise<Address | undefined>;
  setActiveWallet: (walletId: string) => Promise<void>;
  unlockWallet: (walletId: string, password: string) => Promise<void>;
  lockAllWallets: () => Promise<void>;
  createMnemonicWallet: (
    mnemonic: string,
    password: string,
    name?: string,
    addressType?: AddressType
  ) => Promise<Wallet>;
  createPrivateKeyWallet: (
    privateKey: string,
    password: string,
    name?: string,
    addressType?: AddressType
  ) => Promise<Wallet>;
  addAddress: (walletId: string) => Promise<Address>;
  verifyPassword: (password: string) => Promise<boolean>;
  resetAllWallets: (password: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateWalletAddressType: (walletId: string, newType: AddressType) => Promise<void>;
  updateWalletPinnedAssets: (pinnedAssets: string[]) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<{ key: string; compressed: boolean }>;
  removeWallet: (walletId: string) => Promise<void>;
  getPreviewAddressForType: (walletId: string, addressType: AddressType) => Promise<string>;
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  signMessage: (message: string, address: string) => Promise<{ signature: string; address: string }>;
  getLastActiveAddress: () => Promise<string | undefined>;
  setLastActiveAddress: (address: string) => Promise<void>;
  setLastActiveTime: () => Promise<void>;
  isAnyWalletUnlocked: () => Promise<boolean>;
  createAndUnlockMnemonicWallet: (
    mnemonic: string,
    password: string,
    name?: string,
    addressType?: AddressType
  ) => Promise<Wallet>;
  createAndUnlockPrivateKeyWallet: (
    privateKey: string,
    password: string,
    name?: string,
    addressType?: AddressType
  ) => Promise<Wallet>;
}

function createWalletService(): WalletService {
  return {
    loadWallets: async () => {
      await settingsManager.loadSettings();
      await walletManager.loadWallets();
    },
    getWallets: async () => walletManager.getWallets(),
    getActiveWallet: async () => walletManager.getActiveWallet(),
    getActiveAddress: async () => {
      const activeWallet = walletManager.getActiveWallet();
      if (!activeWallet) return undefined;
      
      const settings = await settingsManager.getSettings();
      const lastActiveAddress = settings?.lastActiveAddress;
      
      if (!lastActiveAddress) {
        // Return the first address if no last active address is set
        return activeWallet.addresses[0];
      }
      
      // Find the address in the active wallet
      const address = activeWallet.addresses.find(addr => addr.address === lastActiveAddress);
      return address || activeWallet.addresses[0];
    },
    setActiveWallet: async (walletId) => {
      walletManager.setActiveWallet(walletId);
      await settingsManager.updateSettings({ lastActiveWalletId: walletId });
      // Don't emit here - address switching is handled in wallet-context
    },
    unlockWallet: async (walletId, password) => {
      await walletManager.unlockWallet(walletId, password);
      // Don't emit events here - connections are per-address and per-site
      // The provider service will handle this when sites check connection status
    },
    lockAllWallets: async () => {
      await walletManager.lockAllWallets();
      // Notify popup of lock event (if it's open)
      try {
        await sendMessage('walletLocked', { locked: true }, 'popup');
      } catch (error) {
        // Popup might not be open, which is fine
        console.debug('Could not notify popup of lock event:', error);
      }
      // Emit disconnect event to connected dApps
      const emitEvent = (globalThis as any).emitProviderEvent;
      if (emitEvent) {
        emitEvent('accountsChanged', []);
        emitEvent('disconnect', {});
      }
    },
    createMnemonicWallet: async (mnemonic, password, name, addressType) => {
      return walletManager.createMnemonicWallet(mnemonic, password, name, addressType);
    },
    createPrivateKeyWallet: async (privateKey, password, name, addressType) => {
      return walletManager.createPrivateKeyWallet(privateKey, password, name, addressType);
    },
    addAddress: async (walletId) => walletManager.addAddress(walletId),
    verifyPassword: async (password) => walletManager.verifyPassword(password),
    resetAllWallets: async (password) => {
      await walletManager.resetAllWallets(password);
    },
    updatePassword: async (currentPassword, newPassword) => {
      await walletManager.updatePassword(currentPassword, newPassword);
    },
    updateWalletAddressType: async (walletId, newType) => {
      await walletManager.updateWalletAddressType(walletId, newType);
    },
    updateWalletPinnedAssets: async (pinnedAssets) => {
      await walletManager.updateWalletPinnedAssets(pinnedAssets);
    },
    getUnencryptedMnemonic: async (walletId) => {
      return await walletManager.getUnencryptedMnemonic(walletId);
    },
    getPrivateKey: async (walletId, derivationPath) => {
      return walletManager.getPrivateKey(walletId, derivationPath);
    },
    removeWallet: async (walletId) => {
      await walletManager.removeWallet(walletId);
    },
    getPreviewAddressForType: async (walletId, addressType) => {
      return await walletManager.getPreviewAddressForType(walletId, addressType);
    },
    signTransaction: async (rawTxHex, sourceAddress) => {
      return walletManager.signTransaction(rawTxHex, sourceAddress);
    },
    broadcastTransaction: async (signedTxHex) => {
      return walletManager.broadcastTransaction(signedTxHex);
    },
    signMessage: async (message, address) => {
      return walletManager.signMessage(message, address);
    },
    getLastActiveAddress: async () => {
      const settings = await settingsManager.getSettings();
      return settings?.lastActiveAddress;
    },
    setLastActiveAddress: async (address) => {
      await settingsManager.updateSettings({ lastActiveAddress: address });
      // Don't emit accountsChanged here - it's handled in wallet-context
      // which emits to all connected sites
    },
    setLastActiveTime: async () => await walletManager.setLastActiveTime(),
    isAnyWalletUnlocked: async () => walletManager.isAnyWalletUnlocked(),
    createAndUnlockMnemonicWallet: async (mnemonic, password, name, addressType) => {
      return walletManager.createAndUnlockMnemonicWallet(mnemonic, password, name, addressType);
    },
    createAndUnlockPrivateKeyWallet: async (privateKey, password, name, addressType) => {
      return walletManager.createAndUnlockPrivateKeyWallet(privateKey, password, name, addressType);
    },
  };
}

export const [registerWalletService, getWalletService] = defineProxyService(
  'WalletService',
  createWalletService
);
