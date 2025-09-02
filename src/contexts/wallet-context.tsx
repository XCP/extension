import React, {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { onMessage } from 'webext-bridge/popup'; // Import for popup context
import { getWalletService } from "@/services/walletService";
import { getKeychainSettings } from "@/utils/storage/settingsStorage";
import { AddressType } from "@/utils/blockchain/bitcoin";
import { withStateLock, type Wallet, type Address } from "@/utils/wallet";

/**
 * Authentication state enum.
 */
enum AuthState {
  Onboarding = "ONBOARDING_NEEDED",
  Locked = "LOCKED",
  Unlocked = "UNLOCKED",
}

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
    addressType?: AddressType
  ) => Promise<Wallet>;
  createAndUnlockPrivateKeyWallet: (
    privateKey: string,
    password: string,
    name?: string,
    addressType?: AddressType
  ) => Promise<Wallet>;
  resetAllWallets: (password: string) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<{ key: string; compressed: boolean }>;
  setLastActiveTime: () => Promise<void>;
  verifyPassword: (password: string) => Promise<boolean>;
  updateWalletAddressType: (walletId: string, newType: AddressType) => Promise<void>;
  getPreviewAddressForType: (walletId: string, addressType: AddressType) => Promise<string>;
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
  const refreshInProgress = React.useRef(false);

  const refreshWalletState = useCallback(async () => {
    // Use proper locking instead of simple ref check
    return withStateLock('wallet-refresh', async () => {
      try {
      await walletService.loadWallets();
      const allWallets = await walletService.getWallets();
      const newState: WalletState = { ...walletState };

      let walletsEqual = JSON.stringify(newState.wallets) === JSON.stringify(allWallets);
      let activeChanged = false;
      let addressChanged = false;
      let lockChanged = false;

      if (allWallets.length === 0) {
        newState.authState = AuthState.Onboarding;
        newState.activeWallet = null;
        newState.activeAddress = null;
        newState.walletLocked = true;
      } else {
        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        newState.walletLocked = !anyUnlocked;
        newState.authState = anyUnlocked ? AuthState.Unlocked : AuthState.Locked;
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
            JSON.stringify(newState.activeWallet.addresses) !== JSON.stringify(active.addresses))
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

        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        lockChanged = newState.walletLocked !== !anyUnlocked;
        if (lockChanged) {
          newState.walletLocked = !anyUnlocked;
          newState.authState = anyUnlocked ? AuthState.Unlocked : AuthState.Locked;
        }
      } else {
        newState.activeWallet = null;
        newState.activeAddress = null;
        newState.walletLocked = true;
        newState.authState = AuthState.Onboarding;
      }

      newState.loaded = true;
      if (!walletsEqual || activeChanged || addressChanged || lockChanged || !walletState.loaded) {
        setWalletState(newState);
      }
      } catch (error) {
        console.error("Error refreshing wallet state:", error);
        setWalletState((prev) => ({ ...prev, loaded: true }));
      }
    });
  }, [walletService, walletState]);

  useEffect(() => {
    refreshWalletState();

    // Listen for wallet lock events from background
    const handleLockMessage = ({ data }: { data: { locked: boolean } }) => {
      if (data.locked) {
        console.log('[WalletContext] Received lock event from background');
        // Immediately update state to trigger navigation
        setWalletState((prev) => ({
          ...prev,
          authState: AuthState.Locked,
          walletLocked: true,
          activeWallet: null,
          activeAddress: null,
        }));
      }
    };
    onMessage('walletLocked', handleLockMessage);

    return () => {
      // Cleanup not strictly needed with webext-bridge as it handles message cleanup internally
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
        const oldAddress = walletState.activeAddress?.address;
        const newAddress = address?.address;
      
      // Handle address switch - emit accountsChanged to all connected sites
      if (oldAddress && newAddress && oldAddress !== newAddress) {
        // Get connected sites from settings
        const settings = await getKeychainSettings();
        
        // Emit accountsChanged event to each connected site with new address
        const emitProviderEvent = (globalThis as any).emitProviderEvent;
        if (emitProviderEvent && settings.connectedWebsites.length > 0) {
          // Emit to each connected site
          settings.connectedWebsites.forEach(origin => {
            emitProviderEvent(origin, 'accountsChanged', [newAddress]);
          });
        }
      }
        
        setWalletState((prev) => ({ ...prev, activeAddress: address }));
        if (address) await walletService.setLastActiveAddress(address.address);
      });
    },
    [walletService, walletState.activeAddress]
  );

  const setLastActiveTime = useCallback(async () => {
    await walletService.setLastActiveTime();
  }, [walletService]);

  const isWalletLocked = useCallback(async () => {
    const activeWalletId = walletState.activeWallet?.id;
    if (!activeWalletId) return true; // No active wallet means locked
    return !(await walletService.isAnyWalletUnlocked());
  }, [walletService, walletState.activeWallet]);

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
    updateWalletAddressType: withRefresh(walletService.updateWalletAddressType, refreshWalletState),
    getPreviewAddressForType: walletService.getPreviewAddressForType,
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
  const context = React.use(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}
