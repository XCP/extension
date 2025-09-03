"use client";

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Spinner } from "@/components/spinner";
import { BalanceHeader } from "@/components/headers/balance-header";
import { ActionList } from "@/components/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { formatTxid } from "@/utils/format";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";
import type { ActionSection } from "@/components/lists/action-list";


/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    COMPOSE: "/compose",
    UTXO: "/utxo",
  } as const,
} as const;

/**
 * ViewBalance component displays balance details and actions for a specific asset.
 *
 * Features:
 * - Displays asset balance with a header
 * - Lists actions based on asset type (BTC or other)
 * - Shows UTXO balances if available
 *
 * @returns {ReactElement} The rendered balance view UI.
 * @example
 * ```tsx
 * <ViewBalance />
 * ```
 */
export default function ViewBalance(): ReactElement {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset || "");

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Balance",
      onBack: () => navigate("/"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * Generates a list of available actions based on the asset type and details.
   * @returns {ActionSection[]} The list of actionable options for the balance.
   */
  const getActionSections = (): ActionSection[] => {
    if (!asset || !assetDetails) return [];
    const isBTC = asset === "BTC";
    const isXCP = asset === "XCP";

    const items = isBTC
      ? [
          {
            id: "send",
            title: "Send",
            description: "Send bitcoin to another address",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/send/BTC`),
          },
          {
            id: "order",
            title: "DEX Order",
            description: "Create a new order on the DEX",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/order/BTC`),
          },
          {
            id: "dispense",
            title: "Dispense",
            description: "Trigger an open asset dispenser",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/dispenser/dispense`),
          },
          {
            id: "fairmint",
            title: "Fairmint",
            description: "Trigger an open asset fairminter",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/fairmint/BTC`),
          },
          {
            id: "btcpay",
            title: "BTCPay",
            description: "Pay for an order match with BTC",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/btcpay`),
          },
        ]
      : isXCP
      ? [
          {
            id: "send",
            title: "Send",
            description: "Send this asset to another address",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/send/${asset}`),
          },
          {
            id: "order",
            title: "DEX Order",
            description: "Create a new order on the DEX",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/order/${asset}`),
          },
          {
            id: "dispenser",
            title: "Dispenser",
            description: "Create a new dispenser for this asset",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/dispenser/${asset}`),
          },
          {
            id: "fairmint",
            title: "Fairmint",
            description: "Trigger an open asset fairminter",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/fairmint/XCP`),
          },
          {
            id: "attach",
            title: "Attach",
            description: "Attach this asset to a Bitcoin UTXO",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/utxo/attach/${asset}`),
          },
          {
            id: "destroy",
            title: "Destroy",
            description: "Permanently destroy token supply",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/destroy/${asset}`),
          },
        ]
      : [
          {
            id: "send",
            title: "Send",
            description: "Send this asset to another address",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/send/${asset}`),
          },
          {
            id: "order",
            title: "DEX Order",
            description: "Create a new order on the DEX",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/order/${asset}`),
          },
          {
            id: "dispenser",
            title: "Dispenser",
            description: "Create a new dispenser for this asset",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/dispenser/${asset}`),
          },
          {
            id: "attach",
            title: "Attach",
            description: "Attach this asset to a Bitcoin UTXO",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/utxo/attach/${asset}`),
          },
          {
            id: "destroy",
            title: "Destroy",
            description: "Permanently destroy token supply",
            onClick: () => navigate(`${CONSTANTS.PATHS.COMPOSE}/destroy/${asset}`),
          },
        ];
    return [{ items }];
  };

  if (isLoading) return <Spinner message="Loading balance details..." />;
  if (error || !assetDetails) {
    return <div className="p-4 text-center text-gray-600">Failed to load balance information</div>;
  }

  const balanceData: TokenBalance = {
    asset: asset || "",
    asset_info: {
      asset_longname: assetDetails.assetInfo?.asset_longname || null,
      description: assetDetails.assetInfo?.description || "",
      issuer: assetDetails.assetInfo?.issuer || "",
      divisible: assetDetails.isDivisible,
      locked: assetDetails.assetInfo?.locked ?? false,
      supply: assetDetails.assetInfo?.supply || "0"
    },
    quantity_normalized: assetDetails.availableBalance || "0",
  };

  return (
    <div className="p-4 space-y-6" role="main" aria-labelledby="balance-title">
      <div className="space-y-4">
        <BalanceHeader balance={balanceData} className="mt-1 mb-5" />
      </div>
      <ActionList sections={getActionSections()} />
      {assetDetails.utxoBalances && assetDetails.utxoBalances.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-medium text-gray-900">UTXO Balances</h3>
          <div className="space-y-2">
            {assetDetails.utxoBalances.map((utxo, index) => (
              <div
                key={index}
                onClick={() => navigate(`${CONSTANTS.PATHS.UTXO}/${utxo.txid}`)}
                className="flex justify-between items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`View UTXO ${utxo.txid}`}
              >
                <span className="text-sm font-mono text-gray-500">{formatTxid(utxo.txid)}</span>
                <span className="text-sm text-gray-900">{utxo.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
