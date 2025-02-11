import { walletManager, settingsManager, type Wallet, type Address } from '@/utils/wallet';
import * as sessionManager from '@/utils/auth/sessionManager';
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
      name?: string,
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
    // Expose missing methods:
    getWalletById: (walletId: string): Wallet | undefined => {
      return walletManager.getWalletById(walletId);
    },
    isAnyWalletUnlocked: async (): Promise<boolean> => {
      return walletManager.isAnyWalletUnlocked();
    },
    // Expose onAutoLock via getter and setter:
    get onAutoLock() {
      return walletManager.onAutoLock;
    },
    set onAutoLock(callback: (() => void) | undefined) {
      walletManager.onAutoLock = callback;
    },
    createAndUnlockMnemonicWallet: async (
      mnemonic: string,
      password: string,
      name?: string,
      addressType: AddressType = AddressType.P2WPKH
    ): Promise<Wallet> => {
      return walletManager.createAndUnlockMnemonicWallet(mnemonic, password, name, addressType);
    },
    getUnencryptedMnemonic: async (walletId: string): Promise<string> => {
      const secret = sessionManager.getUnlockedSecret(walletId);
      if (!secret) throw new Error('Wallet secret not found or locked');
      return secret;
    },
    getPrivateKey: async (walletId: string, pathIndex: number = 0): Promise<string> => {
      return walletManager.getPrivateKey(walletId, pathIndex);
    },
  };
}

import { defineProxyService } from '@webext-core/proxy-service';
export const [registerWalletService, getWalletService] = defineProxyService(
  'WalletService',
  createWalletService
);
