import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import { Button } from '@/components/button';
import { AddressList } from '@/components/lists/address-list';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import type { Address } from '@/utils/wallet';
import { getWalletService } from '@/services/walletService';

export function AddressSelection() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress, setActiveAddress, reloadWallets } = useWallet();

  const handleAddAddress = async () => {
    if (!activeWallet?.id) return;
    if (activeWallet.type !== 'mnemonic') return;
    if (!activeWallet.addresses?.length || activeWallet.addresses.length >= 10) return;

    try {
      const walletService = getWalletService();
      await walletService.addAddress(activeWallet.id);
      await reloadWallets();
    } catch (error) {
      console.error('Failed to add address:', error);
    }
  };

  const handleSelectAddress = async (address: Address) => {
    setActiveAddress(address);
    navigate('/index');
  };

  useEffect(() => {
    setHeaderProps({
      title: 'Select Address',
      onBack: () => navigate(-1),
      rightButton: {
        icon: <FaPlus />,
        onClick: handleAddAddress,
        ariaLabel: 'Add Address',
      },
    });
  }, [setHeaderProps, navigate]);

  if (!activeWallet) return null;

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="address-selection-title">
      <div className="flex-grow overflow-y-auto p-4">
        <h2 id="address-selection-title" className="sr-only">Select an Address</h2>
        <AddressList
          addresses={activeWallet.addresses}
          selectedAddress={activeAddress}
          onSelectAddress={handleSelectAddress}
        />
      </div>
      <div className="p-4">
        <Button
          color="green"
          fullWidth
          onClick={handleAddAddress}
          disabled={activeWallet.addresses.length >= 10}
          aria-label="Add Address"
        >
          <FaPlus className="mr-2" aria-hidden="true" />
          Add Address
        </Button>
      </div>
    </div>
  );
}

export default AddressSelection;
