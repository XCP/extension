import React, { 
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getWalletService } from '@/services/walletService';
import { AddressType } from '@/utils/blockchain/bitcoin/address';
import type { Wallet, Address } from '@/utils/wallet';

interface WalletContextType {
  wallets: Wallet[];
  activeWallet: Wallet | null;
  activeAddress: Address | null;
  walletLocked: boolean;
  loaded: boolean;
  unlockWallet: (walletId: string, password: string) => Promise<void>;
  lockAll: () => Promise<void>;
  setActiveWallet: (wallet: Wallet | null) => Promise<void>;
  setActiveAddress: (address: Address | null) => Promise<void>;
  addAddress: (walletId: string) => Promise<void>;
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
  getPrivateKey: (walletId: string, derivationPath?: string) => Promise<string>;
  verifyPassword: (password: string) => Promise<boolean>;
  updateWalletAddressType: (walletId: string, newType: AddressType) => Promise<void>;
  getPreviewAddressForType: (walletId: string, addressType: AddressType) => Promise<string>;
  removeWallet: (walletId: string) => Promise<void>;
  signTransaction: (rawTxHex: string, sourceAddress: string) => Promise<string>;
  broadcastTransaction: (signedTxHex: string) => Promise<{ txid: string; fees?: number }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletService = getWalletService();
  const { dispatch: authDispatch } = useAuth();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWallet, setActiveWalletState] = useState<Wallet | null>(null);
  const [activeAddress, setActiveAddressState] = useState<Address | null>(null);
  const [walletLocked, setWalletLocked] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);

  const refreshWalletState = useCallback(async () => {
    try {
      await walletService.loadWallets();
      const allWallets = await walletService.getWallets();
      setWallets(allWallets);
      authDispatch({ type: 'WALLETS_LOADED', walletExists: allWallets.length > 0 });

      if (allWallets.length > 0) {
        let active = await walletService.getActiveWallet();
        if (!active) {
          active = allWallets[0];
          walletService.setActiveWallet(active.id);
        }
        setActiveWalletState(active);

        const lastActiveAddress = await walletService.getLastActiveAddress();
        setActiveAddressState(
          lastActiveAddress && active.addresses.some((addr) => addr.address === lastActiveAddress)
            ? active.addresses.find((addr) => addr.address === lastActiveAddress) || active.addresses[0]
            : active.addresses[0] || null
        );

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
      console.error('Error refreshing wallet state:', error);
    } finally {
      setLoaded(true);
    }
  }, [walletService, authDispatch]);

  useEffect(() => {
    refreshWalletState();
  }, [refreshWalletState]);

  useEffect(() => {
    const originalOnAutoLock = walletService.onAutoLock;
    walletService.onAutoLock = async () => {
      setWalletLocked(true);
      setActiveWalletState(null);
      setActiveAddressState(null);
      authDispatch({ type: 'WALLET_LOCKED' });
    };
    return () => {
      walletService.onAutoLock = originalOnAutoLock;
    };
  }, [walletService, authDispatch]);

  const unlockWallet = useCallback(async (walletId: string, password: string) => {
    try {
      await walletService.unlockWallet(walletId, password);
      await refreshWalletState();
    } catch (error) {
      console.error('Error unlocking wallet:', error);
      throw error;
    }
  }, [walletService, refreshWalletState]);

  const lockAll = useCallback(async () => {
    walletService.lockAllWallets();
    await refreshWalletState();
  }, [walletService, refreshWalletState]);

  const setActiveWallet = useCallback(async (wallet: Wallet | null) => {
    if (wallet) {
      await walletService.setActiveWallet(wallet.id);
    } else {
      await walletService.setActiveWallet('');
    }
    await refreshWalletState();
  }, [walletService, refreshWalletState]);

  const setActiveAddress = useCallback(async (address: Address | null) => {
    setActiveAddressState(address);
    if (address) {
      await walletService.setLastActiveAddress(address.address);
    }
  }, [walletService]);

  const addAddress = useCallback(async (walletId: string) => {
    try {
      await walletService.addAddress(walletId);
      await refreshWalletState();
    } catch (error) {
      console.error('Failed to add address:', error);
      throw error;
    }
  }, [walletService, refreshWalletState]);

  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await walletService.updatePassword(currentPassword, newPassword);
    await refreshWalletState();
  }, [walletService, refreshWalletState]);

  const createAndUnlockMnemonicWallet = useCallback(async (
    mnemonic: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2WPKH
  ) => {
    const wallet = await walletService.createAndUnlockMnemonicWallet(mnemonic, password, name, addressType);
    await refreshWalletState();
    return wallet;
  }, [walletService, refreshWalletState]);

  const createAndUnlockPrivateKeyWallet = useCallback(async (
    privateKey: string,
    password: string,
    name?: string,
    addressType: AddressType = AddressType.P2WPKH
  ) => {
    const wallet = await walletService.createAndUnlockPrivateKeyWallet(privateKey, password, name, addressType);
    await refreshWalletState();
    return wallet;
  }, [walletService, refreshWalletState]);

  const resetAllWallets = useCallback(async (password: string) => {
    await walletService.resetAllWallets(password);
    await refreshWalletState();
  }, [walletService, refreshWalletState]);

  const removeWallet = useCallback(async (walletId: string) => {
    await walletService.removeWallet(walletId);
    await refreshWalletState();
  }, [walletService, refreshWalletState]);

  const getUnencryptedMnemonic = useCallback(async (walletId: string): Promise<string> => {
    return walletService.getUnencryptedMnemonic(walletId);
  }, [walletService]);

  const getPrivateKey = useCallback(async (walletId: string, derivationPath?: string): Promise<string> => {
    return walletService.getPrivateKey(walletId, derivationPath);
  }, [walletService]);

  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    return walletService.verifyPassword(password);
  }, [walletService]);

  const updateWalletAddressType = useCallback(async (walletId: string, newType: AddressType): Promise<void> => {
    await walletService.updateWalletAddressType(walletId, newType);
    await refreshWalletState();
  }, [walletService, refreshWalletState]);

  const getPreviewAddressForType = useCallback(async (walletId: string, addressType: AddressType): Promise<string> => {
    return walletService.getPreviewAddressForType(walletId, addressType);
  }, [walletService]);

  const value: WalletContextType = {
    wallets,
    activeWallet,
    activeAddress,
    walletLocked,
    loaded,
    unlockWallet,
    lockAll,
    setActiveWallet,
    setActiveAddress,
    addAddress,
    updatePassword,
    createAndUnlockMnemonicWallet,
    createAndUnlockPrivateKeyWallet,
    resetAllWallets,
    getUnencryptedMnemonic,
    getPrivateKey,
    verifyPassword,
    updateWalletAddressType,
    getPreviewAddressForType,
    removeWallet,
    signTransaction: (rawTxHex: string, sourceAddress: string) =>
      walletService.signTransaction(rawTxHex, sourceAddress),
    broadcastTransaction: (signedTxHex: string) =>
      walletService.broadcastTransaction(signedTxHex),
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
