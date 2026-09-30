/**
 * WalletService - Core wallet state management
 *
 * Manages wallet lifecycle, authentication, and state:
 * - Wallet creation, import, and deletion
 * - Password-based unlock/lock
 * - Active wallet and address selection
 * - Provider event emission for dApp integration
 */

import type { AddressFormat } from '@/core/bitcoin/addressFormat';
import type { CoinLock, CoinLockUpdate, OfferCoinCommitment } from '@/core/bitcoin/coinLocks';
import type { ConsolidationResult as BatchConsolidationResult } from '@/core/bitcoin/consolidateBatch';
import type { ConsolidationData } from '@/core/bitcoin/consolidationApi';
import type { KnownZeldOutpoint, ZeldOutpointUpdate } from '@/core/zeld/knownOutpoints';
import { registerSessionExpiredHandler, setLastActiveTime } from '@/platform/auth/sessionManager';
import { defineProxyServer } from '@/platform/proxy/server';
import { walletManager } from '@/platform/walletManager';
import { eventEmitterService } from '@/services/eventEmitterService';
import { WALLET_SERVICE_NAME, WALLET_SERVICE_POLICY } from '@/services/walletServiceClient';
import type { Address, PairedAddresses, RevealSecretRequest, SignPsbtOptions, SignTransactionOptions, Wallet } from '@/types/wallet';

export interface WalletService {
  refreshWallets: () => Promise<void>;
  getSettings: () => Promise<import('@/core/settings').AppSettings>;
  /** Everything but the connection grants, which change only through the connection flow. */
  updateSettings: (updates: Partial<import('@/core/settings').AppSettings>) => Promise<void>;
  addConnectedWebsite: (origin: string, pairedIdentity?: { walletId: string; address: string; pairedAddress?: string }) => Promise<void>;
  removeConnectedWebsite: (origin: string) => Promise<void>;
  setPairedAddressPermission: (origin: string, identity: { walletId: string; address: string; pairedAddress?: string } | null) => Promise<void>;
  getWallets: () => Promise<Wallet[]>;
  getActiveWallet: () => Promise<Wallet | undefined>;
  getActiveAddress: () => Promise<Address | undefined>;
  unlockKeychain: (password: string) => Promise<void>;
  selectWallet: (walletId: string) => Promise<void>;
  isKeychainUnlocked: () => Promise<boolean>;
  /** Load the keychain from the session master key, if a valid session has one. */
  ensureKeychainLoaded: () => Promise<void>;
  lockKeychain: () => Promise<void>;
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
  /**
   * A recovery phrase or WIF private key for the reveal screens, once the password is checked here.
   * Null for a wrong password, which counts as a failed unlock attempt.
   */
  revealSecret: (request: RevealSecretRequest) => Promise<string | null>;
  removeWallet: (walletId: string) => Promise<void>;
  /** The address a format gives at a derivation index (default 0). */
  getPreviewAddressForFormat: (walletId: string, addressFormat: AddressFormat, addressIndex?: number) => Promise<string>;
  getPairedAddresses: () => Promise<PairedAddresses>;
  isAddressInAnyWallet: (address: string) => Promise<boolean>;
  signTransaction: (rawTxHex: string, sourceAddress: string, options?: SignTransactionOptions, expectedIdentity?: { walletId: string; address: string }) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  signMessage: (message: string, address: string, expectedIdentity?: { walletId: string; address: string }) => Promise<{ signature: string; address: string }>;
  signPsbt: (psbtHex: string, signInputs?: Record<string, number[]>, sighashTypes?: number[], expectedIdentity?: { walletId: string; address: string }, options?: SignPsbtOptions) => Promise<string>;
  getLastActiveAddress: () => Promise<string | undefined>;
  /** Outputs `address` was last known to hold ZELD on, for approvals while the indexer is down. */
  getKnownZeldOutpoints: (address: string) => Promise<KnownZeldOutpoint[]>;
  /** Update, in the encrypted keychain, the record of `address`'s ZELD outputs. */
  recordZeldOutpoints: (address: string, update: ZeldOutpointUpdate) => Promise<void>;
  /** `address`'s locked coins (core/bitcoin/coinLocks), unlocked ones included. Empty while locked. */
  getCoinLocks: (address: string) => Promise<CoinLock[]>;
  /** Coin control from an extension page: lock, unlock, lock again, or what a UTXO read saw. */
  updateCoinLocks: (address: string, update: CoinLockUpdate) => Promise<void>;
  /** Background only: lock the coins an offer signature just committed. */
  addOfferCoinLocks: (address: string, commitments: OfferCoinCommitment[]) => Promise<void>;
  setLastActiveAddress: (address: string) => Promise<void>;
  /** Record user activity; `activityTime` is when it happened, for activity the UI reports late. */
  setLastActiveTime: (activityTime?: number) => Promise<void>;
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
  function emitAccountsChangedToConnected(addresses: string[], origins = walletManager.getSettings().connectedWebsites) {
    for (const origin of origins) {
      eventEmitterService.emit('emit-provider-event', { origin, event: 'accountsChanged', data: addresses });
    }
  }

  /**
   * Run an operation that can change the active address (switching wallet or address, a format
   * change, adding or removing a wallet) and, if it did, tell connected sites. Decided here, from
   * the state that answers `xcp_accounts`, rather than by whichever extension page happened to
   * make the change.
   */
  async function withActiveAddressChange<T>(operation: () => Promise<T>): Promise<T> {
    const before = resolveActiveAddressString();
    const result = await operation();
    const after = resolveActiveAddressString();
    if (after !== before) emitAccountsChangedToConnected(after ? [after] : []);
    return result;
  }

  const service: WalletService = {
    refreshWallets: async () => {
      await walletManager.refreshWallets();
    },
    getSettings: async () => walletManager.getSettings(),
    updateSettings: async (updates) => {
      // Grants are written only by the connection flow (ConnectionService), which asks the user
      // first. A settings write that carried them could re-grant a revoked site or overwrite a
      // grant made meanwhile from a stale copy.
      if (Object.hasOwn(updates, 'connectedWebsites') || Object.hasOwn(updates, 'providerCapabilities')) {
        throw new Error('Connected sites change only through the connection flow');
      }
      await walletManager.updateSettings(updates);
    },
    addConnectedWebsite: async (origin, pairedIdentity) => walletManager.addConnectedWebsite(origin, pairedIdentity),
    removeConnectedWebsite: async (origin) => walletManager.removeConnectedWebsite(origin),
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
    selectWallet: async (walletId) => withActiveAddressChange(() => walletManager.selectWallet(walletId)),
    isKeychainUnlocked: async () => {
      return walletManager.isKeychainUnlocked();
    },
    ensureKeychainLoaded: async () => {
      await walletManager.ensureKeychainLoaded();
    },
    lockKeychain: async () => {
      // The connected sites live in the keychain's settings, which locking discards; read them first.
      const connected = [...walletManager.getSettings().connectedWebsites];
      // Locking removes the master key from session storage, which is what every open popup and
      // side panel watches (see watchKeychainLock); nothing is sent to them.
      await walletManager.lockKeychain();
      // Tell connected dApps the accounts are gone — per-origin, and without a
      // terminal disconnect, so unlock can restore them via accountsChanged.
      emitAccountsChangedToConnected([], connected);
    },
    createMnemonicWallet: async (mnemonic, password, name, addressFormat) => {
      const wallet = await withActiveAddressChange(
        () => walletManager.createMnemonicWallet(mnemonic, password, name, addressFormat));
      // Emit wallet-created event for any pending connection requests waiting for onboarding
      eventEmitterService.emit('wallet-created', { walletId: wallet.id });
      return wallet;
    },
    createPrivateKeyWallet: async (privateKey, password, name, addressFormat) => {
      const wallet = await withActiveAddressChange(
        () => walletManager.createPrivateKeyWallet(privateKey, password, name, addressFormat));
      // Emit wallet-created event for any pending connection requests waiting for onboarding
      eventEmitterService.emit('wallet-created', { walletId: wallet.id });
      return wallet;
    },
    importTestAddress: async (address: string, name?: string) => {
      // Development-only feature for testing UI with watch-only addresses
      if (process.env.NODE_ENV !== 'development') {
        throw new Error('Test address import is only available in development mode');
      }
      return withActiveAddressChange(() => walletManager.importTestAddress(address, name));
    },
    createHardwareWalletWithDiscovery: async (deviceType, name, usePassphrase) => {
      return withActiveAddressChange(
        () => walletManager.createHardwareWalletWithDiscovery(deviceType, name, usePassphrase));
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
    updateWalletAddressFormat: async (walletId, newType) => withActiveAddressChange(
      () => walletManager.updateWalletAddressFormat(walletId, newType)),
    revealSecret: async (request) => walletManager.revealSecret(request),
    removeWallet: async (walletId) => withActiveAddressChange(() => walletManager.removeWallet(walletId)),
    getPreviewAddressForFormat: async (walletId, addressFormat, addressIndex) => {
      return await walletManager.getPreviewAddressForFormat(walletId, addressFormat, addressIndex);
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
    signPsbt: async (psbtHex, signInputs, sighashTypes, expectedIdentity, options) => {
      return walletManager.signPsbt(psbtHex, signInputs, sighashTypes, expectedIdentity, options);
    },
    getKnownZeldOutpoints: async (address) => walletManager.getKnownZeldOutpoints(address),
    recordZeldOutpoints: async (address, update) => walletManager.recordZeldOutpoints(address, update),
    getCoinLocks: async (address) => walletManager.getCoinLocks(address),
    updateCoinLocks: async (address, update) => walletManager.updateCoinLocks(address, update),
    addOfferCoinLocks: async (address, commitments) => walletManager.addOfferCoinLocks(address, commitments),
    getLastActiveAddress: async () => {
      const settings = walletManager.getSettings();
      return settings?.lastActiveAddress;
    },
    setLastActiveAddress: async (address) => withActiveAddressChange(
      () => walletManager.updateSettings({ lastActiveAddress: address })),
    setLastActiveTime: async (activityTime) => {
      if (activityTime !== undefined && (typeof activityTime !== 'number' || !Number.isFinite(activityTime))) {
        throw new Error('Invalid activity time');
      }
      await setLastActiveTime(activityTime);
    },
    // Sign in the background so the private key never reaches the popup. The signer holds the
    // key and stops the batch if the wallet locks or the active identity changes mid-batch.
    consolidateBareMultisig: async (sourceAddress, batchData, feeRateSatPerVByte, destinationAddress) =>
      walletManager.consolidateBareMultisig(sourceAddress, batchData, feeRateSatPerVByte, destinationAddress),
  };

  // Lazy expiry detection performs a full lock instead of a bare secret wipe
  registerSessionExpiredHandler(() => service.lockKeychain());

  return service;
}

// Create the proxy service
const [registerWalletService, getWalletServiceRaw] = defineProxyServer(
  WALLET_SERVICE_NAME,
  createWalletService,
  WALLET_SERVICE_POLICY,
);

// Get the wallet service directly from the proxy
function getWalletService(): WalletService {
  return getWalletServiceRaw();
}

export { getWalletService, registerWalletService };
