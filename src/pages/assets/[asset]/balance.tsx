import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { BalanceHeader } from "@/components/domain/balance/balance-header";
import type { ActionSection } from "@/components/ui/lists/action-list";
import { ActionList } from "@/components/ui/lists/action-list";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import type { TokenBalance } from "@/core/counterparty/api";
import { getPoolDisplayPair } from "@/core/counterparty/pool";
import { asDisplayUnits, divide, formatDecimal, isGreaterThan, multiply, toBigNumber } from '@/core/numeric';
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";


import { t } from '@/i18n';

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
  const { data: lpPool } = useLpAssetPool(asset);

  // Get cached data for instant display
  const cachedBalance = useMemo(() => getCachedBalance(asset || ""), [getCachedBalance, asset]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('asset_balance_balance'),
      onBack: () => navigate("/"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * Generates a list of available actions based on the asset type.
   */
  const getActionSections = (): ActionSection[] => {
    if (!asset) return [];
    const isBTC = asset === "BTC";
    const isXCP = asset === "XCP";
    const encodedAsset = encodeURIComponent(asset);

    const sendAction = {
      id: "send",
      title: t('common_send'),
      description: isBTC ? t('asset_balance_send_bitcoin_to_another_address') : t('asset_balance_send_this_asset_to_another'),
      onClick: () => navigate(`${PATHS.COMPOSE}/send/${encodedAsset}`),
    };

    const swapAction = {
      id: "swap",
      title: t('common_swap'),
      description: t('asset_balance_create_a_new_order_on'),
      onClick: () => navigate(`${PATHS.COMPOSE}/order/${encodedAsset}`),
    };

    const mintAction = {
      id: "mint",
      title: t('common_mint'),
      description: t('asset_balance_trigger_an_open_asset_fairminter'),
      onClick: () => navigate(`${PATHS.COMPOSE}/fairmint/${encodedAsset}`),
    };

    const sellAction = {
      id: "sell",
      title: t('common_sell'),
      description: t('asset_balance_create_a_new_dispenser_for'),
      onClick: () => navigate(`${PATHS.COMPOSE}/dispenser/${encodedAsset}`),
    };

    // Destroy burns the asset irreversibly; BTC is not a Counterparty asset, so it has none.
    const destroyAction = {
      id: "destroy",
      title: t('common_destroy'),
      description: t('asset_balance_permanently_burn_this_asset'),
      onClick: () => navigate(`${PATHS.COMPOSE}/issuance/destroy/${encodedAsset}`),
      className: "!border !border-red-500",
    };

    const items = isBTC
      ? [
          sendAction,
          swapAction,
          mintAction,
          {
            id: "dispense",
            title: t('common_dispense'),
            description: t('asset_balance_trigger_an_open_asset_dispenser'),
            onClick: () => navigate(`${PATHS.COMPOSE}/dispenser/dispense`),
          },
          {
            id: "btcpay",
            title: t('asset_balance_btc_pay'),
            description: t('asset_balance_pay_for_an_order_match'),
            onClick: () => navigate(`${PATHS.COMPOSE}/order/btcpay`),
          },
        ]
      : isXCP
      ? [sendAction, sellAction, swapAction, mintAction, destroyAction]
      : [sendAction, sellAction, swapAction, destroyAction];
    if (lpPool) {
      return [
        {
          items: [
            {
              id: "manage-pool",
              title: t('asset_balance_manage_pool'),
              description: `${lpPool.asset_a} / ${lpPool.asset_b}`,
              onClick: () => navigate(`/pools/${encodeURIComponent(lpPool.lp_asset)}`),
            },
            ...items,
          ],
        },
      ];
    }
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
        // Spendable, not confirmed: the number a balance page answers for is "what can I do with
        // this right now", and the pending line beside it carries the in-flight remainder.
        quantity_normalized: asDisplayUnits(assetDetails.spendableBalance ?? assetDetails.availableBalance ?? "0"),
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
    return <Spinner message={t('asset_balance_loading_balance_details')} />;
  }

  // Show error only if no data available at all
  if ((error || !assetDetails) && !balanceData) {
    return <div className="p-4 text-center text-gray-600">{t('asset_balance_failed_to_load_balance_information')}</div>;
  }

  // At this point we have either fresh data or cached data
  if (!balanceData) {
    return <div className="p-4 text-center text-gray-600">{t('asset_balance_failed_to_load_balance_information')}</div>;
  }

  // Pool position details for LP asset balances, in the UTXO-details card style.
  const poolDetails = (() => {
    if (!lpPool) return null;
    const lpBalance = toBigNumber(lpPool.quantity_normalized ?? 0);
    const lpSupply = toBigNumber(assetDetails?.assetInfo?.supply_normalized);
    const poolShare = isGreaterThan(lpSupply, 0) && isGreaterThan(lpBalance, 0)
      ? divide(lpBalance, lpSupply)
      : null;
    return {
      pair: getPoolDisplayPair(lpPool.asset_a, lpPool.asset_b),
      sharePercent: poolShare ? formatDecimal(multiply(poolShare, 100), 4) : null,
      underlying: poolShare
        ? [
            { asset: lpPool.asset_a, amount: formatDecimal(multiply(poolShare, toBigNumber(lpPool.reserve_a_normalized ?? lpPool.reserve_a))) },
            { asset: lpPool.asset_b, amount: formatDecimal(multiply(poolShare, toBigNumber(lpPool.reserve_b_normalized ?? lpPool.reserve_b))) },
          ]
        : null,
    };
  })();

  return (
    <section className="p-4 space-y-6" aria-labelledby="balance-title">
      <BalanceHeader balance={balanceData} className="mt-1 mb-5" pendingIncoming={assetDetails?.pendingIncoming} />
      {poolDetails && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-900">{t('asset_balance_pool_position')}</h2>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t('common_pool')}</span>
              <span className="text-sm text-gray-900">{poolDetails.pair}</span>
            </div>
            {poolDetails.sharePercent && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('asset_balance_pool_share')}</span>
                <span className="text-sm text-gray-900">{poolDetails.sharePercent}%</span>
              </div>
            )}
          </div>
          {poolDetails.underlying && (
            <>
              <hr className="my-4 border-gray-200" />
              <h2 className="text-sm font-medium text-gray-900">{t('common_underlying')}</h2>
              <div className="mt-2 space-y-2">
                {poolDetails.underlying.map(({ asset: underlyingAsset, amount }) => (
                  <div key={underlyingAsset} className="flex justify-between">
                    <span className="text-sm text-gray-500">{underlyingAsset}</span>
                    <span className="text-sm text-gray-900">{amount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <ActionList sections={getActionSections()} />
    </section>
  );
}
