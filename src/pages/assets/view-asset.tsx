import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaSpinner, FaChevronRight } from 'react-icons/fa';
import { useWallet } from '@/contexts/wallet-context';
import { useAssetDetails } from '@/hooks/useAssetDetails';
import { formatAsset } from '@/utils/format';
import { useHeader } from '@/contexts/header-context';

interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
}

export const ViewAsset = () => {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset || '');

  useEffect(() => {
    setHeaderProps({
      title: 'Asset',
      onBack: () => navigate('/index?tab=Assets'),
    });

    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  const getActions = (): Action[] => {
    if (!assetDetails?.assetInfo || !asset) return [];

    const actions: Action[] = [];
    const isOwner = assetDetails.assetInfo.issuer === activeAddress?.address;
    const hasSupply = assetDetails.assetInfo.supply && Number(assetDetails.assetInfo.supply) > 0;

    if (!assetDetails.assetInfo.locked) {
      actions.push(
        {
          id: 'issue-supply',
          name: 'Issue Supply',
          description: 'Issue additional tokens for this asset',
          path: `/compose/issuance/${asset}/issue-supply`,
        },
        {
          id: 'lock-supply',
          name: 'Lock Supply',
          description: 'Permanently lock the token supply',
          path: `/compose/issuance/${asset}/lock-supply`,
        }
      );
    }

    if (!assetDetails.assetInfo.asset_longname) {
      actions.push({
        id: 'issue-subasset',
        name: 'Issue Subasset',
        description: 'Create a new asset under this namespace',
        path: `/compose/issuance/${asset}`,
      });
    }

    if (isOwner && hasSupply) {
      actions.push(
        {
          id: 'give-dividend',
          name: 'Give Dividend',
          description: 'Distribute dividends to token holders',
          path: `/compose/dividend/${asset}`,
        },
        {
          id: 'reset-supply',
          name: 'Reset Supply',
          description: 'Reset asset description and other properties',
          path: `/actions/reset-supply/${asset}`,
        }
      );
    }

    actions.push(
      {
        id: 'update-description',
        name: 'Update Description',
        description: 'Update the asset description',
        path: `/compose/issuance/${asset}/update-description`,
      },
      {
        id: 'transfer-ownership',
        name: 'Transfer Ownership',
        description: 'Transfer asset ownership to another address',
        path: `/compose/issuance/${asset}/transfer-ownership`,
      }
    );

    return actions;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <FaSpinner className="animate-spin text-4xl text-primary-600" />
      </div>
    );
  }

  if (error || !assetDetails) {
    return (
      <div className="p-4 text-center text-gray-600">
        Failed to load asset information
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Asset Header */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          {formatAsset(asset || '', {
            assetInfo: assetDetails.assetInfo,
          })}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {assetDetails.assetInfo?.description || 'No description'}
        </p>
      </div>

      {/* Asset Actions */}
      <div className="space-y-2">
        {getActions().map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(action.path)}
            className="bg-white rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
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

      {/* Asset Details */}
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Asset Details</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Supply</span>
            <span className="text-sm text-gray-900">
              {assetDetails.assetInfo?.supply_normalized || '0'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Divisible</span>
            <span className="text-sm text-gray-900">
              {assetDetails.isDivisible ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Locked</span>
            <span className="text-sm text-gray-900">
              {assetDetails.assetInfo?.locked ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Issuer</span>
            <span className="text-sm text-gray-900 font-mono">
              {assetDetails.assetInfo?.issuer || 'Unknown'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewAsset; 