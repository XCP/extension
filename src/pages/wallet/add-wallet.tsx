import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDownload, VscKey, FiX, FaEye, IoCreateOutline, FiShield } from '@/components/icons';
import { Button } from '@/components/button';
import { useHeader } from '@/contexts/header-context';
import { ErrorAlert } from '@/components/error-alert';
import { useWallet } from '@/contexts/wallet-context';
import { MAX_WALLETS } from '@/utils/wallet/walletManager';

/**
 * AddWallet component provides options for creating or importing a wallet.
 *
 * Features:
 * - Offers buttons to create a new wallet, import a mnemonic, or import a private key
 * - Includes navigation to return to wallet selection or close to index
 */
function AddWallet() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets } = useWallet();
  const [error, setError] = useState<string | null>(null);

  // Navigation paths for wallet actions
  const PATHS = {
    BACK: '/select-wallet',
    CLOSE: '/index',
    CREATE_WALLET: '/create-wallet',
    IMPORT_WALLET: '/import-wallet',
    IMPORT_PRIVATE_KEY: '/import-private-key',
    IMPORT_TEST_ADDRESS: '/import-test-address',
    CONNECT_HARDWARE: '/connect-hardware',
  } as const;
  
  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Configure header with logo and close button
  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiX className="w-4 h-4" aria-hidden="true" />,
        onClick: () => navigate(PATHS.CLOSE),
        ariaLabel: 'Close',
      },
    });
  }, [setHeaderProps, navigate]);

  const handleCreateWallet = () => {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.CREATE_WALLET);
  };

  const handleImportWallet = () => {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.IMPORT_WALLET);
  };

  const handleImportPrivateKey = () => {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.IMPORT_PRIVATE_KEY);
  };
  
  const handleImportTestAddress = () => {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.IMPORT_TEST_ADDRESS);
  };

  const handleConnectHardware = () => {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.CONNECT_HARDWARE);
  };


  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="add-wallet-title">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6 text-center">
          <h2 id="add-wallet-title" className="text-2xl font-bold mb-6">
            Add Wallet
          </h2>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          <div className="space-y-4">
            <Button
              color="green"
              fullWidth
              onClick={handleCreateWallet}
              aria-label="Create New Wallet"
            >
              <IoCreateOutline className="w-4 h-4 mr-2" aria-hidden="true" />
              Create New Wallet
            </Button>
            <Button
              color="blue"
              fullWidth
              onClick={handleImportWallet}
              aria-label="Import Wallet"
            >
              <FiDownload className="w-4 h-4 mr-2" aria-hidden="true" />
              Import Mnemonic
            </Button>
            <Button
              color="gray"
              fullWidth
              onClick={handleImportPrivateKey}
              aria-label="Import Private Key"
            >
              <VscKey className="w-4 h-4 mr-2" aria-hidden="true" />
              Import Private Key
            </Button>
            <Button
              color="gray"
              fullWidth
              onClick={handleConnectHardware}
              aria-label="Connect Hardware Wallet"
            >
              <FiShield className="w-4 h-4 mr-2" aria-hidden="true" />
              Connect Hardware Wallet
            </Button>

            {/* Show Test Address option only in development mode */}
            {isDevelopment && (
              <Button
                color="gray"
                fullWidth
                onClick={handleImportTestAddress}
                aria-label="Import Test Address (Dev Only)"
              >
                <FaEye className="w-4 h-4 mr-2" aria-hidden="true" />
                Import Test Address (Dev)
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddWallet;
