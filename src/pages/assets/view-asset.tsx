"use client";

import React, { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaChevronRight } from 'react-icons/fa';
import { useHeader } from '@/contexts/header-context';
import { useLoading } from '@/contexts/loading-context';
import { useWallet } from '@/contexts/wallet-context';
import { useAssetDetails } from '@/hooks/useAssetDetails';
import { formatAsset } from '@/utils/format';

/**
 * Represents an actionable option for an asset.
 * @typedef {Object} Action
 * @property {string} id - Unique identifier for the action.
 * @property {string} name - Display name of the action.
 * @property {string} description - Description of the action.
 * @property {string} path - Navigation path for the action.
 */
interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * A component that displays detailed information and actions for a specific asset.
 * Fetches asset details and provides navigation to various asset-related actions.
 * @returns {ReactElement} The rendered asset view UI.
 * @example
 * ```tsx
 * <ViewAsset />
 * ```
 */
export const ViewAsset = (): ReactElement => {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset || '');

  /**
   * Configures the header and manages loading state for asset details fetch.
   */
  useEffect(() => {
    let loadingId: string | undefined;

    setHeaderProps({
      title: 'Asset',
      onBack: () => navigate('/index?tab=Assets'),
    });

    if (isLoading) {
      loadingId = showLoading('Loading asset details...');
    } else if (loadingId) {
      hideLoading(loadingId);
    }

    return () => {
      setHeaderProps(null);
      if (loadingId) hideLoading(loadingId);
    };
  }, [setHeaderProps, navigate, isLoading, showLoading, hideLoading]);

  /**
   * Generates a list of available actions based on asset details and ownership.
   * @returns {Action[]} The list of actionable options for the asset.
   */
  const getActions = (): Action[] => {
    if (!assetDetails?.assetInfo || !asset) return [];

    const actions: Action[] = [];
    const isOwner = assetDetails.assetInfo.issuer === activeAddress?.address;
    const isLocked = assetDetails.assetInfo.locked;
    const totalSupply = assetDetails.assetInfo.supply_normalized || '0';
    const hasSupply = Number(totalSupply) > 0;
    const issuerBalance = assetDetails.availableBalance || '0';

    // Eligible for reset if not locked and either:
    // - No supply (no holders), or
    // - Issuer holds all supply (single holder)
    const canResetSupply = !isLocked && isOwner && (!hasSupply || issuerBalance === totalSupply);

    if (!isLocked) {
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
      actions.push({
        id: 'give-dividend',
        name: 'Give Dividend',
        description: 'Distribute dividends to token holders',
        path: `/compose/dividend/${asset}`,
      });
    }

    if (isOwner && canResetSupply) {
      actions.push({
        id: 'reset-supply',
        name: 'Reset Supply',
        description: 'Reset asset description and other properties',
        path: `/compose/issuance/reset-supply/${asset}`,
      });
    }

    actions.push(
      {
        id: 'update-description',
        name: 'Update Description',
        description: 'Update the asset description',
        path: `/compose/issuance/update-description/${asset}`,
      },
      {
        id: 'transfer-ownership',
        name: 'Transfer Ownership',
        description: 'Transfer asset ownership to another address',
        path: `/compose/issuance/transfer-ownership/${asset}`,
      }
    );

    return actions;
  };

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
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Your Balance</span>
            <span className="text-sm text-gray-900">
              {assetDetails.availableBalance || '0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewAsset;
