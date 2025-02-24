import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import { Button } from '@/components/button';
import { AddressList } from '@/components/lists/address-list';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { ErrorAlert } from '@/components/error-alert';
import type { Address } from '@/utils/wallet';

export function AddressSelection() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { 
    activeWallet, 
    activeAddress, 
    setActiveAddress, 
    addAddress,
    walletLocked,
  } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const handleAddAddress = useCallback(async () => {
    if (!activeWallet?.id) return;
    if (activeWallet.type !== 'mnemonic') return;
    if (activeWallet.addresses.length >= 20) return;

    try {
      if (walletLocked) {
        navigate('/unlock', { 
          state: { 
            returnTo: '/address/select',
            walletId: activeWallet.id 
          } 
        });
        return;
      }

      await addAddress(activeWallet.id);
    } catch (error) {
      console.error('Failed to add address:', error);
      setError('Failed to add address. Please try again.');
    }
  }, [activeWallet, addAddress, walletLocked, navigate]);

  const handleSelectAddress = useCallback(async (address: Address) => {
    await setActiveAddress(address);
    navigate('/index');
  }, [setActiveAddress, navigate]);

  useEffect(() => {
    setHeaderProps({
      title: 'Addresses',
      onBack: () => navigate(-1),
      rightButton: activeWallet?.type === 'mnemonic'
        ? {
            icon: <FaPlus />,
            onClick: handleAddAddress,
            ariaLabel: 'Add Address',
          }
        : undefined,
    });
  }, [setHeaderProps, navigate, handleAddAddress, activeWallet?.type, walletLocked]);

  if (!activeWallet) return null;

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="address-selection-title">
      <div className="flex-grow overflow-y-auto p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="address-selection-title" className="sr-only">
          Select an Address
        </h2>
        <AddressList
          addresses={activeWallet.addresses}
          selectedAddress={activeAddress}
          onSelectAddress={handleSelectAddress}
          walletId={activeWallet.id}
        />
      </div>
      <div className="p-4">
        <Button
          color="green"
          fullWidth
          onClick={handleAddAddress}
          disabled={
            activeWallet.addresses.length >= 20 ||
            walletLocked ||
            activeWallet.type !== 'mnemonic'
          }
          aria-label="Add Address"
        >
          <FaPlus className="mr-2" aria-hidden="true" />
          {walletLocked ? 'Unlock to Add Address' : 'Add Address'}
        </Button>
      </div>
    </div>
  );
}

export default AddressSelection;
