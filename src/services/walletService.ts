/**
 * WalletService - Core wallet state management
 *
 * Manages wallet lifecycle, authentication, and state:
 * - Wallet creation, import, and deletion
 * - Password-based unlock/lock
 * - Active wallet and address selection
 * - Provider event emission for dApp integration
 */

import type { AddressFormat } from '@/core/bitcoin/address';
import {
  type ConsolidationResult as BatchConsolidationResult,
  consolidateBareMultisigBatch,
} from '@/core/bitcoin/consolidateBatch';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import { registerSessionExpiredHandler } from '@/platform/auth/sessionManager';
import { defineProxyService } from '@/platform/proxy';
import { walletManager } from '@/platform/walletManager';
import { MessageBus } from '@/services/core/MessageBus';
import { eventEmitterService } from '@/services/eventEmitterService';
import type { Address, PairedAddresses, SignTransactionOptions, Wallet } from '@/types/wallet';

interface WalletService {
  refreshWallets: () => Promise<void>;
  getSettings: () => Promise<import('@/core/settings').AppSettings>;
  updateSettings: (updates: Partial<import('@/core/settings').AppSettings>) => Promise<void>;
  addConnectedWebsite: (origin: string, pairedIdentity?: { walletId: string; address: string }) => Promise<void>;
  removeConnectedWebsite: (origin: string) => Promise<void>;
  clearConnectedWebsites: () => Promise<void>;
  setPairedAddressPermission: (origin: string, identity: { walletId: string; address: string } | null) => Promise<void>;
  getWallets: () => Promise<Wallet[]>;
  getActiveWallet: () => Promise<Wallet | undefined>;
  getActiveAddress: () => Promise<Address | undefined>;
  unlockKeychain: (password: string) => Promise<void>;
  selectWallet: (walletId: string) => Promise<void>;
  isKeychainUnlocked: () => Promise<boolean>;
  /** Load the keychain from the session master key, if a valid session has one. */
  ensureKeychainLoaded: () => Promise<void>;
  lockKeychain: () => Promise<void>;
  emitProviderEvent: (origin: string, event: 'accountsChanged', data: string[]) => Promise<void>;
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
  createHardwareWalletWithDiscovery: (
    deviceType: 'trezor' | 'ledger',
    name?: string,
    usePassphrase?: boolean
  ) => Promise<Wallet>;
  addAddress: (walletId: string) => Promise<Address>;
  /** Look for a funded Rare Pepe Wallet UTXO address paired with an address index, and keep it. */
  addUtxoAddress: (walletId: string, index: number) => Promise<Address | null>;
  /** Stop listing a kept UTXO address. */
  removeUtxoAddress: (walletId: string, path: string) => Promise<void>;
  /** Best-effort lookup for UTXO addresses, run where an address first enters the wallet. */
  sweepUtxoAddresses: (walletId: string, indexes?: number[]) => Promise<Address[]>;
  verifyPassword: (password: string) => Promise<boolean>;
  resetKeychain: (password: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateWalletAddressFormat: (walletId: string, newType: AddressFormat) => Promise<void>;
  updateWalletPinnedAssets: (pinnedAssets: string[]) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<{ wif: string; hex: string; compressed: boolean }>;
  removeWallet: (walletId: string) => Promise<void>;
  getPreviewAddressForFormat: (walletId: string, addressFormat: AddressFormat) => Promise<string>;
  getPairedAddresses: () => Promise<PairedAddresses>;
  isAddressInAnyWallet: (address: string) => Promise<boolean>;
  signTransaction: (rawTxHex: string, sourceAddress: string, options?: SignTransactionOptions, expectedIdentity?: { walletId: string; address: string }) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  signMessage: (message: string, address: string, expectedIdentity?: { walletId: string; address: string }) => Promise<{ signature: string; address: string }>;
  signPsbt: (psbtHex: string, signInputs?: Record<string, number[]>, sighashTypes?: number[], expectedIdentity?: { walletId: string; address: string }) => Promise<string>;
  getLastActiveAddress: () => Promise<string | undefined>;
  setLastActiveAddress: (address: string) => Promise<void>;
  setLastActiveTime: () => Promise<void>;
  consolidateBareMultisig: (
    sourceAddress: string,
    batchData: ConsolidationData,
    feeRateSatPerVByte: number,
    destinationAddress?: string
  ) => Promise<BatchConsolidationResult>;
}

function createWalletService(): WalletService {
  // Resolve the active address as a string (mirrors getActiveAddress's selection).
  function resolveActiveAddressString(): string | undefined {
    const activeWallet = walletManager.getActiveWallet();
    if (!activeWallet) return undefined;
    const lastActive = walletManager.getSettings()?.lastActiveAddress;
    const match = activeWallet.addresses.find((a) => a.address === lastActive);
    return (match ?? activeWallet.addresses[0])?.address;
  }

  // Emit accountsChanged to each connected dApp, per-origin (not a global broadcast).
  function emitAccountsChangedToConnected(addresses: string[]) {
    for (const origin of walletManager.getSettings().connectedWebsites) {
      eventEmitterService.emit('emit-provider-event', { origin, event: 'accountsChanged', data: addresses });
    }
  }

  const service: WalletService = {
    refreshWallets: async () => {
      await walletManager.refreshWallets();
    },
    getSettings: async () => walletManager.getSettings(),
    updateSettings: async (updates) => {
      await walletManager.updateSettings(updates);
    },
    addConnectedWebsite: async (origin, pairedIdentity) => walletManager.addConnectedWebsite(origin, pairedIdentity),
    removeConnectedWebsite: async (origin) => walletManager.removeConnectedWebsite(origin),
    clearConnectedWebsites: async () => walletManager.clearConnectedWebsites(),
    setPairedAddressPermission: async (origin, identity) => walletManager.setPairedAddressPermission(origin, identity),
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
    unlockKeychain: async (password) => {
      await walletManager.unlockKeychain(password);
      // Emit wallet-unlocked event for any pending connection requests
      eventEmitterService.emit('wallet-unlocked', {});
      // Tell connected dApps the accounts are back (they were emptied on lock).
      const activeAddress = resolveActiveAddressString();
      if (activeAddress) emitAccountsChangedToConnected([activeAddress]);
    },
    selectWallet: async (walletId) => {
      await walletManager.selectWallet(walletId);
    },
    isKeychainUnlocked: async () => {
      return walletManager.isKeychainUnlocked();
    },
    ensureKeychainLoaded: async () => {
      await walletManager.ensureKeychainLoaded();
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
      // Tell connected dApps the accounts are gone — per-origin, and without a
      // terminal disconnect, so unlock can restore them via accountsChanged.
      emitAccountsChangedToConnected([]);
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
    createHardwareWalletWithDiscovery: async (deviceType, name, usePassphrase) => {
      return walletManager.createHardwareWalletWithDiscovery(deviceType, name, usePassphrase);
    },
    addAddress: async (walletId) => walletManager.addAddress(walletId),
    addUtxoAddress: async (walletId, index) => walletManager.addUtxoAddress(walletId, index),
    removeUtxoAddress: async (walletId, path) => walletManager.removeUtxoAddress(walletId, path),
    sweepUtxoAddresses: async (walletId, indexes) => walletManager.sweepUtxoAddresses(walletId, indexes),
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
    getPairedAddresses: async () => walletManager.getPairedAddresses(),
    isAddressInAnyWallet: async (address) => {
      return walletManager.isAddressInAnyWallet(address);
    },
    signTransaction: async (rawTxHex, sourceAddress, options, expectedIdentity) => {
      return walletManager.signTransaction(rawTxHex, sourceAddress, options, expectedIdentity);
    },
    broadcastTransaction: async (signedTxHex) => {
      return walletManager.broadcastTransaction(signedTxHex);
    },
    signMessage: async (message, address, expectedIdentity) => {
      return walletManager.signMessage(message, address, expectedIdentity);
    },
    signPsbt: async (psbtHex, signInputs, sighashTypes, expectedIdentity) => {
      return walletManager.signPsbt(psbtHex, signInputs, sighashTypes, expectedIdentity);
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
      if (typeof origin !== 'string' || event !== 'accountsChanged' ||
          !Array.isArray(data) || !data.every(address => typeof address === 'string')) {
        throw new Error('Invalid provider event');
      }
      // Emit provider event through the event emitter service
      eventEmitterService.emit('emit-provider-event', {
        origin,
        event,
        data
      });
    },
    consolidateBareMultisig: async (sourceAddress, batchData, feeRateSatPerVByte, destinationAddress) => {
      // Sign in the background so the private key never reaches the popup
      const activeWallet = walletManager.getActiveWallet();
      const address = activeWallet?.addresses.find((a) => a.address === sourceAddress);
      if (!activeWallet || !address) {
        throw new Error('Source address is not part of the active wallet');
      }
      const privateKey = activeWallet.type === 'privateKey'
        ? await walletManager.getPrivateKey(activeWallet.id)
        : await walletManager.getPrivateKey(activeWallet.id, address.path);
      return consolidateBareMultisigBatch(
        privateKey.hex,
        sourceAddress,
        batchData,
        feeRateSatPerVByte,
        destinationAddress
      );
    },
  };

  // Lazy expiry detection performs a full lock instead of a bare secret wipe
  registerSessionExpiredHandler(() => service.lockKeychain());

  return service;
}

// Create the proxy service
const [registerWalletService, getWalletServiceRaw] = defineProxyService(
  'WalletService',
  createWalletService,
  { methods: {
    refreshWallets: 'command', getSettings: 'read', updateSettings: 'command',
    addConnectedWebsite: 'command', removeConnectedWebsite: 'command', clearConnectedWebsites: 'command',
    setPairedAddressPermission: 'command',
    getWallets: 'read', getActiveWallet: 'read', getActiveAddress: 'read',
    unlockKeychain: 'command', selectWallet: 'command', isKeychainUnlocked: 'read',
    ensureKeychainLoaded: 'command', lockKeychain: 'command', emitProviderEvent: 'command',
    createMnemonicWallet: 'command', createPrivateKeyWallet: 'command', importTestAddress: 'command',
    createHardwareWalletWithDiscovery: 'command', addAddress: 'command', addUtxoAddress: 'command',
    removeUtxoAddress: 'command', sweepUtxoAddresses: 'command', verifyPassword: 'command',
    resetKeychain: 'command', updatePassword: 'command', updateWalletAddressFormat: 'command',
    updateWalletPinnedAssets: 'command', getUnencryptedMnemonic: 'command', getPrivateKey: 'command',
    removeWallet: 'command', getPreviewAddressForFormat: 'read', getPairedAddresses: 'read',
    isAddressInAnyWallet: 'read', signTransaction: 'command', broadcastTransaction: 'command',
    signMessage: 'command', signPsbt: 'command', getLastActiveAddress: 'read',
    setLastActiveAddress: 'command', setLastActiveTime: 'command', consolidateBareMultisig: 'command',
  } },
);

// Get the wallet service directly from the proxy
function getWalletService(): WalletService {
  return getWalletServiceRaw();
}

export { getWalletService, registerWalletService };
