/**
 * @module wallet-context
 *
 * Core wallet state management for the extension.
 *
 * This context is the central hub for all wallet operations:
 * - Authentication state (onboarding, locked, unlocked)
 * - Wallet CRUD operations (create, import, remove, reset)
 * - Address management (derivation, selection, switching)
 * - Transaction signing and broadcasting
 * - Cross-tab state synchronization via background messages
 *
 * ## Architecture
 *
 * The context wraps `walletService` which communicates with the background
 * script via message passing. State is refreshed after each operation and
 * synchronized across popup instances via `webext-bridge`.
 *
 * ## Concurrency
 *
 * Uses `withStateLock` to serialize operations and prevent race conditions
 * between state refresh and lock events from the background.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { activeWallet, lockKeychain, isLoading } = useWallet();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!activeWallet) return <OnboardingFlow />;
 *
 *   return <Dashboard wallet={activeWallet} onLock={lockKeychain} />;
 * }
 * ```
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactElement,
  type ReactNode,
  use
} from "react";
import { onMessage } from 'webext-bridge/popup'; // Import for popup context
import { getWalletService } from "@/services/walletService";
import { walletManager } from "@/utils/wallet/walletManager";
import { keychainExists as checkKeychainExists } from "@/utils/storage/walletStorage";
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { withStateLock } from "@/utils/wallet/stateLockManager";
import type { Wallet, Address } from "@/types/wallet";

/**
 * Authentication state enum.
 */
enum AuthState {
  Onboarding = "ONBOARDING_NEEDED",
  Locked = "LOCKED",
  Unlocked = "UNLOCKED",
}

/**
 * Efficient comparison functions to replace JSON.stringify
 */
const addressesEqual = (a: Address[], b: Address[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((addr, i) => 
    addr.address === b[i]?.address && 
    addr.name === b[i]?.name &&
    addr.path === b[i]?.path &&
    addr.pubKey === b[i]?.pubKey
  );
};

const walletsEqualArray = (a: Wallet[], b: Wallet[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((wallet, i) => {
    const other = b[i];
    if (!other) return false;
    return (
      wallet.id === other.id &&
      wallet.name === other.name &&
      wallet.type === other.type &&
      wallet.addressFormat === other.addressFormat &&
      wallet.addressCount === other.addressCount &&
      addressesEqual(wallet.addresses, other.addresses)
    );
  });
};

/**
 * Internal wallet context state.
 * Tracks authentication status, wallet list, and active selections.
 */
interface WalletState {
  /** Current authentication state (onboarding, locked, or unlocked) */
  authState: AuthState;
  /** Whether a keychain exists in storage (determines onboarding vs locked) */
  keychainExists: boolean;
  /** All wallets in the extension (only populated when unlocked) */
  wallets: Wallet[];
  /** Currently selected wallet, or null if none selected */
  activeWallet: Wallet | null;
  /** Currently selected address within the active wallet */
  activeAddress: Address | null;
  /** Whether the keychain is currently locked */
  keychainLocked: boolean;
  /** True while initial wallet data is loading from storage */
  isLoading: boolean;
}

/**
 * Public API for wallet management.
 * All methods that modify state will trigger a re-render.
 */
interface WalletContextType {
  // ─── State ─────────────────────────────────────────────────────────────────
  /** Current authentication state */
  authState: AuthState;
  /** Whether a keychain exists in storage */
  keychainExists: boolean;
  /** All wallets in the extension */
  wallets: Wallet[];
  /** Currently active wallet */
  activeWallet: Wallet | null;
  /** Currently active address */
  activeAddress: Address | null;
  /** Whether the keychain is locked */
  keychainLocked: boolean;
  /** True while loading initial state */
  isLoading: boolean;

  // ─── Authentication ────────────────────────────────────────────────────────
  /** Unlock the keychain with password */
  unlockKeychain: (password: string) => Promise<void>;
  /** Load a specific wallet after keychain is unlocked */
  selectWallet: (walletId: string) => Promise<void>;
  /** Lock the keychain and clear sensitive data from memory */
  lockKeychain: () => Promise<void>;
  /** Verify password without unlocking */
  verifyPassword: (password: string) => Promise<boolean>;
  /** Update the master password for all wallets */
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // ─── Wallet Selection ──────────────────────────────────────────────────────
  /** Set the active wallet. If useLastActive, restores last used address */
  setActiveWallet: (wallet: Wallet | null, useLastActive?: boolean) => Promise<void>;
  /** Set the active address within the current wallet */
  setActiveAddress: (address: Address | null) => Promise<void>;
  /** Update last activity timestamp (for auto-lock) */
  setLastActiveTime: () => Promise<void>;
  /** Check if keychain is currently locked */
  isKeychainLocked: () => Promise<boolean>;

  // ─── Wallet Creation ───────────────────────────────────────────────────────
  /** Create wallet from mnemonic and unlock it */
  createMnemonicWallet: (
    mnemonic: string,
    password: string,
    name?: string,
    addressFormat?: AddressFormat
  ) => Promise<Wallet>;
  /** Create wallet from private key and unlock it */
  createPrivateKeyWallet: (
    privateKey: string,
    password: string,
    name?: string,
    addressFormat?: AddressFormat
  ) => Promise<Wallet>;
  /** Import a test/watch-only address (dev mode only) */
  importTestAddress: (address: string, name?: string) => Promise<Wallet>;
  /** Create a hardware wallet (Trezor) - private keys never leave device */
  createHardwareWallet: (
    deviceType: 'trezor' | 'ledger',
    addressFormat: AddressFormat,
    accountIndex?: number,
    name?: string,
    usePassphrase?: boolean
  ) => Promise<Wallet>;

  // ─── Wallet Management ─────────────────────────────────────────────────────
  /** Derive a new address in the wallet */
  addAddress: (walletId: string) => Promise<Address>;
  /** Change wallet's address format (P2PKH, P2WPKH, P2TR, etc.) */
  updateWalletAddressFormat: (walletId: string, newType: AddressFormat) => Promise<void>;
  /** Preview what address would be generated for a format */
  getPreviewAddressForFormat: (walletId: string, addressFormat: AddressFormat) => Promise<string>;
  /** Remove a wallet from the extension */
  removeWallet: (walletId: string) => Promise<void>;
  /** Reset all wallets (factory reset) */
  resetKeychain: (password: string) => Promise<void>;

  // ─── Secrets (require unlock) ──────────────────────────────────────────────
  /** Get decrypted mnemonic for backup */
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  /** Get private key in WIF and hex formats */
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<{ wif: string; hex: string; compressed: boolean }>;

  // ─── Transactions ──────────────────────────────────────────────────────────
  /** Sign a raw transaction hex */
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  /** Broadcast a signed transaction to the network */
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

/**
 * Wraps an async function with state refresh and proper locking.
 * This ensures operations are serialized and state is consistent.
 */
const withRefresh = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  refresh: () => Promise<void>,
  lockKey: string = 'wallet-operation'
) => async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
  return withStateLock(lockKey, async () => {
    const result = await fn(...args);
    await refresh();
    return result;
  });
};

/**
 * Provides wallet context to the application using React 19's <Context>.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement} Context provider
 */
export function WalletProvider({ children }: { children: ReactNode }): ReactElement {
  const walletService = getWalletService();
  const [walletState, setWalletState] = useState<WalletState>({
    authState: AuthState.Onboarding,
    keychainExists: false,
    wallets: [],
    activeWallet: null,
    activeAddress: null,
    keychainLocked: true,
    isLoading: true,
  });

  // Use ref to access current state without adding to dependency array
  // This prevents stale closure issues and infinite re-renders
  const walletStateRef = useRef(walletState);
  walletStateRef.current = walletState;

  // Track lock state version to prevent stale updates from overriding lock events
  const lockStateVersionRef = useRef(0);

  const refreshWalletState = useCallback(async () => {
    // Use proper locking instead of simple ref check
    return withStateLock('wallet-refresh', async () => {
      // Capture lock version at start to detect if lock event happens during refresh
      const startLockVersion = lockStateVersionRef.current;

      try {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WalletContext] Starting state refresh, version:', startLockVersion);
      }

      await walletService.refreshWallets();
      const allWallets = await walletService.getWallets();

      // Use ref to get current state without triggering re-renders
      const currentState = walletStateRef.current;
      const newState: WalletState = { ...currentState };

      // Check if keychain exists in storage (fast check, no crypto)
      newState.keychainExists = await checkKeychainExists();

      let walletsEqual = walletsEqualArray(newState.wallets, allWallets);
      let activeChanged = false;
      let addressChanged = false;
      let lockChanged = false;

      if (allWallets.length === 0) {
        if (process.env.NODE_ENV === 'development' && newState.authState !== AuthState.Onboarding) {
          console.log('[WalletContext] Transition: ', newState.authState, ' -> ', AuthState.Onboarding);
        }
        newState.authState = AuthState.Onboarding;
        newState.activeWallet = null;
        newState.activeAddress = null;
        newState.keychainLocked = true;
      } else {
        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        const newAuthState = anyUnlocked ? AuthState.Unlocked : AuthState.Locked;
        if (process.env.NODE_ENV === 'development' && newState.authState !== newAuthState) {
          console.log('[WalletContext] Transition: ', newState.authState, ' -> ', newAuthState);
        }
        newState.keychainLocked = !anyUnlocked;
        newState.authState = newAuthState;

        // Store for later use to avoid duplicate call
        lockChanged = currentState.keychainLocked !== !anyUnlocked;
      }

      if (!walletsEqual) newState.wallets = allWallets;

      if (allWallets.length > 0) {
        let active = await walletService.getActiveWallet();
        if (!active) {
          active = allWallets[0];
          await walletService.setActiveWallet(active.id);
        }
        if (
          (activeChanged = newState.activeWallet?.id !== active.id) ||
          (newState.activeWallet &&
            active &&
            !addressesEqual(newState.activeWallet.addresses, active.addresses))
        ) {
          newState.activeWallet = active;
        }

        const lastActiveAddress = await walletService.getLastActiveAddress();
        const newActiveAddress =
          lastActiveAddress && active.addresses.some((addr) => addr.address === lastActiveAddress)
            ? active.addresses.find((addr) => addr.address === lastActiveAddress) || active.addresses[0]
            : active.addresses[0] || null;
        addressChanged = newState.activeAddress?.address !== newActiveAddress?.address;
        if (addressChanged) newState.activeAddress = newActiveAddress;

        // No need to call isAnyWalletUnlocked again - we already have the lock state from above
      } else {
        newState.activeWallet = null;
        newState.activeAddress = null;
        newState.keychainLocked = true;
        newState.authState = AuthState.Onboarding;
      }

      newState.isLoading = false;

      // Check if lock version changed during refresh (lock event happened)
      // If so, don't apply potentially stale unlock state
      if (lockStateVersionRef.current !== startLockVersion) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WalletContext] Discarding stale refresh - lock event occurred');
        }
        // Only update non-lock-related state
        setWalletState((prev) => ({
          ...prev,
          wallets: newState.wallets,
          isLoading: false,
        }));
        return;
      }

      if (!walletsEqual || activeChanged || addressChanged || lockChanged || currentState.isLoading) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WalletContext] State update:', {
            walletsChanged: !walletsEqual,
            activeChanged,
            addressChanged,
            lockChanged,
            firstLoad: currentState.isLoading,
            newAuthState: newState.authState
          });
        }
        setWalletState(newState);
      }
      } catch (error) {
        console.error("Error refreshing wallet state:", error);
        setWalletState((prev) => ({ ...prev, isLoading: false }));
      }
    });
  }, [walletService]); // Removed walletState - using ref instead to prevent stale closures

  useEffect(() => {
    // Initial load with retry for cold-start race condition
    const loadWithRetry = async () => {
      await new Promise(r => setTimeout(r, 100));
      await refreshWalletState();

      // If no wallets found, retry once after longer delay
      // Handles background service worker cold-start in development
      const currentWallets = walletStateRef.current.wallets;
      if (currentWallets.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WalletContext] No wallets on first load, retrying...');
        }
        await new Promise(r => setTimeout(r, 400));
        await refreshWalletState();
      }
    };
    loadWithRetry();

    // Listen for wallet lock events from background
    // This MUST use the same lock key to prevent race with refreshWalletState
    const handleLockMessage = ({ data }: { data: { locked: boolean } }) => {
      if (data.locked) {
        // Use withStateLock to serialize with refreshWalletState
        withStateLock('wallet-refresh', async () => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[WalletContext] Lock event received from background');
          }
          // Increment version to invalidate any concurrent refresh
          lockStateVersionRef.current++;
          // Update state to trigger navigation
          setWalletState((prev) => ({
            ...prev,
            authState: AuthState.Locked,
            keychainLocked: true,
            activeWallet: null,
            activeAddress: null,
          }));
        });
      }
    };
    const unsubscribe = onMessage('keychainLocked', handleLockMessage);

    return () => {
      // Properly cleanup the message listener
      unsubscribe();
    };
  }, [refreshWalletState, walletService]); // Removed walletState.authState to prevent re-runs

  const setActiveWallet = useCallback(
    async (wallet: Wallet | null, useLastActive?: boolean) => {
      return withStateLock('wallet-set-active', async () => {
        if (wallet) {
        await walletService.setActiveWallet(wallet.id);
        const lastActiveAddress = useLastActive ? await walletService.getLastActiveAddress() : undefined;
        const newActiveAddress =
          lastActiveAddress && wallet.addresses.some((addr) => addr.address === lastActiveAddress)
            ? wallet.addresses.find((addr) => addr.address === lastActiveAddress) ?? wallet.addresses[0]
            : wallet.addresses[0];
        
        // When switching wallets, maintain unlocked state if ANY wallet is unlocked
        // This prevents redirect to lock screen when switching between wallets
        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        
        setWalletState((prev) => ({
          ...prev,
          activeWallet: wallet,
          activeAddress: newActiveAddress ?? null,
          // Keep unlocked state if any wallet is unlocked
          authState: anyUnlocked ? AuthState.Unlocked : prev.authState,
          keychainLocked: !anyUnlocked,
        }));
        if (newActiveAddress) await walletService.setLastActiveAddress(newActiveAddress.address);
        } else {
          await walletService.setActiveWallet("");
          setWalletState((prev) => ({ ...prev, activeWallet: null, activeAddress: null }));
        }
      });
    },
    [walletService]
  );

  const setActiveAddress = useCallback(
    async (address: Address | null) => {
      return withStateLock('wallet-set-address', async () => {
        // Use ref to get current address without stale closure
        const oldAddress = walletStateRef.current.activeAddress?.address;
        const newAddress = address?.address;

      // Handle address switch - emit accountsChanged to all connected sites
      if (oldAddress && newAddress && oldAddress !== newAddress) {
        // Get connected sites from settings
        const settings = walletManager.getSettings();

        // Emit accountsChanged event to each connected site with new address
        // The wallet service proxy will handle the communication to background
        if (settings.connectedWebsites.length > 0) {
          // Use the wallet service to emit provider events
          for (const origin of settings.connectedWebsites) {
            await walletService.emitProviderEvent(origin, 'accountsChanged', [newAddress]);
          }
        }
      }

        setWalletState((prev) => ({ ...prev, activeAddress: address }));
        if (address) await walletService.setLastActiveAddress(address.address);
      });
    },
    [walletService]
  );

  const setLastActiveTime = useCallback(async () => {
    await walletService.setLastActiveTime();
  }, [walletService]);

  const isKeychainLocked = useCallback(async () => {
    // Check if keychain is unlocked (master key available in session)
    return !(await walletService.isAnyWalletUnlocked());
  }, [walletService]);

  const value = useMemo<WalletContextType>(() => ({
    authState: walletState.authState,
    keychainExists: walletState.keychainExists,
    wallets: walletState.wallets,
    activeWallet: walletState.activeWallet,
    activeAddress: walletState.activeAddress,
    keychainLocked: walletState.keychainLocked,
    isLoading: walletState.isLoading,
    unlockKeychain: withRefresh(walletService.unlockKeychain, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }, 'wallet-unlock-keychain'),
    selectWallet: withRefresh(walletService.selectWallet, refreshWalletState, 'wallet-load'),
    lockKeychain: async () => {
      return withStateLock('wallet-lock', async () => {
        // Immediately set state to locked to trigger navigation
        setWalletState((prev) => ({
          ...prev,
          authState: AuthState.Locked,
          keychainLocked: true,
          activeWallet: null,
          activeAddress: null,
        }));

        // Then actually lock in the background
        await walletService.lockKeychain();
      });
    },
    setActiveWallet,
    setActiveAddress,
    addAddress: withRefresh(walletService.addAddress, refreshWalletState),
    updatePassword: withRefresh(walletService.updatePassword, refreshWalletState),
    createMnemonicWallet: withRefresh(walletService.createMnemonicWallet, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }),
    createPrivateKeyWallet: withRefresh(walletService.createPrivateKeyWallet, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }),
    importTestAddress: withRefresh(walletService.importTestAddress, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }),
    createHardwareWallet: withRefresh(walletService.createHardwareWallet, refreshWalletState),
    resetKeychain: async (password) => {
      await walletService.resetKeychain(password);
      setWalletState({
        authState: AuthState.Onboarding,
        keychainExists: false,
        wallets: [],
        activeWallet: null,
        activeAddress: null,
        keychainLocked: true,
        isLoading: false,
      });
    },
    getUnencryptedMnemonic: walletService.getUnencryptedMnemonic,
    getPrivateKey: walletService.getPrivateKey,
    setLastActiveTime,
    verifyPassword: walletService.verifyPassword,
    updateWalletAddressFormat: withRefresh(walletService.updateWalletAddressFormat, refreshWalletState),
    getPreviewAddressForFormat: walletService.getPreviewAddressForFormat,
    removeWallet: withRefresh(walletService.removeWallet, refreshWalletState),
    signTransaction: walletService.signTransaction,
    broadcastTransaction: walletService.broadcastTransaction,
    isKeychainLocked,
  }), [
    walletState,
    walletService,
    refreshWalletState,
    setActiveWallet,
    setActiveAddress,
    setLastActiveTime,
    isKeychainLocked,
  ]);

  return <WalletContext value={value}>{children}</WalletContext>;
}

/**
 * Hook to access wallet context using React 19's `use`.
 * @returns {WalletContextType} Wallet context value
 * @throws {Error} If used outside WalletProvider
 */
export function useWallet(): WalletContextType {
  const context = use(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}
