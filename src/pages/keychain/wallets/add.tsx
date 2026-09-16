import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FaEye, FaPlus, FiDownload, FiShield, FiX, VscKey } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MAX_WALLETS } from "@/core/wallet/constants";

import { t } from '@/i18n';

/** Check if we're running in the sidepanel (vs popup) */
const isSidepanel = () => document.body.dataset.context === 'sidepanel';

const PATHS = {
  BACK: "/keychain/wallets",
  CLOSE: "/index",
  CREATE_WALLET: "/keychain/setup/create-mnemonic",
  IMPORT_WALLET: "/keychain/setup/import-mnemonic",
  IMPORT_PRIVATE_KEY: "/keychain/setup/import-private-key",
  IMPORT_TEST_ADDRESS: "/keychain/setup/import-test-address",
  CONNECT_HARDWARE: "/keychain/wallets/connect-hardware",
} as const;

function AddWalletPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, removeWallet } = useWallet();

  const [error, setError] = useState<string | null>(null);

  // Find any connected hardware wallet
  const hardwareWallet = wallets.find((w) => w.type === 'hardware');

  const isDevelopment = process.env.NODE_ENV === "development";

  // Hardware wallets require sidepanel to avoid popup closing during device interaction
  const canUseHardwareWallet = useMemo(() => isSidepanel(), []);

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiX className="size-4" aria-hidden="true" />,
        onClick: () => navigate(PATHS.CLOSE),
        ariaLabel: t('common_close'),
      },
    });
  }, [setHeaderProps, navigate]);

  function handleCreateWallet() {
    if (wallets.length >= MAX_WALLETS) {
      setError(t('common_maximum_number_of_wallets_reached', [String(MAX_WALLETS)]));
      return;
    }
    navigate(PATHS.CREATE_WALLET);
  }

  function handleImportWallet() {
    if (wallets.length >= MAX_WALLETS) {
      setError(t('common_maximum_number_of_wallets_reached', [String(MAX_WALLETS)]));
      return;
    }
    navigate(PATHS.IMPORT_WALLET);
  }

  function handleImportPrivateKey() {
    if (wallets.length >= MAX_WALLETS) {
      setError(t('common_maximum_number_of_wallets_reached', [String(MAX_WALLETS)]));
      return;
    }
    navigate(PATHS.IMPORT_PRIVATE_KEY);
  }

  function handleImportTestAddress() {
    if (wallets.length >= MAX_WALLETS) {
      setError(t('common_maximum_number_of_wallets_reached', [String(MAX_WALLETS)]));
      return;
    }
    navigate(PATHS.IMPORT_TEST_ADDRESS);
  }

  function handleConnectHardware() {
    if (wallets.length >= MAX_WALLETS) {
      setError(t('common_maximum_number_of_wallets_reached', [String(MAX_WALLETS)]));
      return;
    }
    navigate(PATHS.CONNECT_HARDWARE);
  }

  const handleDisconnectHardware = useCallback(async () => {
    if (!hardwareWallet) return;

    // Hardware wallets are session-only, just remove from memory
    // The removeWallet function will:
    // 1. Clear activeWalletId if this was the active wallet
    // 2. Call refreshWalletState which auto-selects the first remaining wallet
    await removeWallet(hardwareWallet.id);
    navigate(PATHS.BACK, { replace: true });
  }, [removeWallet, hardwareWallet, navigate]);

  return (
    <section className="flex flex-col h-full" aria-labelledby="add-wallet-title">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
          <h2 id="add-wallet-title" className="text-2xl font-bold mb-6">
            {t('common_add_wallet')}
          </h2>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          <div className="space-y-4">
            <Button
              color="green"
              fullWidth
              onClick={handleCreateWallet}
              aria-label={t('wallets_add_create_new_wallet')}
            >
              <FaPlus className="size-4 mr-2" aria-hidden="true" />
              
              {t('wallets_add_create_new_wallet')}
            </Button>
            <Button
              color="blue"
              fullWidth
              onClick={handleImportWallet}
              aria-label={t('common_import_wallet')}
            >
              <FiDownload className="size-4 mr-2" aria-hidden="true" />
              
              {t('wallets_add_import_mnemonic')}
            </Button>
            <Button
              color="gray"
              fullWidth
              onClick={handleImportPrivateKey}
              aria-label={t('common_import_private_key')}
            >
              <VscKey className="size-4 mr-2" aria-hidden="true" />
              
              {t('common_import_private_key')}
            </Button>
            {hardwareWallet ? (
              <Button
                color="red"
                fullWidth
                onClick={handleDisconnectHardware}
                aria-label={t('wallets_add_disconnect_hardware_wallet')}
              >
                <FiX className="size-4 mr-2" aria-hidden="true" />
                
                {t('common_disconnect')} {hardwareWallet.name}
              </Button>
            ) : canUseHardwareWallet && (
              <Button
                color="black"
                fullWidth
                onClick={handleConnectHardware}
                aria-label={t('wallets_add_use_trezor_connect')}
              >
                <FiShield className="size-4 mr-2 text-[#00854D]" aria-hidden="true" />
                
                {t('wallets_add_use_trezor_connect')}
              </Button>
            )}
            {isDevelopment && (
              <Button
                color="gray"
                fullWidth
                onClick={handleImportTestAddress}
                aria-label={t('wallets_add_import_address_dev_only')}
              >
                <FaEye className="size-4 mr-2" aria-hidden="true" />
                
                {t('wallets_add_import_address_dev')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AddWalletPage;
