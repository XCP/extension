import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';
import { RadioGroup } from '@headlessui/react';
import { Loading } from '@/components/loading';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { AddressType } from '@/utils/blockchain/bitcoin';
import { formatAddress } from '@/utils/format';

export function AddressTypeSettings() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, updateWalletAddressType, getPreviewAddressForType } = useWallet();
  const [addresses, setAddresses] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AddressType | null>(null);

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
      if (!activeWallet) {
        setIsLoading(false);
        return;
      }
      
      try {
        const addressMap: { [key: string]: string } = {};
        for (const type of availableAddressTypes) {
          try {
            const previewAddress = await getPreviewAddressForType(activeWallet.id, type);
            addressMap[type] = previewAddress;
          } catch (error) {
            console.error(`Error generating address for type ${type}:`, error);
            addressMap[type] = '';
          }
        }
        setAddresses(addressMap);
      } catch (error) {
        console.error('Error fetching addresses:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch addresses');
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    fetchAddresses();
  }, [activeWallet, availableAddressTypes, getPreviewAddressForType]);

  useEffect(() => {
    if (activeWallet) {
      setSelectedType(activeWallet.addressType);
    }
  }, [activeWallet]);

  const handleAddressTypeChange = async (newType: AddressType) => {
    if (!activeWallet) return;
    
    try {
      setIsUpdating(true);
      await updateWalletAddressType(activeWallet.id, newType);
      
      // Fetch the new preview address for the selected type
      const previewAddress = await getPreviewAddressForType(activeWallet.id, newType);
      setAddresses(prev => ({ ...prev, [newType]: previewAddress }));
      
    } catch (error) {
      console.error('Error updating address type:', error);
      setError(error instanceof Error ? error.message : 'Failed to update address type');
    } finally {
      setIsUpdating(false);
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
    return <Loading message="Loading addresses..." />;
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error: {error}
      </div>
    );
  }

  if (!activeWallet) {
    return (
      <div className="p-4 text-center text-gray-500">
        No wallet available
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <RadioGroup
        value={selectedType}
        onChange={handleAddressTypeChange}
        className="space-y-2"
        disabled={isUpdating}
      >
        {availableAddressTypes.map((type) => {
          const typeLabel = getAddressTypeDescription(type);
          const isDisabled = type === AddressType.P2TR || isUpdating;
          const disabledReason = type === AddressType.P2TR 
            ? 'Taproot is not yet supported' 
            : isUpdating 
              ? 'Updating...' 
              : undefined;

          return (
            <RadioGroup.Option
              key={type}
              value={type}
              disabled={isDisabled}
              className={({ checked }) => `
                relative w-full rounded transition duration-300 p-4
                ${isDisabled 
                  ? 'cursor-not-allowed bg-gray-300' 
                  : checked 
                    ? 'cursor-pointer bg-white shadow-md' 
                    : 'cursor-pointer bg-white hover:bg-gray-50'}
                ${isUpdating ? 'opacity-50' : ''}
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
                    <span className="text-sm font-medium text-gray-900 mb-1">
                      {typeLabel}
                    </span>
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
