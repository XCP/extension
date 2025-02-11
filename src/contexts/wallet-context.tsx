import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { getWalletService } from '@/services/walletService';
import type { Wallet, Address } from '@/utils/wallet';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';

interface WalletContextType {
  wallets: Wallet[];
  activeWallet: Wallet | null;
  activeAddress: Address | null;
  walletLocked: boolean;
  loaded: boolean;
  unlockWallet: (walletId: string, password: string) => Promise<void>;
  lockAll: () => Promise<void>;
  reloadWallets: () => Promise<void>;
  setActiveWallet: (wallet: Wallet | null) => void;
  setActiveAddress: (address: Address | null) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletService = getWalletService();
  const { showInfo } = useToast();
  const { dispatch: authDispatch } = useAuth();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWallet, setActiveWalletState] = useState<Wallet | null>(null);
  const [activeAddress, setActiveAddressState] = useState<Address | null>(null);
  const [walletLocked, setWalletLocked] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);

  const reloadWallets = useCallback(async () => {
    try {
      await walletService.loadWallets();
      const allWallets = await walletService.getWallets();
      setWallets(allWallets);
      // Dispatch event for auth
      authDispatch({ type: 'WALLETS_LOADED', walletExists: allWallets.length > 0 });
      if (allWallets.length > 0) {
        let active = await walletService.getActiveWallet();
        if (!active) {
          active = allWallets[0];
          walletService.setActiveWallet(active.id);
        }
        setActiveWalletState(active);
        setActiveAddressState((prevActive) => {
          if (prevActive && active.addresses.some(addr => addr.address === prevActive.address)) {
            return prevActive;
          }
          return active.addresses[0] || null;
        });
        const anyUnlocked = await walletService.isAnyWalletUnlocked();
        setWalletLocked(!anyUnlocked);
        authDispatch({ type: anyUnlocked ? 'WALLET_UNLOCKED' : 'WALLET_LOCKED' });
      } else {
        setActiveWalletState(null);
        setActiveAddressState(null);
        setWalletLocked(true);
        authDispatch({ type: 'WALLET_LOCKED' });
      }
    } catch (error) {
      console.error('Failed to reload wallets:', error);
      setWallets([]);
      setActiveWalletState(null);
      setActiveAddressState(null);
      setWalletLocked(true);
      authDispatch({ type: 'WALLETS_LOADED', walletExists: false });
    } finally {
      setLoaded(true);
    }
  }, [walletService, authDispatch]);

  useEffect(() => {
    reloadWallets();
  }, [reloadWallets]);

  // Update UI state on auto‑lock by integrating the auth dispatch.
  useEffect(() => {
    const originalOnAutoLock = walletService.onAutoLock;
    walletService.onAutoLock = async () => {
      showInfo('Wallet auto-locked due to inactivity');
      setWalletLocked(true);
      setActiveWalletState(null);
      setActiveAddressState(null);
      authDispatch({ type: 'WALLET_LOCKED' });
    };
    return () => {
      walletService.onAutoLock = originalOnAutoLock;
    };
  }, [walletService, showInfo, authDispatch]);

  const unlockWallet = useCallback(
    async (walletId: string, password: string) => {
      try {
        await walletService.unlockWallet(walletId, password);
        const wallet = await walletService.getWalletById(walletId);
        setActiveWalletState(wallet || null);
        if (wallet && wallet.addresses && wallet.addresses.length > 0) {
          setActiveAddressState(wallet.addresses[0]);
        }
        setWalletLocked(false);
        authDispatch({ type: 'WALLET_UNLOCKED' });
      } catch (error) {
        console.error('Error unlocking wallet:', error);
        throw error;
      }
    },
    [walletService, authDispatch]
  );

  const lockAll = useCallback(async () => {
    walletService.lockAllWallets();
    setWalletLocked(true);
    setActiveWalletState(null);
    setActiveAddressState(null);
    authDispatch({ type: 'WALLET_LOCKED' });
  }, [walletService, authDispatch]);

  const setActiveWallet = useCallback(
    (wallet: Wallet | null) => {
      if (wallet) {
        walletService.setActiveWallet(wallet.id);
        setActiveWalletState(wallet);
        setActiveAddressState(wallet.addresses[0] || null);
      } else {
        walletService.setActiveWallet(null);
        setActiveWalletState(null);
        setActiveAddressState(null);
      }
    },
    [walletService]
  );

  const setActiveAddress = useCallback((address: Address | null) => {
    setActiveAddressState(address);
  }, []);

  const value: WalletContextType = {
    wallets,
    activeWallet,
    activeAddress,
    walletLocked,
    loaded,
    unlockWallet,
    lockAll,
    reloadWallets,
    setActiveWallet,
    setActiveAddress,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
