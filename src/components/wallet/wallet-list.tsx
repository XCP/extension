import React from 'react';
import { RadioGroup } from '@headlessui/react';
import { Wallet } from '@/utils/wallet';
import WalletCard from '@/components/wallet/wallet-card';

interface WalletListProps {
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  onSelectWallet: (wallet: Wallet) => void;
}

export const WalletList: React.FC<WalletListProps> = ({
  wallets,
  selectedWallet,
  onSelectWallet,
}) => {
  return (
    <RadioGroup value={selectedWallet} onChange={onSelectWallet} className="space-y-2">
      {wallets.map((wallet) => (
        <WalletCard
          key={wallet.id}
          wallet={wallet}
          selected={selectedWallet?.id === wallet.id}
          onSelect={onSelectWallet}
        />
      ))}
    </RadioGroup>
  );
};

export default WalletList;
