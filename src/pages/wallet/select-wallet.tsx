import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import { Button } from '@/components/button';
import { WalletList } from '@/components/lists/wallet-list';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { useToast } from '@/contexts/toast-context';
import type { Wallet } from '@/utils/wallet';

function SelectWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, activeWallet, setActiveWallet } = useWallet();
  const { showError } = useToast();

  const handleAddWallet = () => {
    if (wallets.length >= 10) {
      showError('Maximum number of wallets reached');
      return;
    }
    navigate('/add-wallet');
  };

  const handleSelectWalletInternal = async (wallet: Wallet) => {
    await setActiveWallet(wallet);
    navigate('/index');
  };

  useEffect(() => {
    setHeaderProps({
      title: 'Select Wallet',
      onBack: () => navigate('/'),
      rightButton: {
        icon: <FaPlus />,
        onClick: handleAddWallet,
        ariaLabel: 'Add Wallet',
      },
    });
  }, [setHeaderProps, navigate]);

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="wallet-selection-title">
      <div className="flex-grow overflow-y-auto p-4">
        <h2 id="wallet-selection-title" className="sr-only">Select a Wallet</h2>
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
          disabled={wallets.length >= 10}
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
