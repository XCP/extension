"use client";

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { Spinner } from "@/components/spinner";
import { BalanceHeader } from "@/components/headers/balance-header";
import { useHeader } from "@/contexts/header-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

/**
 * Interface for an actionable option for a balance.
 */
interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
  variant?: "default" | "success" | "destructive";
}

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
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * Generates a list of available actions based on the asset type and details.
   * @returns {Action[]} The list of actionable options for the balance.
   */
  const getActions = (): Action[] => {
    if (!asset || !assetDetails) return [];
    const isBTC = asset === "BTC";
    const isXCP = asset === "XCP";

    return isBTC
      ? [
          {
            id: "send",
            name: "Send",
            description: "Send bitcoin to another address",
            path: `${CONSTANTS.PATHS.COMPOSE}/send/BTC`,
          },
          {
            id: "btcpay",
            name: "BTCPay",
            description: "Pay for an order match with BTC",
            path: `${CONSTANTS.PATHS.COMPOSE}/btcpay`,
          },
          {
            id: "dispense",
            name: "Dispense",
            description: "Trigger an open asset dispenser",
            path: `${CONSTANTS.PATHS.COMPOSE}/dispenser/dispense`,
          },
          {
            id: "fairmint",
            name: "Fairmint",
            description: "Start a fair distribution mint",
            path: `${CONSTANTS.PATHS.COMPOSE}/fairmint/BTC`,
          },
        ]
      : isXCP
      ? [
          {
            id: "send",
            name: "Send",
            description: "Send this asset to another address",
            path: `${CONSTANTS.PATHS.COMPOSE}/send/${asset}`,
          },
          {
            id: "dispenser",
            name: "Dispenser",
            description: "Create a new dispenser for this asset",
            path: `${CONSTANTS.PATHS.COMPOSE}/dispenser/${asset}`,
          },
          {
            id: "order",
            name: "DEX Order",
            description: "Create a new order on the DEX",
            path: `${CONSTANTS.PATHS.COMPOSE}/order/${asset}`,
          },
          {
            id: "attach",
            name: "Attach",
            description: "Attach this asset to a Bitcoin UTXO",
            path: `${CONSTANTS.PATHS.COMPOSE}/utxo/attach/${asset}`,
            variant: "success",
          },
          {
            id: "destroy",
            name: "Destroy",
            description: "Permanently destroy token supply",
            path: `${CONSTANTS.PATHS.COMPOSE}/destroy/${asset}`,
            variant: "destructive",
          },
        ]
      : [
          {
            id: "send",
            name: "Send",
            description: "Send this asset to another address",
            path: `${CONSTANTS.PATHS.COMPOSE}/send/${asset}`,
          },
          {
            id: "dispenser",
            name: "Dispenser",
            description: "Create a new dispenser for this asset",
            path: `${CONSTANTS.PATHS.COMPOSE}/dispenser/${asset}`,
          },
          {
            id: "order",
            name: "DEX Order",
            description: "Create a new order on the DEX",
            path: `${CONSTANTS.PATHS.COMPOSE}/order/${asset}`,
          },
          {
            id: "attach",
            name: "Attach",
            description: "Attach this asset to a Bitcoin UTXO",
            path: `${CONSTANTS.PATHS.COMPOSE}/utxo/attach/${asset}`,
            variant: "success",
          },
          {
            id: "destroy",
            name: "Destroy",
            description: "Permanently destroy token supply",
            path: `${CONSTANTS.PATHS.COMPOSE}/destroy/${asset}`,
            variant: "destructive",
          },
        ];
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
      <div className="space-y-2">
        {getActions().map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(action.path)}
            className={`
              bg-white rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors
              ${action.variant === "success" ? "border border-green-200" : ""}
              ${action.variant === "destructive" ? "border border-red-200" : ""}
            `}
            role="button"
            tabIndex={0}
            aria-label={action.name}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3
                  className={`
                    text-sm font-medium
                    ${action.variant === "success" ? "text-green-600" : ""}
                    ${action.variant === "destructive" ? "text-red-600" : "text-gray-900"}
                  `}
                >
                  {action.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{action.description}</p>
              </div>
              <FaChevronRight className="text-gray-400 w-4 h-4" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
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
                <span className="text-sm font-mono text-gray-500">{utxo.txid}</span>
                <span className="text-sm text-gray-900">{utxo.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
