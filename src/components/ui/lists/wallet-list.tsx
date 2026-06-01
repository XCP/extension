import { type ReactElement } from 'react';
import { RadioGroup } from '@headlessui/react';
import type { Address, Wallet } from '@/types/wallet';
import { WalletCard } from '@/components/ui/cards/wallet-card';

interface WalletListProps {
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  selectedAddress?: Address | null;
  onSelectWallet: (wallet: Wallet) => void;
}

/**
 * WalletList displays a selectable list of wallets using radio group selection.
 *
 * @param props - The component props
 * @returns A ReactElement representing the wallet list
 */
export function WalletList({ wallets, selectedWallet, selectedAddress, onSelectWallet }: WalletListProps): ReactElement {
  const handleWalletChange = (wallet: Wallet | null) => {
    if (wallet) {
      onSelectWallet(wallet);
    }
  };

  return (
    <RadioGroup
      value={selectedWallet}
      onChange={handleWalletChange}
      className="space-y-2"
    >
      {wallets.map((wallet) => (
        <WalletCard
          key={wallet.id}
          wallet={wallet}
          selected={selectedWallet?.id === wallet.id}
          displayAddress={selectedWallet?.id === wallet.id ? selectedAddress : null}
          onSelect={onSelectWallet}
          isOnlyWallet={wallets.length === 1}
        />
      ))}
    </RadioGroup>
  );
}
