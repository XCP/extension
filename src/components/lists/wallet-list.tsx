import { RadioGroup } from '@headlessui/react';
import type { Wallet } from '@/utils/wallet/walletManager';
import WalletCard from '@/components/cards/wallet-card';

interface WalletListProps {
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  onSelectWallet: (wallet: Wallet) => void;
}

export function WalletList({ wallets, selectedWallet, onSelectWallet }: WalletListProps) {
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
          onSelect={onSelectWallet}
          isOnlyWallet={wallets.length === 1}
        />
      ))}
    </RadioGroup>
  );
}
