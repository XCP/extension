import { type ReactElement } from 'react';
import { RadioGroup } from '@headlessui/react';
import type { Address, Wallet } from '@/types/wallet';
import { formatAddress } from '@/utils/format';
import { WalletMenu } from '@/components/ui/menus/wallet-menu';
import { FiShield } from '@/components/icons';

interface WalletCardProps {
  wallet: Wallet;
  selected: boolean;
  onSelect: (wallet: Wallet) => void;
  isOnlyWallet: boolean;
  displayAddress?: Address | null;
  disabled?: boolean;
  disabledMessage?: string;
}

/**
 * WalletCard displays a selectable wallet with its name, primary address, and type.
 *
 * @param props - The component props
 * @returns A ReactElement representing the wallet card
 */
export function WalletCard({
  wallet,
  selected,
  onSelect,
  isOnlyWallet,
  displayAddress,
  disabled = false,
  disabledMessage,
}: WalletCardProps): ReactElement {
  // Use the active address for the selected wallet, otherwise fall back to address 0.
  const primaryAddress =
    disabled && disabledMessage
      ? disabledMessage
      : displayAddress?.address ||
        (wallet.addresses.length > 0
          ? wallet.addresses[0].address
          : wallet.previewAddress || 'No address');

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;

    // Only select the wallet if the menu wasn't clicked
    if (!(e.target as HTMLElement).closest('.wallet-menu')) {
      onSelect(wallet);
    }
  };

  return (
    <RadioGroup.Option
      value={wallet}
      disabled={disabled}
      className={({ checked }) => `
        relative w-full rounded transition duration-300 p-4
        ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : 'cursor-pointer'}
        ${!disabled && checked ? 'bg-blue-600 text-white shadow-md' : ''}
        ${!disabled && !checked ? 'bg-blue-100 hover:bg-blue-200 text-gray-800' : ''}
      `}
    >
      {({ checked }) => (
        <div onClick={handleClick} className="flex flex-col" aria-disabled={disabled}>
          <div className="flex justify-between items-center">
            <div className="text-sm font-medium">{wallet.name}</div>
            <div className="absolute top-2 right-2 wallet-menu">
              <WalletMenu wallet={wallet} isOnlyWallet={isOnlyWallet} />
            </div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className={disabled && disabledMessage ? 'text-sm font-medium' : 'font-mono text-sm'}>
              {disabled && disabledMessage ? primaryAddress : formatAddress(primaryAddress)}
            </span>
            <span className="text-xs capitalize flex items-center gap-1">
              {wallet.type === 'hardware' && (
                <FiShield className="w-3 h-3" aria-hidden="true" />
              )}
              {wallet.type === 'mnemonic' ? 'Mnemonic' : wallet.type === 'hardware' ? 'Hardware' : 'Private Key'}
            </span>
          </div>
        </div>
      )}
    </RadioGroup.Option>
  );
}
