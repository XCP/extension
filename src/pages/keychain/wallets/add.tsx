import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FaEye, FiDownload, FiPlus, FiX, VscKey } from "@/components/icons";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MAX_WALLETS } from "@/utils/wallet/constants";

const PATHS = {
  BACK: "/keychain/wallets",
  CLOSE: "/index",
  CREATE_WALLET: "/keychain/setup/create-mnemonic",
  IMPORT_WALLET: "/keychain/setup/import-mnemonic",
  IMPORT_PRIVATE_KEY: "/keychain/setup/import-private-key",
  IMPORT_TEST_ADDRESS: "/keychain/setup/import-test-address",
} as const;

function AddWalletPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets } = useWallet();

  const [error, setError] = useState<string | null>(null);

  const isDevelopment = process.env.NODE_ENV === "development";

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiX className="size-4" aria-hidden="true" />,
        onClick: () => navigate(PATHS.CLOSE),
        ariaLabel: "Close",
      },
    });
  }, [setHeaderProps, navigate]);

  function handleCreateWallet() {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.CREATE_WALLET);
  }

  function handleImportWallet() {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.IMPORT_WALLET);
  }

  function handleImportPrivateKey() {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.IMPORT_PRIVATE_KEY);
  }

  function handleImportTestAddress() {
    if (wallets.length >= MAX_WALLETS) {
      setError(`Maximum number of wallets (${MAX_WALLETS}) reached`);
      return;
    }
    navigate(PATHS.IMPORT_TEST_ADDRESS);
  }

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="add-wallet-title">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
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
              <FiPlus className="size-4 mr-2" aria-hidden="true" />
              Create New Wallet
            </Button>
            <Button
              color="blue"
              fullWidth
              onClick={handleImportWallet}
              aria-label="Import Wallet"
            >
              <FiDownload className="size-4 mr-2" aria-hidden="true" />
              Import Mnemonic
            </Button>
            <Button
              color="gray"
              fullWidth
              onClick={handleImportPrivateKey}
              aria-label="Import Private Key"
            >
              <VscKey className="size-4 mr-2" aria-hidden="true" />
              Import Private Key
            </Button>
            {isDevelopment && (
              <Button
                color="gray"
                fullWidth
                onClick={handleImportTestAddress}
                aria-label="Import Address (Dev Only)"
              >
                <FaEye className="size-4 mr-2" aria-hidden="true" />
                Import Address (Dev)
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddWalletPage;
