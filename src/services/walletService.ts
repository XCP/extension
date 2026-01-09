import { defineProxyService } from '@/utils/proxy';
import { MessageBus } from '@/services/core/MessageBus';
import { eventEmitterService } from '@/services/eventEmitterService';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { walletManager, type Wallet, type Address } from '@/utils/wallet/walletManager';
import { getSettings, updateSettings } from '@/utils/storage/settingsStorage';

interface WalletService {
  loadWallets: () => Promise<void>;
  getWallets: () => Promise<Wallet[]>;
  getActiveWallet: () => Promise<Wallet | undefined>;
  getActiveAddress: () => Promise<Address | undefined>;
  setActiveWallet: (walletId: string) => Promise<void>;
  unlockWallet: (walletId: string, password: string) => Promise<void>;
  lockAllWallets: () => Promise<void>;
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
  resetAllWallets: (password: string) => Promise<void>;
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
  isAnyWalletUnlocked: () => Promise<boolean>;
  createAndUnlockMnemonicWallet: (
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat?: AddressFormat
  ) => Promise<Wallet>;
  createAndUnlockPrivateKeyWallet: (
    privateKey: string,
    password: string,
    name?: string,
    addressFormat?: AddressFormat
  ) => Promise<Wallet>;
}

function createWalletService(): WalletService {
  return {
    loadWallets: async () => {
      await walletManager.loadWallets();
    },
    getWallets: async () => walletManager.getWallets(),
    getActiveWallet: async () => walletManager.getActiveWallet(),
    getActiveAddress: async () => {
      const activeWallet = walletManager.getActiveWallet();
      if (!activeWallet) return undefined;

      const settings = await getSettings();
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
    unlockWallet: async (walletId, password) => {
      await walletManager.unlockWallet(walletId, password);
      // Emit wallet-unlocked event for any pending connection requests
      eventEmitterService.emit('wallet-unlocked', { walletId });
      // Don't emit provider events here - connections are per-address and per-site
      // The provider service will handle this when sites check connection status
    },
    lockAllWallets: async () => {
      await walletManager.lockAllWallets();
      // Notify popup of lock event (if it's open)
      try {
        await MessageBus.notifyWalletLocked(true);
      } catch (error) {
        // Popup might not be open, which is fine
        console.debug('Could not notify popup of lock event:', error);
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
      return walletManager.createMnemonicWallet(mnemonic, password, name, addressFormat);
    },
    createPrivateKeyWallet: async (privateKey, password, name, addressFormat) => {
      return walletManager.createPrivateKeyWallet(privateKey, password, name, addressFormat);
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
    resetAllWallets: async (password) => {
      await walletManager.resetAllWallets(password);
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
      const settings = await getSettings();
      return settings?.lastActiveAddress;
    },
    setLastActiveAddress: async (address) => {
      await updateSettings({ lastActiveAddress: address });
      // Don't emit accountsChanged here - it's handled in wallet-context
      // which emits to all connected sites
    },
    setLastActiveTime: async () => await walletManager.setLastActiveTime(),
    isAnyWalletUnlocked: async () => walletManager.isAnyWalletUnlocked(),
    emitProviderEvent: async (origin, event, data) => {
      // Emit provider event through the event emitter service
      eventEmitterService.emit('emit-provider-event', {
        origin,
        event,
        data
      });
    },
    createAndUnlockMnemonicWallet: async (mnemonic, password, name, addressFormat) => {
      return walletManager.createAndUnlockMnemonicWallet(mnemonic, password, name, addressFormat);
    },
    createAndUnlockPrivateKeyWallet: async (privateKey, password, name, addressFormat) => {
      return walletManager.createAndUnlockPrivateKeyWallet(privateKey, password, name, addressFormat);
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
