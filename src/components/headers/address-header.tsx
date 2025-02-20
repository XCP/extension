import logo from '@/assets/logo.png';
import { formatAddress } from '@/utils/format';

interface AddressHeaderProps {
  address: string;
  walletName?: string;
  className?: string;
}

export const AddressHeader = ({ address, walletName, className = '' }: AddressHeaderProps) => {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={logo}
        alt="Logo"
        className="w-12 h-12 mr-4 rounded-full"
      />
      <div>
        {walletName && (
          <p className="text-sm text-gray-600">
            {walletName}
          </p>
        )}
        <h2 className="text-xl font-bold">{formatAddress(address, true)}</h2>
      </div>
    </div>
  );
};
