/**
 * WalletService - Core wallet state management
 *
 * Manages wallet lifecycle, authentication, and state:
 * - Wallet creation, import, and deletion
 * - Password-based unlock/lock
 * - Active wallet and address selection
 * - Provider event emission for dApp integration
 */

import { defineProxyService } from '@/utils/proxy';
import { MessageBus } from '@/services/core/MessageBus';
import { eventEmitterService } from '@/services/eventEmitterService';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { walletManager } from '@/utils/wallet/walletManager';
import type { Wallet, Address } from '@/types/wallet';

interface WalletService {
  refreshWallets: () => Promise<void>;
  getSettings: () => Promise<import('@/utils/settings').AppSettings>;
  updateSettings: (updates: Partial<import('@/utils/settings').AppSettings>) => Promise<void>;
  getWallets: () => Promise<Wallet[]>;
  getActiveWallet: () => Promise<Wallet | undefined>;
  getActiveAddress: () => Promise<Address | undefined>;
  setActiveWallet: (walletId: string) => Promise<void>;
  unlockKeychain: (password: string) => Promise<void>;
  selectWallet: (walletId: string) => Promise<void>;
  isKeychainUnlocked: () => Promise<boolean>;
  lockKeychain: () => Promise<void>;
  emitProviderEvent: (origin: string, event: string, data: any) => Promise<void>;
  createMnemonicWallet: (
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat?: AddressFormat
  ) => Promise<Wallet>;
  createPrivateKeyWallet: (
    privateKey: string,
    password: string,
    name?: string,
    addressFormat?: AddressFormat
  ) => Promise<Wallet>;
  importTestAddress: (address: string, name?: string) => Promise<Wallet>;
  addAddress: (walletId: string) => Promise<Address>;
  verifyPassword: (password: string) => Promise<boolean>;
  resetKeychain: (password: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateWalletAddressFormat: (walletId: string, newType: AddressFormat) => Promise<void>;
  updateWalletPinnedAssets: (pinnedAssets: string[]) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<{ wif: string; hex: string; compressed: boolean }>;
  removeWallet: (walletId: string) => Promise<void>;
  getPreviewAddressForFormat: (walletId: string, addressFormat: AddressFormat) => Promise<string>;
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  signMessage: (message: string, address: string) => Promise<{ signature: string; address: string }>;
  signPsbt: (psbtHex: string, signInputs?: Record<string, number[]>, sighashTypes?: number[]) => Promise<string>;
  getLastActiveAddress: () => Promise<string | undefined>;
  setLastActiveAddress: (address: string) => Promise<void>;
  setLastActiveTime: () => Promise<void>;
}

function createWalletService(): WalletService {
  return {
    refreshWallets: async () => {
      await walletManager.refreshWallets();
    },
    getSettings: async () => walletManager.getSettings(),
    updateSettings: async (updates) => {
      await walletManager.updateSettings(updates);
    },
    getWallets: async () => walletManager.getWallets(),
    getActiveWallet: async () => walletManager.getActiveWallet(),
    getActiveAddress: async () => {
      const activeWallet = walletManager.getActiveWallet();
      if (!activeWallet) return undefined;

      const settings = walletManager.getSettings();
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
      await walletManager.setActiveWallet(walletId);
      // Don't emit here - address switching is handled in wallet-context
    },
    unlockKeychain: async (password) => {
      await walletManager.unlockKeychain(password);
      // Emit wallet-unlocked event for any pending connection requests
      eventEmitterService.emit('wallet-unlocked', {});
    },
    selectWallet: async (walletId) => {
      await walletManager.selectWallet(walletId);
    },
    isKeychainUnlocked: async () => {
      return walletManager.isKeychainUnlocked();
    },
    lockKeychain: async () => {
      await walletManager.lockKeychain();
      // Notify popup of keychain lock event (if it's open)
      try {
        await MessageBus.notifyKeychainLocked(true);
      } catch (error) {
        // Popup might not be open, which is fine
        console.debug('[WalletService] Could not notify popup of keychain lock event:', error);
      }
      // Emit disconnect event to connected dApps
      // Broadcast to all tabs (no origin specified)
      eventEmitterService.emit('emit-provider-event', {
        event: 'accountsChanged',
        data: []
      });
      eventEmitterService.emit('emit-provider-event', {
        event: 'disconnect',
        data: {}
      });
    },
    createMnemonicWallet: async (mnemonic, password, name, addressFormat) => {
      const wallet = await walletManager.createMnemonicWallet(mnemonic, password, name, addressFormat);
      // Emit wallet-created event for any pending connection requests waiting for onboarding
      eventEmitterService.emit('wallet-created', { walletId: wallet.id });
      return wallet;
    },
    createPrivateKeyWallet: async (privateKey, password, name, addressFormat) => {
      const wallet = await walletManager.createPrivateKeyWallet(privateKey, password, name, addressFormat);
      // Emit wallet-created event for any pending connection requests waiting for onboarding
      eventEmitterService.emit('wallet-created', { walletId: wallet.id });
      return wallet;
    },
    importTestAddress: async (address: string, name?: string) => {
      // Development-only feature for testing UI with watch-only addresses
      if (process.env.NODE_ENV !== 'development') {
        throw new Error('Test address import is only available in development mode');
      }
      return walletManager.importTestAddress(address, name);
    },
    addAddress: async (walletId) => walletManager.addAddress(walletId),
    verifyPassword: async (password) => walletManager.verifyPassword(password),
    resetKeychain: async (password) => {
      await walletManager.resetKeychain(password);
    },
    updatePassword: async (currentPassword, newPassword) => {
      await walletManager.updatePassword(currentPassword, newPassword);
    },
    updateWalletAddressFormat: async (walletId, newType) => {
      await walletManager.updateWalletAddressFormat(walletId, newType);
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
    getPreviewAddressForFormat: async (walletId, addressFormat) => {
      return await walletManager.getPreviewAddressForFormat(walletId, addressFormat);
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
    signPsbt: async (psbtHex, signInputs, sighashTypes) => {
      return walletManager.signPsbt(psbtHex, signInputs, sighashTypes);
    },
    getLastActiveAddress: async () => {
      const settings = walletManager.getSettings();
      return settings?.lastActiveAddress;
    },
    setLastActiveAddress: async (address) => {
      await walletManager.updateSettings({ lastActiveAddress: address });
      // Don't emit accountsChanged here - it's handled in wallet-context
      // which emits to all connected sites
    },
    setLastActiveTime: async () => await walletManager.setLastActiveTime(),
    emitProviderEvent: async (origin, event, data) => {
      // Emit provider event through the event emitter service
      eventEmitterService.emit('emit-provider-event', {
        origin,
        event,
        data
      });
    },
  };
}

// Create the proxy service
const [registerWalletService, getWalletServiceRaw] = defineProxyService(
  'WalletService',
  createWalletService
);

// Get the wallet service directly from the proxy
function getWalletService(): WalletService {
  return getWalletServiceRaw();
}

export { registerWalletService, getWalletService };
