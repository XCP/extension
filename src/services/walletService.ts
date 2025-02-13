import { walletManager, settingsManager, type Wallet, type Address } from '@/utils/wallet';
import { AddressType } from '@/utils/blockchain/bitcoin';

function createWalletService() {
  return {
    loadWallets: async () => {
      await settingsManager.loadSettings();
      await walletManager.loadWallets();
    },
    getWallets: async (): Promise<Wallet[]> => {
      return walletManager.getWallets();
    },
    getActiveWallet: async (): Promise<Wallet | undefined> => {
      return walletManager.getActiveWallet();
    },
    setActiveWallet: (walletId: string) => {
      walletManager.setActiveWallet(walletId);
    },
    unlockWallet: async (walletId: string, password: string): Promise<void> => {
      await walletManager.unlockWallet(walletId, password);
    },
    lockAllWallets: () => {
      walletManager.lockAllWallets();
    },
    createMnemonicWallet: async (
      mnemonic: string,
      password: string,
      name?: string,s
      addressType?: AddressType
    ): Promise<Wallet> => {
      return walletManager.createMnemonicWallet(mnemonic, password, name, addressType);
    },
    createPrivateKeyWallet: async (
      privateKey: string,
      password: string,
      name?: string,
      addressType?: AddressType
    ): Promise<Wallet> => {
      return walletManager.createPrivateKeyWallet(privateKey, password, name, addressType);
    },
    addAddress: async (walletId: string): Promise<Address> => {
      return walletManager.addAddress(walletId);
    },
    verifyPassword: async (password: string): Promise<boolean> => {
      return walletManager.verifyPassword(password);
    },
    resetAllWallets: async (password: string): Promise<void> => {
      await walletManager.resetAllWallets(password);
    },
    updatePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
      await walletManager.updatePassword(currentPassword, newPassword);
    },
    updateWalletAddressType: async (walletId: string, newType: AddressType): Promise<void> => {
      await walletManager.updateWalletAddressType(walletId, newType);
    },
    updateWalletPinnedAssets: async (walletId: string, pinned: string[]): Promise<void> => {
      await walletManager.updateWalletPinnedAssets(walletId, pinned);
    },
    getSettings: async () => {
      return settingsManager.getSettings();
    },
    updateSettings: async (newSettings: Partial<Parameters<typeof settingsManager.updateSettings>[0]>) => {
      await settingsManager.updateSettings(newSettings);
    },
    setLastActiveTime: () => {
      walletManager.setLastActiveTime();
    },
    getWalletById: (walletId: string): Wallet | undefined => {
      return walletManager.getWalletById(walletId);
    },
    isAnyWalletUnlocked: async (): Promise<boolean> => {
      return walletManager.isAnyWalletUnlocked();
    },
    createAndUnlockMnemonicWallet: async (
      mnemonic: string,
      password: string,
      name?: string,
      addressType: AddressType = AddressType.P2WPKH
    ): Promise<Wallet> => {
      return walletManager.createAndUnlockMnemonicWallet(mnemonic, password, name, addressType);
    },
    createAndUnlockPrivateKeyWallet: async (
      privateKey: string,
      password: string,
      name?: string,
      addressType: AddressType = AddressType.P2WPKH
    ): Promise<Wallet> => {
      return walletManager.createAndUnlockPrivateKeyWallet(privateKey, password, name, addressType);
    },
    getUnencryptedMnemonic: async (walletId: string): Promise<string> => {
      return walletManager.getUnencryptedMnemonic(walletId);
    },
    getPrivateKey: async (walletId: string, derivationPath?: string): Promise<string> => {
      return walletManager.getPrivateKey(walletId, derivationPath);
    },
    removeWallet: async (walletId: string): Promise<void> => {
      await walletManager.removeWallet(walletId);
    },
    getPreviewAddressForType: async (walletId: string, addressType: AddressType): Promise<string> => {
      return walletManager.getPreviewAddressForType(walletId, addressType);
    },
    signTransaction: async (rawTxHex: string, sourceAddress: string): Promise<string> => {
      return walletManager.signTransaction(rawTxHex, sourceAddress);
    },
    broadcastTransaction: async (signedTxHex: string): Promise<{ txid: string; fees?: number }> => {
      return walletManager.broadcastTransaction(signedTxHex);
    },
    getLastActiveAddress: async (): Promise<string | undefined> => {
      const settings = await settingsManager.getSettings();
      return settings?.lastActiveAddress;
    },
    setLastActiveAddress: async (address: string): Promise<void> => {
      await settingsManager.updateSettings({ lastActiveAddress: address });
    },
    onAutoLock: undefined as (() => void) | undefined,
  };
}

import { defineProxyService } from '@webext-core/proxy-service';
export const [registerWalletService, getWalletService] = defineProxyService(
  'WalletService',
  createWalletService
);
