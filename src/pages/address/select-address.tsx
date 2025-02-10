import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';
import AddressSelector from '@/components/wallet/address-selector';
import { useHeader } from '@/contexts/header-context';

export const AddressSelection: React.FC = () => {
  const navigate = useNavigate();
  const { activeWallet, activeAddress, setActiveAddress } = useWallet();
  const { setHeaderProps } = useHeader();

  useEffect(() => {
    setHeaderProps({
      title: 'Select Address',
      onBack: () => navigate(-1),
    });
  }, [setHeaderProps, navigate]);

  if (!activeWallet) return null;

  const handleSelectAddress = (address: any) => {
    setActiveAddress(address);
    navigate(-1);
  };

  const handleAddAddress = async () => {
    // If your wallet service exposes an addAddress method, call it here
    // then reload wallets if necessary.
    console.log('Add address (update as needed)');
  };

  return (
    <div className="p-4">
      <AddressSelector
        addresses={activeWallet.addresses}
        selectedAddress={activeAddress}
        onSelectAddress={handleSelectAddress}
        onAddAddress={handleAddAddress}
      />
    </div>
  );
};

export default AddressSelection;
