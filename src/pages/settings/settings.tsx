import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronRight } from 'react-icons/fa';
import { useWallet } from '@/contexts/wallet-context';
import { useHeader } from '@/contexts/header-context';
import { AddressType } from '@/utils/blockchain/bitcoin';
import Footer from '@/components/footer';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet } = useWallet();

  useEffect(() => {
    setHeaderProps({
      title: 'Settings',
      onBack: () => navigate('/index'),
    });
  }, [setHeaderProps, navigate]);

  const getAddressTypeDescription = () => {
    if (!activeWallet) return '';
    switch (activeWallet.addressType) {
      case AddressType.P2PKH:
        return 'Legacy (P2PKH)';
      case AddressType.P2SH_P2WPKH:
        return 'Nested SegWit (P2SH-P2WPKH)';
      case AddressType.P2WPKH:
        return 'Native SegWit (P2WPKH)';
      case AddressType.P2TR:
        return 'Taproot (P2TR)';
      default:
        return '';
    }
  };

  const settingOptions = [
    ...(activeWallet?.type === 'mnemonic' &&
       activeWallet?.addressType !== AddressType.Counterwallet
      ? [
          {
            id: 'addressType',
            name: 'Address Type',
            description: getAddressTypeDescription(),
            path: '/settings/address-type',
          },
        ]
      : []),
    {
      id: 'security',
      name: 'Change Password',
      description: 'Change your wallet password',
      path: '/settings/security',
    },
    {
      id: 'connectedSites',
      name: 'Connected Sites',
      description: 'Manage website connections',
      path: '/settings/connected-sites',
    },
    {
      id: 'advanced',
      name: 'Advanced Options',
      description: 'Network settings and developer options',
      path: '/settings/advanced',
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto no-scrollbar">
        <div className="p-4">
          <div className="space-y-2">
            {settingOptions.map((option) => (
              <div
                key={option.id}
                onClick={() => navigate(option.path)}
                className="relative w-full rounded transition duration-300 p-4 cursor-pointer bg-white hover:bg-gray-50"
              >
                <div className="flex flex-col">
                  <div className="absolute top-1/2 -translate-y-1/2 right-5">
                    <FaChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="text-sm font-medium text-gray-900 mb-1">{option.name}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* About Section */}
          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-900 px-4 mb-2">About XCP Wallet</h3>
            <div className="bg-white rounded">
              <div className="p-4 border-b">
                <div className="text-sm">Version 0.0.1</div>
              </div>
              <a
                href="https://www.xcp.io/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50"
              >
                Terms of Service
              </a>
              <a
                href="https://www.xcp.io/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50"
              >
                Privacy Policy
              </a>
              <a
                href="https://www.xcp.io/?ref=wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50"
              >
                Visit Website
              </a>
            </div>
          </div>

          {/* Reset Wallet Section */}
          <div className="mt-8 mb-4">
            <button
              onClick={() => navigate('/reset-wallet')}
              className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors duration-300"
              aria-label="Reset Wallet"
            >
              Reset Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;