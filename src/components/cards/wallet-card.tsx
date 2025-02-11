import { RadioGroup } from '@headlessui/react';
import type { Wallet } from '@/utils/wallet';
import { formatAddress } from '@/utils/format';
import { WalletMenu } from '@/components/menus/wallet-menu';

interface WalletCardProps {
  wallet: Wallet;
  selected: boolean;
  onSelect: (wallet: Wallet) => void;
}

function WalletCard({ wallet, selected, onSelect }: WalletCardProps) {
  const primaryAddress =
    wallet.addresses.length > 0 ? wallet.addresses[0].address : 'No address';

  const handleClick = (e: React.MouseEvent) => {
    // Only select the wallet if the menu wasn't clicked
    if (!(e.target as HTMLElement).closest('.wallet-menu')) {
      onSelect(wallet);
    }
  };

  return (
    <RadioGroup.Option
      value={wallet}
      className={({ checked }) => `
        relative w-full rounded transition duration-300 p-4 cursor-pointer
        ${checked ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-100 hover:bg-blue-200 text-gray-800'}
      `}
    >
      {({ checked }) => (
        <div onClick={handleClick} className="flex flex-col">
          <div className="flex justify-between items-center">
            <div className="text-sm font-medium">{wallet.name}</div>
            <div className="absolute top-2 right-2 wallet-menu">
              <WalletMenu wallet={wallet} isFirstWallet={false} />
            </div>
          </div>
          <div className="mt-2">
            <span className="font-mono text-sm">{formatAddress(primaryAddress)}</span>
          </div>
          <div className="mt-1 text-xs">
            {wallet.addressCount
              ? `${wallet.addressCount} address${wallet.addressCount > 1 ? 'es' : ''}`
              : ''}
          </div>
        </div>
      )}
    </RadioGroup.Option>
  );
}

export default WalletCard;
