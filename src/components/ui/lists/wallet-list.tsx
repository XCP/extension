import { type ReactElement } from 'react';
import { RadioGroup } from '@headlessui/react';
import type { Address, Wallet } from '@/types/wallet';
import { WalletCard } from '@/components/ui/cards/wallet-card';

interface WalletListProps {
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  selectedAddress?: Address | null;
  onSelectWallet: (wallet: Wallet) => void;
  disableHardwareWallets?: boolean;
  hardwareWalletDisabledMessage?: string;
}

/**
 * WalletList displays a selectable list of wallets using radio group selection.
 *
 * @param props - The component props
 * @returns A ReactElement representing the wallet list
 */
export function WalletList({
  wallets,
  selectedWallet,
  selectedAddress,
  onSelectWallet,
  disableHardwareWallets = false,
  hardwareWalletDisabledMessage = 'Open in sidepanel',
}: WalletListProps): ReactElement {
  const handleWalletChange = (wallet: Wallet | null) => {
    if (wallet && !(disableHardwareWallets && wallet.type === 'hardware')) {
      onSelectWallet(wallet);
    }
  };

  return (
    <RadioGroup
      value={selectedWallet}
      onChange={handleWalletChange}
      className="space-y-2"
    >
      {wallets.map((wallet) => {
        const isHardwareDisabled = disableHardwareWallets && wallet.type === 'hardware';

        return (
          <WalletCard
            key={wallet.id}
            wallet={wallet}
            selected={selectedWallet?.id === wallet.id}
            displayAddress={selectedWallet?.id === wallet.id ? selectedAddress : null}
            onSelect={isHardwareDisabled ? () => undefined : onSelectWallet}
            isOnlyWallet={wallets.length === 1}
            disabled={isHardwareDisabled}
            disabledMessage={isHardwareDisabled ? hardwareWalletDisabledMessage : undefined}
          />
        );
      })}
    </RadioGroup>
  );
}
