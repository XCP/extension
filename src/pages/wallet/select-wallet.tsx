import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus } from '@/components/icons';
import { Button } from '@/components/button';
import { WalletList } from '@/components/lists/wallet-list';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { ErrorAlert } from '@/components/error-alert';
import { MAX_WALLETS } from '@/utils/wallet/constants';
import type { Wallet } from '@/types/wallet';

/**
 * SelectWallet component allows users to choose an active wallet or add a new one.
 *
 * Features:
 * - Displays a list of wallets for selection
 * - Provides an option to add a new wallet with a limit of 20
 * - Navigates to the index on wallet selection
 */
function SelectWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, activeWallet, selectWallet } = useWallet();
  const [error, setError] = useState<string | null>(null);

  // Constants for paths
  const PATHS = {
    BACK: '/',
    ADD_WALLET: '/add-wallet',
    INDEX: '/index',
  } as const;

  const handleAddWallet = useCallback(() => {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.ADD_WALLET);
  }, [navigate, wallets.length]);

  // Configure header with add wallet button
  useEffect(() => {
    setHeaderProps({
      title: 'Keychain',
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FaPlus />,
        onClick: handleAddWallet,
        ariaLabel: 'Add Wallet',
      },
    });
  }, [setHeaderProps, navigate, handleAddWallet]);

  const handleSelectWalletInternal = async (wallet: Wallet) => {
    try {
      // Load wallet (decrypts secret and derives addresses)
      await selectWallet(wallet.id);
      navigate(PATHS.INDEX);
    } catch (err) {
      console.error('Error selecting wallet:', err);
      setError('Failed to select wallet. Please try again.');
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      role="main"
      aria-labelledby="wallet-selection-title"
    >
      <div className="flex-grow overflow-y-auto p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="wallet-selection-title" className="sr-only text-2xl font-bold mb-2">
          Select a Wallet
        </h2>
        <WalletList
          wallets={wallets}
          selectedWallet={activeWallet}
          onSelectWallet={handleSelectWalletInternal}
        />
      </div>
      <div className="p-4">
        <Button
          color="green"
          fullWidth
          onClick={handleAddWallet}
          disabled={wallets.length >= MAX_WALLETS}
          aria-label="Add Wallet"
        >
          <FaPlus className="mr-2" aria-hidden="true" />
          Add Wallet
        </Button>
      </div>
    </div>
  );
}

export default SelectWallet;
