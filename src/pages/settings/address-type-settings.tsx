import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';
import { RadioGroup } from '@headlessui/react';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { AddressType } from '@/utils/blockchain/bitcoin';
import { formatAddress } from '@/utils/format';
import { getWalletService } from '@/services/walletService';
import { Loading } from '@/components/loading';

export function AddressTypeSettings() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  // Updated: destructure activeWallet instead of walletState
  const { activeWallet, reloadWallets } = useWallet();
  const [addresses, setAddresses] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const walletService = getWalletService();

  // Use activeWallet directly.
  const currentWallet = activeWallet;

  const availableAddressTypes = useMemo(
    () => Object.values(AddressType).filter((type) => type !== AddressType.Counterwallet),
    []
  );

  useEffect(() => {
    setHeaderProps({
      title: 'Address Type',
      onBack: () => navigate('/settings'),
    });
  }, [setHeaderProps, navigate]);

  useEffect(() => {
    const fetchAddresses = async () => {
      if (currentWallet) {
        setIsLoading(true);
        const addressMap: { [key: string]: string } = {};
        for (const type of availableAddressTypes) {
          try {
            const address = await walletService.getAddressForType(currentWallet.id, type, 0);
            addressMap[type] = address;
          } catch (error) {
            console.error(`Error generating address for type ${type}:`, error);
            addressMap[type] = '';
          }
        }
        setAddresses(addressMap);
        setIsLoading(false);
      }
    };
    fetchAddresses();
  }, [currentWallet, availableAddressTypes, walletService]);

  const handleAddressTypeChange = async (newType: AddressType) => {
    if (!currentWallet) return;
    try {
      setIsLoading(true);
      await walletService.updateWalletAddressType(currentWallet.id, newType);
      await reloadWallets();
    } catch (error) {
      console.error('Error updating address type:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAddressTypeDescription = (type: AddressType) => {
    switch (type) {
      case AddressType.P2PKH:
        return 'Legacy (P2PKH)';
      case AddressType.P2WPKH:
        return 'Native SegWit (P2WPKH)';
      case AddressType.P2SH_P2WPKH:
        return 'Nested SegWit (P2SH-P2WPKH)';
      case AddressType.P2TR:
        return 'Taproot (P2TR)';
      default:
        return type;
    }
  };

  if (isLoading) {
    return <Loading showMessage={false} />;
  }

  return (
    <div className="space-y-2 p-4">
      <RadioGroup
        value={currentWallet?.addressType}
        onChange={handleAddressTypeChange}
        className="space-y-2"
      >
        {availableAddressTypes.map((type) => {
          const typeLabel = getAddressTypeDescription(type);
          const isDisabled = type === AddressType.P2TR;
          const disabledReason = isDisabled ? 'Taproot is not yet supported' : undefined;
          return (
            <RadioGroup.Option
              key={type}
              value={type}
              disabled={isDisabled}
              className={({ checked }) => `
                relative w-full rounded transition duration-300 p-4
                ${isDisabled ? 'cursor-not-allowed bg-gray-300' : (checked ? 'cursor-pointer bg-white shadow-md' : 'cursor-pointer bg-white hover:bg-gray-50')}
              `}
            >
              {({ checked }) => (
                <>
                  {checked && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-5">
                      <FaCheck className="w-4 h-4 text-blue-500" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 mb-1">{typeLabel}</span>
                    <span className="text-xs text-gray-500">
                      {addresses[type] ? formatAddress(addresses[type]) : 'Loading...'}
                    </span>
                    {isDisabled && disabledReason && (
                      <span className="text-xs text-blue-500 mt-1">{disabledReason}</span>
                    )}
                  </div>
                </>
              )}
            </RadioGroup.Option>
          );
        })}
      </RadioGroup>
    </div>
  );
}

export default AddressTypeSettings;
