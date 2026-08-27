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
  type ReactElement,
  type ReactNode,
  use, 
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { onMessage } from 'webext-bridge/popup'; // Import for popup context
import { AddressFormat } from '@/core/bitcoin/address';
import { recordSpentInputsFromRawTx } from '@/core/bitcoin/spentUtxoCache';
import { recordOwnChangeFromRawTx } from '@/core/counterparty/pendingChange';
import { setSourcePubkeyProvider } from '@/core/counterparty/sourcePubkey';
import { withStateLock } from "@/core/wallet/stateLockManager";
import { keychainExists as checkKeychainExists, watchKeychainRecord } from "@/platform/storage/walletStorage";
import { getWalletService } from "@/services/walletService";
import type { Address, SignTransactionOptions, Wallet } from "@/types/wallet";

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
  /** True while a hardware wallet operation is in progress (disables idle timer) */
  hardwareOperationInProgress: boolean;
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
  /** True while a hardware wallet operation is in progress */
  hardwareOperationInProgress: boolean;
  /** Set the hardware operation in progress flag (pauses idle timer) */
  setHardwareOperationInProgress: (inProgress: boolean) => void;

  // ─── Authentication ────────────────────────────────────────────────────────
  /** Unlock the keychain with password */
  unlockKeychain: (password: string) => Promise<void>;
  /** Decrypt, derive, and make a specific wallet active */
  selectWallet: (walletId: string) => Promise<void>;
  /** Lock the keychain and clear sensitive data from memory */
  lockKeychain: () => Promise<void>;
  /** Verify password without unlocking */
  verifyPassword: (password: string) => Promise<boolean>;
  /** Update the master password for all wallets */
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // ─── Wallet Selection ──────────────────────────────────────────────────────
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
  /** Create a hardware wallet using BIP-44 account discovery */
  createHardwareWalletWithDiscovery: (
    deviceType: 'trezor' | 'ledger',
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
  /** Check whether an address belongs to any wallet in the keychain */
  isAddressInAnyWallet: (address: string) => Promise<boolean>;
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
  /**
   * Sign a raw transaction hex.
   * For hardware wallets, options.psbtHex is required along with inputValues and lockScripts
   * to complete the PSBT with witnessUtxo data.
   */
  signTransaction: (
    rawTxHex: string,
    sourceAddress: string,
    options?: SignTransactionOptions
  ) => Promise<string>;
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
    hardwareOperationInProgress: false,
  });

  // Use ref to access current state without adding to dependency array
  // This prevents stale closure issues and infinite re-renders
  const walletStateRef = useRef(walletState);
  walletStateRef.current = walletState;

  // Track lock state version to prevent stale updates from overriding lock events.
  //
  // This looks redundant and is not. `refreshWalletState` and the lock handler both take the
  // 'wallet-refresh' lock, so they cannot normally interleave — but `stateLockManager` force-
  // releases a lock after 30s while its holder is still running. A refresh that decrypts a wallet
  // and derives addresses can reach that, and then a lock event runs *concurrently* with a refresh
  // that is about to write an unlocked state. The version check below is what discards it.
  //
  // Removing either this or the force-release without the other reintroduces that fail-open.
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

        const walletsEqual = walletsEqualArray(newState.wallets, allWallets);
        let activeChanged = false;
        let addressChanged = false;
        let lockChanged = false;

        // Determine auth state: keychainExists → then unlock status
        const isUnlocked = newState.keychainExists && await walletService.isKeychainUnlocked();
        const targetAuthState = !newState.keychainExists
          ? AuthState.Onboarding
          : isUnlocked ? AuthState.Unlocked : AuthState.Locked;

        if (process.env.NODE_ENV === 'development' && newState.authState !== targetAuthState) {
          console.log('[WalletContext] Transition:', newState.authState, '->', targetAuthState);
        }

        newState.authState = targetAuthState;
        newState.keychainLocked = !isUnlocked;
        lockChanged = currentState.keychainLocked !== newState.keychainLocked;
        if (!walletsEqual) newState.wallets = allWallets;

        // Process active wallet/address only when unlocked with wallets available
        if (isUnlocked && allWallets.length > 0) {
          let active = await walletService.getActiveWallet();
          if (!active) {
            // No active wallet - select the first one (this decrypts and derives addresses)
            await walletService.selectWallet(allWallets[0]!.id);
            active = await walletService.getActiveWallet();
          }
          // Safety check - if still no active wallet, skip wallet/address processing
          if (!active) {
            newState.activeWallet = null;
            newState.activeAddress = null;
          } else {
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
                ? active.addresses.find((addr) => addr.address === lastActiveAddress) || active.addresses[0]!
                : active.addresses[0] || null;
            addressChanged = newState.activeAddress?.address !== newActiveAddress?.address;
            if (addressChanged) newState.activeAddress = newActiveAddress;
          }
        } else {
          newState.activeWallet = null;
          newState.activeAddress = null;
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

        const authStateChanged = currentState.authState !== newState.authState;
        if (!walletsEqual || activeChanged || addressChanged || lockChanged || authStateChanged || currentState.isLoading) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[WalletContext] State update:', {
              walletsChanged: !walletsEqual,
              activeChanged,
              addressChanged,
              lockChanged,
              authStateChanged,
              firstLoad: currentState.isLoading,
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

  // Give the compose layer a way to look up an address's public key. Compose needs it as the
  // recovery key when a message overflows into bare-multisig encoding, and core cannot find one
  // for a never-spent address (see core/counterparty/sourcePubkey.ts). Registered over the loaded
  // wallets rather than just the active address: some flows compose from an address that is not
  // the active one, and the lookup is a scan of state already in memory.
  useEffect(() => {
    setSourcePubkeyProvider((address: string) => {
      for (const wallet of walletStateRef.current.wallets) {
        for (const walletAddress of wallet.addresses) {
          if (walletAddress.address === address) return walletAddress.pubKey || null;
        }
      }
      return null;
    });
    return () => setSourcePubkeyProvider(null);
    // walletStateRef is read at call time, so the provider needs registering once, not per change.
  }, []);

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

    // The keychainLocked message reaches only one webext-bridge 'popup'
    // endpoint, and the popup and side panel share that name. Master key
    // removal from session storage signals the lock to every UI surface.
    const handleSessionStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      const masterKeyChange = changes['keychainMasterKey'];
      if (masterKeyChange && masterKeyChange.oldValue != null && masterKeyChange.newValue == null) {
        handleLockMessage({ data: { locked: true } });
      }
    };
    chrome.storage?.session?.onChanged?.addListener(handleSessionStorageChange);

    // Wallets and their addresses live in the keychain record, so adding a wallet or deriving an
    // address in one surface lands as a write here. The popup and the side panel are separate
    // documents and people run both, so without this the one merely open keeps the list it read on
    // mount — and the address-types screen keeps offering a format the other surface already
    // changed.
    //
    // Refreshing is expensive (it can decrypt and re-derive), and this fires for any keychain
    // write, including a settings-only one. It is bounded rather than free: withStateLock
    // serializes it against the refresh already in flight, and a locked keychain is skipped because
    // there is nothing to re-read and the lock path handles that transition itself.
    const stopWatchingKeychain = watchKeychainRecord(() => {
      if (walletStateRef.current.keychainLocked) return;
      refreshWalletState();
    });

    return () => {
      // Properly cleanup the message listener
      unsubscribe();
      chrome.storage?.session?.onChanged?.removeListener(handleSessionStorageChange);
      stopWatchingKeychain();
    };
  }, [refreshWalletState, walletService]); // Removed walletState.authState to prevent re-runs

  const emitAccountsChanged = useCallback(async (address?: string) => {
    const settings = await walletService.getSettings();
    for (const origin of settings.connectedWebsites) {
      await walletService.emitProviderEvent(
        origin,
        'accountsChanged',
        address ? [address] : []
      );
    }
  }, [walletService]);

  const withIdentityRefresh = useCallback(
    async <T,>(lockKey: string, operation: () => Promise<T>): Promise<T> => {
      return withStateLock(lockKey, async () => {
        const previousAddress = walletStateRef.current.activeAddress?.address;
        const result = await operation();

        await refreshWalletState();
        const activeAddress = await walletService.getActiveAddress();
        const nextAddress = activeAddress?.address;
        if (
          nextAddress &&
          nextAddress !== await walletService.getLastActiveAddress()
        ) {
          await walletService.setLastActiveAddress(nextAddress);
        }
        if (previousAddress !== nextAddress) {
          await emitAccountsChanged(nextAddress);
        }

        return result;
      });
    },
    [emitAccountsChanged, refreshWalletState, walletService]
  );

  const setActiveAddress = useCallback(
    async (address: Address | null) => {
      return withStateLock('wallet-set-address', async () => {
        // Use ref to get current address without stale closure
        const oldAddress = walletStateRef.current.activeAddress?.address;
        const newAddress = address?.address;

        setWalletState((prev) => ({ ...prev, activeAddress: address }));
        if (address) await walletService.setLastActiveAddress(address.address);
        if (oldAddress !== newAddress) await emitAccountsChanged(newAddress);
      });
    },
    [emitAccountsChanged, walletService]
  );

  const setLastActiveTime = useCallback(async () => {
    await walletService.setLastActiveTime();
  }, [walletService]);

  const setHardwareOperationInProgress = useCallback((inProgress: boolean) => {
    setWalletState((prev) => ({ ...prev, hardwareOperationInProgress: inProgress }));
  }, []);

  const isKeychainLocked = useCallback(async () => {
    return !(await walletService.isKeychainUnlocked());
  }, [walletService]);

  const value = useMemo<WalletContextType>(() => ({
    authState: walletState.authState,
    keychainExists: walletState.keychainExists,
    wallets: walletState.wallets,
    activeWallet: walletState.activeWallet,
    activeAddress: walletState.activeAddress,
    keychainLocked: walletState.keychainLocked,
    isLoading: walletState.isLoading,
    hardwareOperationInProgress: walletState.hardwareOperationInProgress,
    setHardwareOperationInProgress,
    unlockKeychain: withRefresh(walletService.unlockKeychain, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }, 'wallet-unlock-keychain'),
    selectWallet: (walletId) => withIdentityRefresh(
      'wallet-load',
      () => walletService.selectWallet(walletId)
    ),
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
    setActiveAddress,
    addAddress: withRefresh(walletService.addAddress, refreshWalletState),
    updatePassword: withRefresh(walletService.updatePassword, refreshWalletState),
    createMnemonicWallet: async (mnemonic, password, name, addressFormat) => {
      const wallet = await withIdentityRefresh(
        'wallet-create-mnemonic',
        () => walletService.createMnemonicWallet(
          mnemonic,
          password,
          name,
          addressFormat ?? AddressFormat.P2TR
        )
      );
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
      return wallet;
    },
    createPrivateKeyWallet: async (privateKey, password, name, addressFormat) => {
      const wallet = await withIdentityRefresh(
        'wallet-create-private-key',
        () => walletService.createPrivateKeyWallet(
          privateKey,
          password,
          name,
          addressFormat ?? AddressFormat.P2TR
        )
      );
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
      return wallet;
    },
    importTestAddress: async (address, name) => {
      const wallet = await withIdentityRefresh(
        'wallet-import-test-address',
        () => walletService.importTestAddress(address, name)
      );
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
      return wallet;
    },
    createHardwareWalletWithDiscovery: (deviceType, name, usePassphrase) => withIdentityRefresh(
      'wallet-create-hardware',
      () => walletService.createHardwareWalletWithDiscovery(deviceType, name, usePassphrase)
    ),
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
        hardwareOperationInProgress: false,
      });
    },
    getUnencryptedMnemonic: walletService.getUnencryptedMnemonic,
    getPrivateKey: walletService.getPrivateKey,
    setLastActiveTime,
    verifyPassword: walletService.verifyPassword,
    updateWalletAddressFormat: (walletId, newType) => withIdentityRefresh(
      'wallet-update-address-format',
      () => walletService.updateWalletAddressFormat(walletId, newType)
    ),
    getPreviewAddressForFormat: walletService.getPreviewAddressForFormat,
    isAddressInAnyWallet: walletService.isAddressInAnyWallet,
    removeWallet: (walletId) => withIdentityRefresh(
      'wallet-remove',
      () => walletService.removeWallet(walletId)
    ),
    signTransaction: walletService.signTransaction,
    // Wrapped rather than passed through: the spent-UTXO cache is per-context, and compose runs
    // HERE, in the popup. Recording only in the background (where the broadcast executes) left
    // this context's copy empty, so quick back-to-back transactions re-picked just-spent inputs.
    broadcastTransaction: async (signedTxHex: string) => {
      const result = await walletService.broadcastTransaction(signedTxHex);
      recordSpentInputsFromRawTx(signedTxHex);
      // The symmetric half: our own change becomes spendable immediately, so an address whose
      // only UTXO was just consumed can chain without waiting for the indexer. pendingChange
      // owns the safety judgment about which outputs qualify.
      recordOwnChangeFromRawTx(
        signedTxHex,
        walletStateRef.current.wallets.flatMap((wallet) => wallet.addresses.map((a) => a.address))
      );
      return result;
    },
    isKeychainLocked,
  }), [
    walletState,
    walletService,
    refreshWalletState,
    setActiveAddress,
    withIdentityRefresh,
    setLastActiveTime,
    setHardwareOperationInProgress,
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
