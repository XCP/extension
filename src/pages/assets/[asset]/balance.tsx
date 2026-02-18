import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { BalanceHeader } from "@/components/ui/headers/balance-header";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";

import type { TokenBalance } from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";
import type { ActionSection } from "@/components/ui/lists/action-list";


/**
 * Constants for navigation paths.
 */
const PATHS = {
  COMPOSE: "/compose",
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
export default function AssetBalancePage(): ReactElement {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps, getCachedBalance } = useHeader();
  const { data: assetDetails, isLoading, error } = useAssetDetails(asset || "");

  // Get cached data for instant display
  const cachedBalance = useMemo(() => getCachedBalance(asset || ""), [getCachedBalance, asset]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Balance",
      onBack: () => navigate("/"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * Generates a list of available actions based on the asset type.
   * Actions are determined by asset name (BTC, XCP, other) - no API data needed.
   * @returns {ActionSection[]} The list of actionable options for the balance.
   */
  const getActionSections = (): ActionSection[] => {
    if (!asset) return [];
    const isBTC = asset === "BTC";
    const isXCP = asset === "XCP";

    const items = isBTC
      ? [
          {
            id: "send",
            title: "Send",
            description: "Send bitcoin to another address",
            onClick: () => navigate(`${PATHS.COMPOSE}/send/BTC`),
          },
          {
            id: "order",
            title: "DEX Order",
            description: "Create a new order on the DEX",
            onClick: () => navigate(`${PATHS.COMPOSE}/order/BTC`),
          },
          {
            id: "dispense",
            title: "Dispense",
            description: "Trigger an open asset dispenser",
            onClick: () => navigate(`${PATHS.COMPOSE}/dispenser/dispense`),
          },
          {
            id: "fairmint",
            title: "Fairmint",
            description: "Trigger an open asset fairminter",
            onClick: () => navigate(`${PATHS.COMPOSE}/fairmint/BTC`),
          },
          {
            id: "btcpay",
            title: "BTCPay",
            description: "Pay for an order match with BTC",
            onClick: () => navigate(`${PATHS.COMPOSE}/order/btcpay`),
          },
        ]
      : isXCP
      ? [
          {
            id: "send",
            title: "Send",
            description: "Send this asset to another address",
            onClick: () => navigate(`${PATHS.COMPOSE}/send/${asset}`),
          },
          {
            id: "order",
            title: "DEX Order",
            description: "Create a new order on the DEX",
            onClick: () => navigate(`${PATHS.COMPOSE}/order/${asset}`),
          },
          {
            id: "dispenser",
            title: "Dispenser",
            description: "Create a new dispenser for this asset",
            onClick: () => navigate(`${PATHS.COMPOSE}/dispenser/${asset}`),
          },
          {
            id: "fairmint",
            title: "Fairmint",
            description: "Trigger an open asset fairminter",
            onClick: () => navigate(`${PATHS.COMPOSE}/fairmint/XCP`),
          },
          {
            id: "attach",
            title: "Attach",
            description: "Attach this asset to a Bitcoin UTXO",
            onClick: () => navigate(`${PATHS.COMPOSE}/utxo/attach/${asset}`),
            className: "!border !border-green-500",
          },
          {
            id: "destroy",
            title: "Destroy",
            description: "Permanently destroy token supply",
            onClick: () => navigate(`${PATHS.COMPOSE}/issuance/destroy/${asset}`),
            className: "!border !border-red-500",
          },
        ]
      : [
          {
            id: "send",
            title: "Send",
            description: "Send this asset to another address",
            onClick: () => navigate(`${PATHS.COMPOSE}/send/${asset}`),
          },
          {
            id: "order",
            title: "DEX Order",
            description: "Create a new order on the DEX",
            onClick: () => navigate(`${PATHS.COMPOSE}/order/${asset}`),
          },
          {
            id: "dispenser",
            title: "Dispenser",
            description: "Create a new dispenser for this asset",
            onClick: () => navigate(`${PATHS.COMPOSE}/dispenser/${asset}`),
          },
          {
            id: "attach",
            title: "Attach",
            description: "Attach this asset to a Bitcoin UTXO",
            onClick: () => navigate(`${PATHS.COMPOSE}/utxo/attach/${asset}`),
            className: "!border !border-green-500",
          },
          {
            id: "destroy",
            title: "Destroy",
            description: "Permanently destroy token supply",
            onClick: () => navigate(`${PATHS.COMPOSE}/issuance/destroy/${asset}`),
            className: "!border !border-red-500",
          },
        ];
    return [{ items }];
  };

  // Build balance data from fresh data or cache
  const balanceData = useMemo((): TokenBalance | null => {
    // Prefer fresh data if available
    if (assetDetails) {
      const info = assetDetails.assetInfo;
      return {
        asset: asset || "",
        asset_info: {
          asset_longname: info?.asset_longname ?? null,
          description: info?.description ?? "",
          issuer: info?.issuer ?? "",
          divisible: info?.divisible ?? assetDetails.isDivisible,
          locked: info?.locked ?? false,
          supply: info?.supply,
        },
        quantity_normalized: assetDetails.availableBalance || "0",
      };
    }
    // Fall back to cached data for instant display
    if (cachedBalance) {
      return cachedBalance;
    }
    return null;
  }, [asset, assetDetails, cachedBalance]);

  // Show spinner only if no cached data and still loading
  if (isLoading && !balanceData) {
    return <Spinner message="Loading balance details…" />;
  }

  // Show error only if no data available at all
  if ((error || !assetDetails) && !balanceData) {
    return <div className="p-4 text-center text-gray-600">Failed to load balance information</div>;
  }

  // At this point we have either fresh data or cached data
  if (!balanceData) {
    return <div className="p-4 text-center text-gray-600">Failed to load balance information</div>;
  }

  return (
    <div className="p-4 space-y-6" role="main" aria-labelledby="balance-title">
      <div className="space-y-4">
        <BalanceHeader balance={balanceData} className="mt-1 mb-5" />
      </div>
      <ActionList sections={getActionSections()} />
    </div>
  );
}
