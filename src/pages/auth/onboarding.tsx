import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiUpload, FiHelpCircle } from '@/components/icons';
import { Button } from '@/components/button';
import { useHeader } from '@/contexts/header-context';
import { getDisplayVersion } from '@/utils/version';

/**
 * Onboarding component serves as the entry point for users to create or import a wallet.
 *
 * Features:
 * - Displays options to create a new wallet or import an existing one
 * - Provides a help link in the header
 * - Includes Terms of Service agreement notice
 */
function Onboarding() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  // Navigation paths for wallet actions
  const PATHS = {
    CREATE_WALLET: '/create-wallet',
    IMPORT_WALLET: '/import-wallet',
    HELP_URL: 'https://www.youtube.com/watch?v=yPXb6oD3iTg&list=PLzUfUR_ZcfqDHYGJ6VTATINupuZxGJXm8',
  } as const;

  // Configure header with logo and help button
  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      title: 'Onboarding',
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => window.open(PATHS.HELP_URL, '_blank'),
        ariaLabel: 'Help',
      },
    });
  }, [setHeaderProps, navigate]);

  const handleCreateWallet = () => {
    navigate(PATHS.CREATE_WALLET);
  };

  const handleImportWallet = () => {
    navigate(PATHS.IMPORT_WALLET);
  };

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="onboarding-title">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
          <h1
            id="onboarding-title"
            className="text-3xl mb-5 flex justify-between items-center"
          >
            <span className="font-bold">XCP Wallet</span>
            <span>{getDisplayVersion()}</span>
          </h1>
          <div className="space-y-4">
            <Button
              color="green"
              fullWidth
              onClick={handleCreateWallet}
              aria-label="Create wallet"
            >
              <FiPlus className="size-4 mr-2" aria-hidden="true" />
              Create Wallet
            </Button>
            <Button
              color="blue"
              fullWidth
              onClick={handleImportWallet}
              aria-label="Import wallet"
            >
              <FiUpload className="size-4 mr-2" aria-hidden="true" />
              Import Wallet
            </Button>
          </div>
        </div>
      </div>
      <div className="text-center text-xs p-4">
        By continuing you agree to our{' '}
        <a
          href="https://www.xcp.io/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Terms of Service
        </a>
        {' '}and{' '}
        <a
          href="https://www.xcp.io/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Privacy Policy
        </a>
        .
      </div>
    </div>
  );
}

export default Onboarding;
