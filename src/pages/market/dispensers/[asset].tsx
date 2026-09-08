import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { AssetDispenserCard } from "@/components/domain/dispenser/asset-dispenser-card";
import { FiRefreshCw, TbRepeat } from "@/components/icons";
import { AssetDispenseCard } from "@/components/ui/cards/asset-dispense-card";
import { CopyableStat } from "@/components/ui/copyable-stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { TabButton } from "@/components/ui/tab-button";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import {
  type AssetInfo,
  type Dispense,
  type DispenserDetails,
  fetchAssetDetails,
  fetchAssetDispensers,
  fetchAssetDispenses,
} from "@/core/counterparty/api";
import { isFixedRateDispenser } from "@/core/counterparty/oraclePolicy";
import { formatAmount } from "@/core/format";
import { type BigNumber, divide, multiply, roundDown, toBigNumber, toNumber } from "@/core/numeric";
import { formatPrice, getNextPriceUnit, getRawPrice } from "@/core/priceFormat";
import type { PriceUnit } from "@/core/settings";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useInView } from "@/hooks/useInView";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";

import { t } from '@/i18n';

// Constants
const FETCH_LIMIT = 20;
const dispenserKey = (row: DispenserDetails) => row.tx_hash;
const SATS_PER_BTC = 100_000_000;
const DEBOUNCE_MS = 1000;
const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes

/**
 * Calculate effective sats per unit from dispenser data
 * satoshirate = total sats per dispense
 * give_quantity_normalized = units given per dispense
 */
function getSatsPerUnit(dispenser: DispenserDetails): BigNumber | null {
  const unitsPerDispense = toBigNumber(dispenser.give_quantity_normalized);
  // A dispenser giving nothing has no price per unit. Naming one would invent it.
  if (!unitsPerDispense.isGreaterThan(0)) return null;
  return divide(dispenser.satoshirate, unitsPerDispense);
}

/** Cheapest first. A dispenser with no price per unit has no place in the order, so it sorts last. */
function byPricePerUnit(a: DispenserDetails, b: DispenserDetails): number {
  const priceA = getSatsPerUnit(a);
  const priceB = getSatsPerUnit(b);
  if (priceA === null) return priceB === null ? 0 : 1;
  if (priceB === null) return -1;
  // comparedTo is null only if a value is NaN, which is a tie for ordering purposes.
  return priceA.comparedTo(priceB) ?? 0;
}

/**
 * AssetDispensers displays dispensers and dispense history for a specific asset.
 */
export default function AssetDispensersPage(): ReactElement {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);

  const fetchInfo = useCallback(async () => {
    const info = asset ? await fetchAssetDetails(asset) : null;
    return { result: info ? [info] : [], result_count: info ? 1 : 0 };
  }, [asset]);
  const fetchDispensers = useCallback((offset: number, limit: number) =>
    asset ? fetchAssetDispensers(asset, { limit, offset, status: "open" })
      : Promise.resolve({ result: [], result_count: 0 }), [asset]);
  const fetchDispenses = useCallback((offset: number, limit: number) =>
    asset ? fetchAssetDispenses(asset, { limit, offset })
      : Promise.resolve({ result: [], result_count: 0 }), [asset]);
  const infoPage = usePaginatedFetch<AssetInfo>({
    fetchFn: fetchInfo, pageSize: 1, maxItems: 1, enabled: !!asset,
  });
  const dispenserPage = usePaginatedFetch<DispenserDetails>({
    fetchFn: fetchDispensers, getKey: dispenserKey, pageSize: FETCH_LIMIT, maxItems: Infinity, enabled: !!asset,
  });
  const dispensePage = usePaginatedFetch<Dispense>({
    fetchFn: fetchDispenses, pageSize: FETCH_LIMIT, maxItems: Infinity, enabled: !!asset,
  });
  const assetInfo = infoPage.data[0] ?? null;
  const dispensers = useMemo(
    () => dispenserPage.data.filter(isFixedRateDispenser).sort(byPricePerUnit),
    [dispenserPage.data],
  );
  const dispenses = dispensePage.data;
  const loading = infoPage.isLoading || dispenserPage.isLoading || dispensePage.isLoading;
  const isRefreshing = loading;

  // UI state - initialize from settings
  const [tab, setTab] = useState<"open" | "history">("open");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(settings.priceUnit);

  // Clipboard
  const { copy, isCopied } = useCopyToClipboard();

  // Infinite scroll refs
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // Debounce timer ref for saving preference
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last refresh time to prevent spam
  const lastRefreshRef = useRef<number>(0);

  // Price unit toggle handler with debounced save
  const togglePriceUnit = useCallback(() => {
    const nextUnit = getNextPriceUnit(priceUnit, btcPrice !== null);
    setPriceUnit(nextUnit);

    // Debounce saving to settings
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      // A call, not a bare `console.error` reference: the production build drops console calls
      // (wxt.config dropConsole) but cannot strip a reference, so the reference shipped.
      updateSettings({ priceUnit: nextUnit }).catch((error) => {
        console.error('Failed to save price unit:', error);
      });
    }, DEBOUNCE_MS);
  }, [priceUnit, btcPrice, updateSettings]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const { refresh: refreshInfo } = infoPage;
  const { refresh: refreshDispensers } = dispenserPage;
  const { refresh: refreshDispenses } = dispensePage;
  const loadData = useCallback(() => {
    refreshInfo();
    refreshDispensers();
    refreshDispenses();
  }, [refreshInfo, refreshDispensers, refreshDispenses]);

  // Refresh handler with cooldown to prevent spam
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) {
      return; // Still in cooldown
    }
    lastRefreshRef.current = now;
    loadData();
  }, [loadData]);

  // Configure header with refresh button
  useEffect(() => {
    setHeaderProps({
      title: t('common_dispensers'),
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: t('dispensers_asset_refresh_dispensers'),
        icon: <FiRefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />,
        onClick: handleRefresh,
        disabled: isRefreshing,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isRefreshing, handleRefresh]);

  const activePage = tab === "open" ? dispenserPage : dispensePage;
  useEffect(() => {
    // An oracle-only page cannot establish that no fixed-rate listing exists.
    const needsVisibleListing = tab === "open" && dispensers.length === 0;
    if (!loading && !infoPage.error && (inView || needsVisibleListing)
      && activePage.hasMore && !activePage.error) {
      activePage.loadMore();
    }
  }, [loading, infoPage.error, inView, tab, dispensers.length, activePage]);

  // Calculate stats for open dispensers (updates as more load)
  const dispenserStats = useMemo(() => {
    if (dispensers.length === 0) return null;

    // Total asset remaining across all dispensers
    const totalAsset = dispensers.reduce(
      (sum, d) => sum.plus(toBigNumber(d.give_remaining_normalized)), toBigNumber(0)
    );

    // Total BTC required to buy all remaining assets (sum of satoshirate * remaining dispenses)
    const totalBtcSats = dispensers.reduce((sum, d) => {
      const perDispense = toBigNumber(d.give_quantity_normalized);
      if (!perDispense.isGreaterThan(0)) return sum;
      const remainingDispenses = roundDown(divide(d.give_remaining_normalized, perDispense));
      return sum.plus(multiply(d.satoshirate, remainingDispenses));
    }, toBigNumber(0));
    const totalBtc = divide(totalBtcSats, SATS_PER_BTC);

    // Floor price per unit in sats. Dispensers with no price per unit are not a floor of zero.
    const perUnitPrices = dispensers
      .map(getSatsPerUnit)
      .filter((price): price is BigNumber => price !== null);
    const floorPrice = perUnitPrices.length > 0
      ? perUnitPrices.reduce((lowest, price) => (price.isLessThan(lowest) ? price : lowest))
      : null;

    // Weighted average price per unit by remaining quantity
    const weightedSum = dispensers.reduce((sum, d) => {
      const price = getSatsPerUnit(d);
      return price === null ? sum : sum.plus(multiply(price, d.give_remaining_normalized));
    }, toBigNumber(0));
    const weightedAvg = totalAsset.isGreaterThan(0) ? divide(weightedSum, totalAsset) : null;

    return {
      totalAsset,
      totalBtc,
      floorPrice: floorPrice === null ? null : toNumber(roundDown(floorPrice)),
      weightedAvg: weightedAvg === null ? null : Number(weightedAvg.toFixed(0)),
    };
  }, [dispensers]);

  // Calculate stats for dispenses (updates as more load)
  const dispenseStats = useMemo(() => {
    if (dispenses.length === 0) return null;

    // Last dispense price (first in array = most recent)
    const lastDispense = dispenses[0]!;
    const lastQuantity = toBigNumber(lastDispense.dispense_quantity_normalized);
    const lastPricePerUnit = lastQuantity.isGreaterThan(0)
      ? divide(lastDispense.btc_amount, lastQuantity)
      : null;

    // Average price per unit across all loaded dispenses (weighted by quantity)
    const totalAsset = dispenses.reduce(
      (sum, d) => sum.plus(toBigNumber(d.dispense_quantity_normalized)), toBigNumber(0)
    );
    const totalBtcSats = dispenses.reduce(
      (sum, d) => sum.plus(toBigNumber(d.btc_amount)), toBigNumber(0)
    );
    const totalBtc = divide(totalBtcSats, SATS_PER_BTC);
    const avgPricePerUnit = totalAsset.isGreaterThan(0)
      ? divide(totalBtcSats, totalAsset)
      : null;

    return {
      lastPrice: lastPricePerUnit === null ? null : toNumber(roundDown(lastPricePerUnit)),
      avgPrice: avgPricePerUnit === null ? null : toNumber(roundDown(avgPricePerUnit)),
      totalAsset,
      totalBtc,
    };
  }, [dispenses]);

  const handleDispenserClick = (dispenser: DispenserDetails) => {
    navigate(`/compose/dispenser/dispense?address=${dispenser.source}&asset=${dispenser.asset}`);
  };

  if (loading) {
    return <Spinner message={t('dispensers_asset_loading_dispensers', [String(asset)])} />;
  }

  const hasMore = activePage.hasMore;
  const isFetching = activePage.isFetchingMore;
  const pageError = infoPage.error ?? activePage.error;

  /** A dispenser giving nothing has no price to show, rather than a price of zero. */
  const pricePerUnitLabel = (dispenser: DispenserDetails): string => {
    const price = getSatsPerUnit(dispenser);
    return price === null
      ? "N/A"
      : formatPrice(toNumber(roundDown(price)), priceUnit, btcPrice, settings.fiat);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-grow min-h-0">
        {/* Fixed Header */}
        <div className="p-4 pb-0 flex-shrink-0">
          {/* Asset Header */}
          {assetInfo && (
            <AssetHeader assetInfo={assetInfo} showInfoPopover className="mt-1 mb-5" />
          )}

          {/* Stats Card - contextual based on tab */}
          <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
                {tab === "open" && dispenserStats && dispenserStats.floorPrice !== null
                  && dispenserStats.weightedAvg !== null && (
                  <>
                    <CopyableStat
                      label={t('dispensers_asset_floor')}
                      value={formatPrice(dispenserStats.floorPrice, priceUnit, btcPrice, settings.fiat)}
                      rawValue={getRawPrice(dispenserStats.floorPrice, priceUnit, btcPrice, settings.fiat)}
                      onCopy={copy}
                      isCopied={isCopied(getRawPrice(dispenserStats.floorPrice, priceUnit, btcPrice, settings.fiat))}
                    />
                    <CopyableStat
                      label={t('common_avg')}
                      value={formatPrice(dispenserStats.weightedAvg, priceUnit, btcPrice, settings.fiat)}
                      rawValue={getRawPrice(dispenserStats.weightedAvg, priceUnit, btcPrice, settings.fiat)}
                      onCopy={copy}
                      isCopied={isCopied(getRawPrice(dispenserStats.weightedAvg, priceUnit, btcPrice, settings.fiat))}
                    />
                  </>
                )}
                {tab === "open" && !dispenserStats && (
                  <>
                    <div>
                      <span className="text-gray-500">{t('dispensers_asset_floor')}</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                    <div>
                      <span className="text-gray-500">{t('common_avg')}</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                  </>
                )}
                {tab === "history" && dispenseStats && dispenseStats.lastPrice !== null
                  && dispenseStats.avgPrice !== null && (
                  <>
                    <CopyableStat
                      label={t('common_last')}
                      value={formatPrice(dispenseStats.lastPrice, priceUnit, btcPrice, settings.fiat)}
                      rawValue={getRawPrice(dispenseStats.lastPrice, priceUnit, btcPrice, settings.fiat)}
                      onCopy={copy}
                      isCopied={isCopied(getRawPrice(dispenseStats.lastPrice, priceUnit, btcPrice, settings.fiat))}
                    />
                    <CopyableStat
                      label={t('common_avg')}
                      value={formatPrice(dispenseStats.avgPrice, priceUnit, btcPrice, settings.fiat)}
                      rawValue={getRawPrice(dispenseStats.avgPrice, priceUnit, btcPrice, settings.fiat)}
                      onCopy={copy}
                      isCopied={isCopied(getRawPrice(dispenseStats.avgPrice, priceUnit, btcPrice, settings.fiat))}
                    />
                  </>
                )}
                {tab === "history" && !dispenseStats && (
                  <>
                    <div>
                      <span className="text-gray-500">{t('common_last')}</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                    <div>
                      <span className="text-gray-500">{t('common_avg')}</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                  </>
                )}
              </div>
              <button type="button"
                onClick={togglePriceUnit}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                aria-label={t('dispensers_asset_switch_price_display_to', [String(getNextPriceUnit(priceUnit, btcPrice !== null).toUpperCase())])}
              >
                <TbRepeat className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Section Header with Tabs */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              <TabButton isActive={tab === "open"} onClick={() => setTab("open")}>
                {t('common_open')}
              </TabButton>
              <TabButton isActive={tab === "history"} onClick={() => setTab("history")}>
                {t('common_history')}
              </TabButton>
            </div>
            <button type="button"
              onClick={() => navigate(`/market?tab=dispensers&mode=manage&search=${asset}`)}
              className="text-xs text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded cursor-pointer"
            >
              {t('dispensers_asset_my_dispensers')}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4">
          {tab === "open" && (
            dispensers.length > 0 ? (
              <div className="space-y-2">
                {dispensers.map((d) => (
                  <AssetDispenserCard
                    key={d.tx_hash}
                    dispenser={d}
                    formattedPrice={pricePerUnitLabel(d)}
                    onClick={() => handleDispenserClick(d)}
                    onCopyAddress={copy}
                    isCopied={isCopied(d.source)}
                  />
                ))}
              </div>
            ) : !pageError && !hasMore && (
              <EmptyState
                message={t('dispensers_asset_no_open_dispensers_found', [String(asset)])}
                linkAction={{
                  label: t('common_create_new_dispenser'),
                  onClick: () => navigate(`/compose/dispenser/${asset}`),
                }}
              />
            )
          )}

          {tab === "history" && (
            dispenses.length > 0 ? (
              <div className="space-y-2">
                {dispenses.map((d, index) => {
                  const quantity = toBigNumber(d.dispense_quantity_normalized);
                  // A dispense of nothing has no price per unit; zero would read as free.
                  const pricePerUnit = quantity.isGreaterThan(0)
                    ? divide(d.btc_amount, quantity)
                    : null;
                  return (
                    <AssetDispenseCard
                      key={`${d.tx_hash}:${index}`}
                      dispense={d}
                      asset={asset || ""}
                      formattedPricePerUnit={pricePerUnit === null
                        ? "N/A"
                        : formatPrice(toNumber(roundDown(pricePerUnit)), priceUnit, btcPrice, settings.fiat)}
                      onCopyTx={copy}
                      isCopied={isCopied(d.tx_hash)}
                    />
                  );
                })}
              </div>
            ) : !pageError && (
              <EmptyState message={t('dispensers_asset_no_recent_dispenses', [String(asset)])} />
            )
          )}

          {pageError && (
            <div role="alert" className="py-3 text-center text-sm text-gray-600">
              <p>{pageError.message}</p>
              <button type="button"
                onClick={infoPage.error ? loadData : activePage.refresh}
                className="mt-2 rounded px-3 py-1 text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {t('common_retry')}
              </button>
            </div>
          )}

          {/* Load more sentinel */}
          <div ref={loadMoreRef} className="py-2">
            {hasMore && !pageError ? (
              isFetching ? (
                <div className="flex justify-center">
                  <Spinner className="py-4" />
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center">{t('common_scroll_to_load_more')}</div>
              )
            ) : null}
          </div>

          {/* Footer summary - contextual totals */}
          {tab === "open" && dispenserStats && dispensers.length > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-2">
              <span>
                {formatAmount({ value: dispenserStats.totalBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
              </span>
              <span>
                for {formatAmount({ value: dispenserStats.totalAsset, maximumFractionDigits: 0 })} {asset}
              </span>
            </div>
          )}
          {tab === "history" && dispenseStats && dispenses.length > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-2">
              <span>
                {formatAmount({ value: dispenseStats.totalBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
              </span>
              <span>
                for {formatAmount({ value: dispenseStats.totalAsset, maximumFractionDigits: 0 })} {asset}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
