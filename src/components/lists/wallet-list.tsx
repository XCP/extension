import { RadioGroup } from '@headlessui/react';
import type { Wallet } from '@/utils/wallet';
import WalletCard from '@/components/cards/wallet-card';

interface WalletListProps {
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  onSelectWallet: (wallet: Wallet) => void;
}

export function WalletList({ wallets, selectedWallet, onSelectWallet }: WalletListProps) {
  return (
    <RadioGroup
      value={selectedWallet}
      onChange={onSelectWallet}
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
