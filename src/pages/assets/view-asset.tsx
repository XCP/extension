"use client";

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAsset } from "@/utils/format";
import { AssetHeader } from "@/components/headers/asset-header";
import type { ReactElement } from "react";

/**
 * Interface for an actionable option for an asset.
 */
interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/index?tab=Assets",
    COMPOSE: "/compose",
  } as const,
} as const;

/**
 * ViewAsset component displays detailed information and actions for a specific asset.
 *
 * Features:
 * - Fetches and displays asset details
 * - Lists actionable options based on ownership and asset state
 *
 * @returns {ReactElement} The rendered asset view UI.
 * @example
 * ```tsx
 * <ViewAsset />
 * ```
 */
export default function ViewAsset(): ReactElement {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset || "");

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Asset",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * Generates a list of available actions based on asset details and ownership.
   * @returns {Action[]} The list of actionable options for the asset.
   */
  const getActions = (): Action[] => {
    if (!assetDetails?.assetInfo || !asset) return [];

    const actions: Action[] = [];
    const isOwner = assetDetails.assetInfo.issuer === activeAddress?.address;
    const isLocked = assetDetails.assetInfo.locked;
    const totalSupply = assetDetails.assetInfo.supply || "0";
    const hasSupply = Number(totalSupply) > 0;
    const issuerBalance = assetDetails.availableBalance || "0";
    const canResetSupply = !isLocked && isOwner && (!hasSupply || issuerBalance === totalSupply);

    if (!isLocked) {
      actions.push(
        {
          id: "issue-supply",
          name: "Issue Supply",
          description: "Issue additional tokens for this asset",
          path: `${CONSTANTS.PATHS.COMPOSE}/issuance/${asset}/issue-supply`,
        },
        {
          id: "lock-supply",
          name: "Lock Supply",
          description: "Permanently lock the token supply",
          path: `${CONSTANTS.PATHS.COMPOSE}/issuance/${asset}/lock-supply`,
        }
      );
    }

    if (!assetDetails.assetInfo.asset_longname) {
      actions.push({
        id: "issue-subasset",
        name: "Issue Subasset",
        description: "Create a new asset under this namespace",
        path: `${CONSTANTS.PATHS.COMPOSE}/issuance/${asset}`,
      });
    }

    if (isOwner && hasSupply) {
      actions.push({
        id: "give-dividend",
        name: "Give Dividend",
        description: "Distribute dividends to token holders",
        path: `${CONSTANTS.PATHS.COMPOSE}/dividend/${asset}`,
      });
    }

    if (isOwner && canResetSupply) {
      actions.push({
        id: "reset-supply",
        name: "Reset Supply",
        description: "Reset asset description and other properties",
        path: `${CONSTANTS.PATHS.COMPOSE}/issuance/reset-supply/${asset}`,
      });
    }

    actions.push(
      {
        id: "update-description",
        name: "Update Description",
        description: "Update the asset description",
        path: `${CONSTANTS.PATHS.COMPOSE}/issuance/update-description/${asset}`,
      },
      {
        id: "transfer-ownership",
        name: "Transfer Ownership",
        description: "Transfer asset ownership to another address",
        path: `${CONSTANTS.PATHS.COMPOSE}/issuance/transfer-ownership/${asset}`,
      }
    );

    return actions;
  };

  if (isLoading) return <Spinner message="Loading asset details..." />;
  if (error || !assetDetails) {
    return <div className="p-4 text-center text-gray-600">Failed to load asset information</div>;
  }

  return (
    <div className="p-4 space-y-6" role="main" aria-labelledby="asset-title">
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <AssetHeader
          assetInfo={{
            asset: asset || "",
            asset_longname: assetDetails.assetInfo?.asset_longname || null,
            description: assetDetails.assetInfo?.description,
            issuer: assetDetails.assetInfo?.issuer,
            divisible: assetDetails.assetInfo?.divisible ?? false,
            locked: assetDetails.assetInfo?.locked ?? false,
            supply: assetDetails.assetInfo?.supply
          }}
        />
      </div>
      <div className="space-y-2">
        {getActions().map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(action.path)}
            className="bg-white rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
            role="button"
            tabIndex={0}
            aria-label={action.name}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-medium text-gray-900">{action.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{action.description}</p>
              </div>
              <FaChevronRight className="text-gray-400 w-4 h-4" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Asset Details</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Supply</span>
            <span className="text-sm text-gray-900">
              {assetDetails.assetInfo?.supply || "0"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Divisible</span>
            <span className="text-sm text-gray-900">{assetDetails.isDivisible ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Locked</span>
            <span className="text-sm text-gray-900">
              {assetDetails.assetInfo?.locked ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Issuer</span>
            <span className="text-sm text-gray-900 font-mono">
              {assetDetails.assetInfo?.issuer || "Unknown"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Your Balance</span>
            <span className="text-sm text-gray-900">{assetDetails.availableBalance || "0"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
