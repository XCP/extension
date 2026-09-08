import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { WalletList } from '@/components/domain/wallet/wallet-list';
import { FaPlus } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { MAX_WALLETS } from '@/core/wallet/constants';
import { t } from '@/i18n';
import type { Wallet } from '@/types/wallet';

/** Check if we're running in the sidepanel (vs popup) */
const isSidepanel = () => document.body.dataset.context === 'sidepanel';

/** Route constants, at module scope so their identity is stable across renders. */
const PATHS = {
  BACK: '/',
  ADD_WALLET: '/keychain/wallets/add',
  INDEX: '/index',
} as const;

/**
 * SelectWallet component allows users to choose an active wallet or add a new one.
 *
 * Features:
 * - Displays a list of wallets for selection
 * - Provides an option to add a new wallet with a limit of 20
 * - Navigates to the index on wallet selection
 */
function WalletsPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, activeWallet, activeAddress, selectWallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const canUseHardwareWallet = isSidepanel();

  const handleAddWallet = useCallback(() => {
    if (wallets.length >= MAX_WALLETS) {
      setError(t('common_maximum_number_of_wallets_reached', [String(MAX_WALLETS)]));
      return;
    }
    navigate(PATHS.ADD_WALLET);
  }, [navigate, wallets.length]);

  // Configure header with add wallet button
  useEffect(() => {
    setHeaderProps({
      title: t('keychain_wallets_keychain'),
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FaPlus className="size-4" aria-hidden="true" />,
        onClick: handleAddWallet,
        ariaLabel: t('common_add_wallet'),
      },
    });
  }, [setHeaderProps, navigate, handleAddWallet]);

  /**
   * The wallet a click has chosen but the keychain has not finished loading.
   *
   * Selecting decrypts the secret and derives every address, which is work — and until it
   * returned, nothing on this screen moved: the radio still showed the wallet you were leaving,
   * so a click read as having missed. Showing the choice immediately is the honest answer, since
   * the choice really has been made; it reverts if the load fails.
   */
  const [pendingWallet, setPendingWallet] = useState<Wallet | null>(null);

  const handleSelectWalletInternal = async (wallet: Wallet) => {
    if (wallet.type === 'hardware' && !canUseHardwareWallet) {
      return;
    }
    // `withStateLock` queues rather than drops, so a second click while the first is in flight
    // does not replace it — it waits behind it and then derives every address over again.
    if (pendingWallet) {
      return;
    }

    setPendingWallet(wallet);
    try {
      // Load wallet (decrypts secret and derives addresses)
      await selectWallet(wallet.id);
      navigate(PATHS.INDEX);
    } catch (err) {
      console.error('Error selecting wallet:', err);
      setError(t('keychain_wallets_failed_to_select_wallet_please'));
      setPendingWallet(null);
    }
  };

  return (
    <section
      className="flex flex-col h-full"
      aria-labelledby="wallet-selection-title"
    >
      <div className="flex-grow overflow-y-auto p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="wallet-selection-title" className="sr-only text-2xl font-bold mb-2">
          {t('keychain_wallets_select_a_wallet')}
        </h2>
        <WalletList
          wallets={wallets}
          selectedWallet={pendingWallet ?? activeWallet}
          // A wallet that is still loading has no derived addresses yet — its secret is decrypted
          // as part of the work being waited on — so the card falls back to its preview address
          // rather than showing the address of the wallet being left.
          selectedAddress={pendingWallet ? null : activeAddress}
          onSelectWallet={handleSelectWalletInternal}
          disableHardwareWallets={!canUseHardwareWallet}
          hardwareWalletDisabledMessage={t('keychain_wallets_open_in_sidepanel')}
        />
      </div>
      <div className="p-4">
        <Button
          color="green"
          fullWidth
          onClick={handleAddWallet}
          disabled={wallets.length >= MAX_WALLETS}
          aria-label={t('common_add_wallet')}
        >
          <FaPlus className="size-4 mr-2" aria-hidden="true" />
          
          {t('common_add_wallet')}
        </Button>
      </div>
    </section>
  );
}

export default WalletsPage;
