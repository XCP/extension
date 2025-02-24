import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode, type ReactElement } from 'react';
import { getWalletService } from '@/services/walletService';
import { AddressType } from '@/utils/blockchain/bitcoin';
import type { Wallet, Address } from '@/utils/wallet';

enum AuthState {
  Onboarding = 'ONBOARDING_NEEDED',
  Locked = 'LOCKED',
  Unlocked = 'UNLOCKED',
}

interface WalletState {
  authState: AuthState;
  wallets: Wallet[];
  activeWallet: Wallet | null;
  activeAddress: Address | null;
  walletLocked: boolean;
  loaded: boolean;
}

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
  createAndUnlockMnemonicWallet: (mnemonic: string, password: string, name?: string, addressType?: AddressType) => Promise<Wallet>;
  createAndUnlockPrivateKeyWallet: (privateKey: string, password: string, name?: string, addressType?: AddressType) => Promise<Wallet>;
  resetAllWallets: (password: string) => Promise<void>;
  getUnencryptedMnemonic: (walletId: string) => Promise<string>;
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<string>;
  verifyPassword: (password: string) => Promise<boolean>;
  updateWalletAddressType: (walletId: string, newType: AddressType) => Promise<void>;
  getPreviewAddressForType: (walletId: string, addressType: AddressType) => Promise<string>;
  removeWallet: (walletId: string) => Promise<void>;
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
  updatePinnedAssets: (pinnedAssets: string[]) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const withRefresh = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  refresh: () => Promise<void>
) => async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
  const result = await fn(...args);
  await refresh();
  return result;
};

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
  const refreshInProgress = useRef(false);

  const refreshWalletState = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;

    try {
      await walletService.loadWallets();
      const allWallets = await walletService.getWallets();
      const newState: WalletState = { ...walletState };

      // Declare change flags
      let walletsEqual = JSON.stringify(newState.wallets) === JSON.stringify(allWallets);
      let activeChanged = false;
      let addressChanged = false;
      let lockChanged = false;

      // Update auth state based on wallet count first
      if (allWallets.length === 0) {
        newState.authState = AuthState.Onboarding;
        newState.activeWallet = null;
        newState.activeAddress = null;
        newState.walletLocked = true;
      } else {
        // Check if any wallet is unlocked
        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        newState.walletLocked = !anyUnlocked;
        newState.authState = anyUnlocked ? AuthState.Unlocked : AuthState.Locked;
      }

      // Update wallets list
      if (!walletsEqual) {
        newState.wallets = allWallets;
      }

      if (allWallets.length > 0) {
        let active = await walletService.getActiveWallet();
        if (!active) {
          active = allWallets[0];
          await walletService.setActiveWallet(active.id);
        }
        if (activeChanged = newState.activeWallet?.id !== active.id ||
          (newState.activeWallet &&
            active &&
            JSON.stringify(newState.activeWallet.addresses) !== JSON.stringify(active.addresses))) {
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
      console.error('Error refreshing wallet state:', error);
      setWalletState((prev) => ({ ...prev, loaded: true }));
    } finally {
      refreshInProgress.current = false;
    }
  }, [walletService, walletState]);

  useEffect(() => {
    refreshWalletState();
  }, [refreshWalletState]);

  const setActiveWallet = useCallback(async (wallet: Wallet | null, useLastActive?: boolean) => {
    if (wallet) {
      await walletService.setActiveWallet(wallet.id);
      const lastActiveAddress = useLastActive ? await walletService.getLastActiveAddress() : undefined;
      const newActiveAddress =
        lastActiveAddress && wallet.addresses.some((addr) => addr.address === lastActiveAddress)
          ? wallet.addresses.find((addr) => addr.address === lastActiveAddress) ?? wallet.addresses[0]
          : wallet.addresses[0];
      setWalletState((prev) => ({
        ...prev,
        activeWallet: wallet,
        activeAddress: newActiveAddress ?? null,
      }));
      if (newActiveAddress) await walletService.setLastActiveAddress(newActiveAddress.address);
    } else {
      await walletService.setActiveWallet('');
      setWalletState((prev) => ({ ...prev, activeWallet: null, activeAddress: null }));
    }
  }, [walletService]);

  const setActiveAddress = useCallback(async (address: Address | null) => {
    setWalletState((prev) => ({ ...prev, activeAddress: address }));
    if (address) await walletService.setLastActiveAddress(address.address);
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
    }),
    lockAll: withRefresh(walletService.lockAllWallets, async () => {
      await refreshWalletState();
      setWalletState((prev) => ({ ...prev, authState: AuthState.Locked }));
    }),
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
    verifyPassword: walletService.verifyPassword,
    updateWalletAddressType: withRefresh(walletService.updateWalletAddressType, refreshWalletState),
    getPreviewAddressForType: walletService.getPreviewAddressForType,
    removeWallet: withRefresh(walletService.removeWallet, refreshWalletState),
    signTransaction: walletService.signTransaction,
    broadcastTransaction: walletService.broadcastTransaction,
    updatePinnedAssets: withRefresh(
      async (pinnedAssets: string[]) => {
        if (!walletState.activeWallet) throw new Error('No active wallet');
        return walletService.updateWalletPinnedAssets(walletState.activeWallet.id, pinnedAssets);
      },
      refreshWalletState
    ),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within a WalletProvider');
  return context;
}
