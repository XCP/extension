import {
  createContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactElement,
  type ReactNode,
  use
} from "react";
import { onMessage } from 'webext-bridge/popup'; // Import for popup context
import { getWalletService } from "@/services/walletService";
import { getSettings } from "@/utils/storage/settingsStorage";
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { withStateLock } from "@/utils/wallet/stateLockManager";
import type { Wallet, Address } from "@/utils/wallet/walletManager";

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
 * Wallet context state.
 */
interface WalletState {
  authState: AuthState;
  wallets: Wallet[];
  activeWallet: Wallet | null;
  activeAddress: Address | null;
  walletLocked: boolean;
  loaded: boolean;
}

/**
 * Context type for wallet management.
 */
interface WalletContextType {
  authState: AuthState;
  wallets: Wallet[];
  activeWallet: Wallet | null;
  activeAddress: Address | null;
  walletLocked: boolean;
  loaded: boolean;
  unlockWallet: (walletId: string, password: string) => Promise<void>;
  lockAll: () => Promise<void>;
  setActiveWallet: (wallet: Wallet | null, useLastActive?: boolean) => Promise<void>;
  setActiveAddress: (address: Address | null) => Promise<void>;
  addAddress: (walletId: string) => Promise<Address>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
  importTestAddress: (address: string, name?: string) => Promise<Wallet>;
  resetAllWallets: (password: string) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<{ wif: string; hex: string; compressed: boolean }>;
  setLastActiveTime: () => Promise<void>;
  verifyPassword: (password: string) => Promise<boolean>;
  updateWalletAddressFormat: (walletId: string, newType: AddressFormat) => Promise<void>;
  getPreviewAddressForFormat: (walletId: string, addressFormat: AddressFormat) => Promise<string>;
  removeWallet: (walletId: string) => Promise<void>;
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  isWalletLocked: () => Promise<boolean>;
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
    wallets: [],
    activeWallet: null,
    activeAddress: null,
    walletLocked: true,
    loaded: false,
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

      await walletService.loadWallets();
      const allWallets = await walletService.getWallets();

      // Use ref to get current state without triggering re-renders
      const currentState = walletStateRef.current;
      const newState: WalletState = { ...currentState };

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
        newState.walletLocked = true;
      } else {
        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        const newAuthState = anyUnlocked ? AuthState.Unlocked : AuthState.Locked;
        if (process.env.NODE_ENV === 'development' && newState.authState !== newAuthState) {
          console.log('[WalletContext] Transition: ', newState.authState, ' -> ', newAuthState);
        }
        newState.walletLocked = !anyUnlocked;
        newState.authState = newAuthState;

        // Store for later use to avoid duplicate call
        lockChanged = currentState.walletLocked !== !anyUnlocked;
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
        newState.walletLocked = true;
        newState.authState = AuthState.Onboarding;
      }

      newState.loaded = true;

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
          loaded: true,
        }));
        return;
      }

      if (!walletsEqual || activeChanged || addressChanged || lockChanged || !currentState.loaded) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WalletContext] State update:', {
            walletsChanged: !walletsEqual,
            activeChanged,
            addressChanged,
            lockChanged,
            firstLoad: !currentState.loaded,
            newAuthState: newState.authState
          });
        }
        setWalletState(newState);
      }
      } catch (error) {
        console.error("Error refreshing wallet state:", error);
        setWalletState((prev) => ({ ...prev, loaded: true }));
      }
    });
  }, [walletService]); // Removed walletState - using ref instead to prevent stale closures

  useEffect(() => {
    // Simple delay to let background initialize, then rely on service-level error handling
    setTimeout(() => {
      refreshWalletState();
    }, 100);

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
            walletLocked: true,
            activeWallet: null,
            activeAddress: null,
          }));
        });
      }
    };
    const unsubscribe = onMessage('walletLocked', handleLockMessage);

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
          walletLocked: !anyUnlocked,
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
        const settings = await getSettings();

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

  const isWalletLocked = useCallback(async () => {
    // Use ref to get current active wallet without stale closure
    const activeWalletId = walletStateRef.current.activeWallet?.id;
    if (!activeWalletId) return true; // No active wallet means locked
    return !(await walletService.isAnyWalletUnlocked());
  }, [walletService]);

  const value: WalletContextType = {
    authState: walletState.authState,
    wallets: walletState.wallets,
    activeWallet: walletState.activeWallet,
    activeAddress: walletState.activeAddress,
    walletLocked: walletState.walletLocked,
    loaded: walletState.loaded,
    unlockWallet: withRefresh(walletService.unlockWallet, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }, 'wallet-unlock'),
    lockAll: async () => {
      return withStateLock('wallet-lock', async () => {
        // Immediately set state to locked to trigger navigation
        setWalletState((prev) => ({
          ...prev,
          authState: AuthState.Locked,
          walletLocked: true,
          activeWallet: null,
          activeAddress: null,
        }));
        
        // Then actually lock in the background
        await walletService.lockAllWallets();
      });
    },
    setActiveWallet,
    setActiveAddress,
    addAddress: withRefresh(walletService.addAddress, refreshWalletState),
    updatePassword: withRefresh(walletService.updatePassword, refreshWalletState),
    createAndUnlockMnemonicWallet: withRefresh(walletService.createAndUnlockMnemonicWallet, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }),
    createAndUnlockPrivateKeyWallet: withRefresh(walletService.createAndUnlockPrivateKeyWallet, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }),
    importTestAddress: withRefresh(walletService.importTestAddress, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Unlocked }));
    }),
    resetAllWallets: async (password) => {
      await walletService.resetAllWallets(password);
      setWalletState({
        authState: AuthState.Onboarding,
        wallets: [],
        activeWallet: null,
        activeAddress: null,
        walletLocked: true,
        loaded: true,
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
    isWalletLocked,
  };

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
