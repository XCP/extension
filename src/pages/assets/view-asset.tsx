"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaChevronRight, FaChevronDown, FaHistory } from "react-icons/fa";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatAsset, formatAmount, formatTimeAgo } from "@/utils/format";
import { AssetHeader } from "@/components/headers/asset-header";
import { fetchDividendsByAsset, type Dividend, type DividendResponse } from "@/utils/blockchain/counterparty/api";
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
  
  // Dividend history state
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [dividendsLoading, setDividendsLoading] = useState(false);
  const [dividendsError, setDividendsError] = useState<string | null>(null);
  const [showDividends, setShowDividends] = useState(false);
  const [hasMoreDividends, setHasMoreDividends] = useState(true);
  const [dividendsOffset, setDividendsOffset] = useState(0);

  /**
   * Loads dividend history for the asset
   */
  const loadDividends = async () => {
    if (!asset || dividendsLoading) return;
    
    setDividendsLoading(true);
    setDividendsError(null);
    
    try {
      const response: DividendResponse = await fetchDividendsByAsset(asset, {
        limit: 10,
        offset: dividendsOffset,
      });
      
      if (dividendsOffset === 0) {
        setDividends(response.result);
      } else {
        setDividends(prev => [...prev, ...response.result]);
      }
      
      setHasMoreDividends(response.result.length === 10);
      setDividendsOffset(prev => prev + response.result.length);
    } catch (err) {
      setDividendsError(err instanceof Error ? err.message : "Failed to load dividend history");
    } finally {
      setDividendsLoading(false);
    }
  };

  // Load dividends when section is expanded
  useEffect(() => {
    if (showDividends && dividends.length === 0 && !dividendsLoading) {
      loadDividends();
    }
  }, [showDividends, asset]);

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
    const hasFairMinting = assetDetails.assetInfo.fair_minting;

    // Add Start Mint (fairminter) option based on counterparty-core rules:
    // 1. Asset cannot be BTC or XCP
    // 2. Must be the owner (issuer) of the asset
    // 3. Asset must not be locked
    // 4. No fairminter already exists (fair_minting must be false)
    const canStartFairminter = 
      asset !== "BTC" && 
      asset !== "XCP" && 
      isOwner && 
      !isLocked && 
      !hasFairMinting;

    if (canStartFairminter) {
      actions.push({
        id: "start-mint",
        name: "Start Mint",
        description: "Create a fairminter for this asset",
        path: `${CONSTANTS.PATHS.COMPOSE}/fairminter/${asset}`,
      });
    }

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
      <div>
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
      
      {/* Dividend History Section - Collapsible */}
      <div className="bg-white rounded-lg shadow-sm">
        <button
          onClick={() => setShowDividends(!showDividends)}
          className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
          aria-expanded={showDividends}
          aria-controls="dividend-history"
        >
          <div className="flex items-center gap-2">
            <FaHistory className="text-gray-500 w-4 h-4" aria-hidden="true" />
            <h3 className="text-sm font-medium text-gray-900">Dividend History</h3>
          </div>
          {showDividends ? (
            <FaChevronDown className="text-gray-400 w-4 h-4" aria-hidden="true" />
          ) : (
            <FaChevronRight className="text-gray-400 w-4 h-4" aria-hidden="true" />
          )}
        </button>
        
        {showDividends && (
          <div id="dividend-history" className="border-t border-gray-100">
            {dividendsLoading && dividends.length === 0 ? (
              <div className="p-4">
                <Spinner message="Loading dividend history..." />
              </div>
            ) : dividendsError ? (
              <div className="p-4 text-center text-red-600 text-sm">
                {dividendsError}
              </div>
            ) : dividends.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No dividends have been distributed for this asset
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {dividends.map((dividend) => (
                  <div
                    key={dividend.tx_hash}
                    onClick={() => navigate(`/transaction/${dividend.tx_hash}`)}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    role="button"
                    tabIndex={0}
                    aria-label={`View dividend transaction ${dividend.tx_hash}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatAmount({
                            value: Number(dividend.quantity_per_unit_normalized),
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 8,
                          })} {dividend.dividend_asset} per unit
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Total distributed: {formatAmount({
                            value: Number(dividend.total_distributed_normalized),
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 8,
                          })} {dividend.dividend_asset}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimeAgo(dividend.block_time)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 break-all">
                      TX: {dividend.tx_hash}
                    </div>
                  </div>
                ))}
                
                {hasMoreDividends && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      loadDividends();
                    }}
                    disabled={dividendsLoading}
                    className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  >
                    {dividendsLoading ? "Loading..." : "Load More"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
