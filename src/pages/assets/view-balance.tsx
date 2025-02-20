import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaSpinner, FaChevronRight } from 'react-icons/fa';
import { useWallet } from '@/contexts/wallet-context';
import { useHeader } from '@/contexts/header-context';
import { useBalanceDetails } from '@/hooks/useBalanceDetails';
import { formatAsset, formatAmount } from '@/utils/format';

interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
  variant?: 'default' | 'success' | 'destructive';
}

export const ViewBalance = () => {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { data: balanceDetails, isLoading, error } = useBalanceDetails(asset || '');

  useEffect(() => {
    setHeaderProps({
      title: 'Balance',
      onBack: () => navigate('/index?tab=Balances'),
    });

    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  const getActions = (): Action[] => {
    if (!asset || !balanceDetails) return [];

    const actions: Action[] = [];
    const isBTC = asset === 'BTC';

    if (isBTC) {
      actions.push(
        {
          id: 'send',
          name: 'Send',
          description: 'Send bitcoin to another address',
          path: `/compose/send/BTC`,
        },
        {
          id: 'btcpay',
          name: 'BTCPay',
          description: 'Pay for an order match with BTC',
          path: `/compose/btcpay`,
        },
        {
          id: 'dispense',
          name: 'Dispense',
          description: 'Trigger an open asset dispenser',
          path: `/compose/dispense`,
        }
      );
    } else {
      actions.push(
        {
          id: 'send',
          name: 'Send',
          description: 'Send this asset to another address',
          path: `/compose/send/${asset}`,
        },
        {
          id: 'order',
          name: 'DEX Order',
          description: 'Create a new order on the DEX',
          path: `/compose/order/${asset}`,
        },
        {
          id: 'dispenser',
          name: 'Dispenser',
          description: 'Create a new dispenser for this asset',
          path: `/compose/dispenser/${asset}`,
        },
        {
          id: 'attach',
          name: 'Attach',
          description: 'Attach this asset to a Bitcoin UTXO',
          path: `/balance/${asset}/attach`,
          variant: 'success',
        },
        {
          id: 'destroy',
          name: 'Destroy',
          description: 'Permanently destroy token supply',
          path: `/compose/destroy/${asset}`,
          variant: 'destructive',
        }
      );
    }

    return actions;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <FaSpinner className="animate-spin text-4xl text-primary-600" />
      </div>
    );
  }

  if (error || !balanceDetails) {
    return (
      <div className="p-4 text-center text-gray-600">
        Failed to load balance information
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Balance Header */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          {formatAsset(asset || '', {
            assetInfo: balanceDetails.assetInfo,
          })}
        </h2>
        <p className="text-3xl font-bold text-gray-900 mt-2">
          {formatAmount(balanceDetails.balance)}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {balanceDetails.assetInfo?.description || 'No description'}
        </p>
      </div>

      {/* Balance Actions */}
      <div className="space-y-2">
        {getActions().map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(action.path)}
            className={`
              bg-white rounded-lg p-4 shadow-sm cursor-pointer 
              hover:bg-gray-50 transition-colors
              ${action.variant === 'success' ? 'border border-green-200' : ''}
              ${action.variant === 'destructive' ? 'border border-red-200' : ''}
            `}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className={`
                  text-sm font-medium
                  ${action.variant === 'success' ? 'text-green-600' : ''}
                  ${action.variant === 'destructive' ? 'text-red-600' : 'text-gray-900'}
                `}>
                  {action.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {action.description}
                </p>
              </div>
              <FaChevronRight className="text-gray-400 w-4 h-4" />
            </div>
          </div>
        ))}
      </div>

      {/* UTXO Balances */}
      {balanceDetails.utxoBalances && balanceDetails.utxoBalances.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-medium text-gray-900">UTXO Balances</h3>
          <div className="space-y-2">
            {balanceDetails.utxoBalances.map((utxo, index) => (
              <div
                key={index}
                onClick={() => navigate(`/utxo/${utxo.txid}`)}
                className="flex justify-between items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <span className="text-sm font-mono text-gray-500">{utxo.txid}</span>
                <span className="text-sm text-gray-900">{utxo.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewBalance; 