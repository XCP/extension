import { defineProxyService } from '@webext-core/proxy-service';
import { AddressType } from '@/utils/blockchain/bitcoin';
import { walletManager, settingsManager, type Wallet, type Address } from '@/utils/wallet';

interface WalletService {
  loadWallets: () => Promise<void>;
  getWallets: () => Promise<Wallet[]>;
  getActiveWallet: () => Promise<Wallet | undefined>;
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
  updateWalletPinnedAssets: (walletId: string, pinned: string[]) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<string>;
  removeWallet: (walletId: string) => Promise<void>;
  getPreviewAddressForType: (walletId: string, addressType: AddressType) => Promise<string>;
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  getLastActiveAddress: () => Promise<string | undefined>;
  setLastActiveAddress: (address: string) => Promise<void>;
  setLastActiveTime: () => void;
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
    setActiveWallet: async (walletId) => walletManager.setActiveWallet(walletId),
    unlockWallet: async (walletId, password) => {
      await walletManager.unlockWallet(walletId, password);
    },
    lockAllWallets: async () => walletManager.lockAllWallets(),
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
    updateWalletPinnedAssets: async (walletId, pinned) => {
      await walletManager.updateWalletPinnedAssets(walletId, pinned);
    },
    getUnencryptedMnemonic: async (walletId) => {
      return walletManager.getUnencryptedMnemonic(walletId);
    },
    getPrivateKey: async (walletId, derivationPath) => {
      return walletManager.getPrivateKey(walletId, derivationPath);
    },
    removeWallet: async (walletId) => {
      await walletManager.removeWallet(walletId);
    },
    getPreviewAddressForType: async (walletId, addressType) => {
      return walletManager.getPreviewAddressForType(walletId, addressType);
    },
    signTransaction: async (rawTxHex, sourceAddress) => {
      return walletManager.signTransaction(rawTxHex, sourceAddress);
    },
    broadcastTransaction: async (signedTxHex) => {
      return walletManager.broadcastTransaction(signedTxHex);
    },
    getLastActiveAddress: async () => {
      const settings = await settingsManager.getSettings();
      return settings?.lastActiveAddress;
    },
    setLastActiveAddress: async (address) => {
      await settingsManager.updateSettings({ lastActiveAddress: address });
    },
    setLastActiveTime: () => walletManager.setLastActiveTime(),
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
