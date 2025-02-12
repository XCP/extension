import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDownload, FiKey, FiHelpCircle } from 'react-icons/fi';
import { IoCreateOutline } from 'react-icons/io5';
import { Button } from '@/components/button';
import { useHeader } from '@/contexts/header-context';

function AddWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      onBack: () => navigate('/select-wallet'),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" />,
        onClick: () => window.open('https://youtube.com', '_blank'),
        ariaLabel: 'Help',
      },
    });
  }, [setHeaderProps, navigate]);

  const handleCreateWallet = () => {
    navigate('/create-wallet');
  };

  const handleImportWallet = () => {
    navigate('/import-wallet');
  };

  const handleImportPrivateKey = () => {
    navigate('/import-private-key');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6 text-center">
          <h2 className="text-2xl font-bold mb-6">Add Wallet</h2>
          <div className="space-y-4">
            <Button
              color="green"
              fullWidth
              onClick={handleCreateWallet}
              aria-label="Create New Wallet"
            >
              <IoCreateOutline className="mr-2" aria-hidden="true" />
              Create New Wallet
            </Button>
            <Button
              color="blue"
              fullWidth
              onClick={handleImportWallet}
              aria-label="Import Wallet"
            >
              <FiDownload className="mr-2" aria-hidden="true" />
              Import Mnemonic
            </Button>
            <Button
              color="gray"
              fullWidth
              onClick={handleImportPrivateKey}
              aria-label="Import Private Key"
            >
              <FiKey className="mr-2" aria-hidden="true" />
              Import Private Key
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddWallet;
