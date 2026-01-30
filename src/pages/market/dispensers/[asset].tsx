import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TbRepeat, FiRefreshCw, FaCheck } from "@/components/icons";
import { AssetInfoPopover } from "@/components/domain/asset/asset-info-popover";
import { Spinner } from "@/components/ui/spinner";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { AssetDispenserCard } from "@/components/ui/cards/asset-dispenser-card";
import { AssetDispenseCard } from "@/components/ui/cards/asset-dispense-card";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useInView } from "@/hooks/useInView";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatAmount } from "@/utils/format";
import type { PriceUnit } from "@/utils/settings";
import { CURRENCY_INFO, type FiatCurrency } from "@/utils/blockchain/bitcoin/price";
import {
  fetchAssetDispensers,
  fetchAssetDispenses,
  fetchAssetDetails,
  type DispenserDetails,
  type Dispense,
  type AssetInfo,
} from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";

// Constants
const FETCH_LIMIT = 20;
const SATS_PER_BTC = 100_000_000;
const DEBOUNCE_MS = 1000;
const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes

/**
 * Format price based on selected unit
 */
function formatPrice(sats: number, unit: PriceUnit, btcPrice: number | null, currency: FiatCurrency): string {
  switch (unit) {
    case "sats":
      return `${formatAmount({ value: sats, maximumFractionDigits: 0 })} sats`;
    case "btc":
      const btc = sats / SATS_PER_BTC;
      return `${formatAmount({ value: btc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`;
    case "fiat":
      if (!btcPrice) return "—";
      const fiatValue = (sats / SATS_PER_BTC) * btcPrice;
      const { symbol, decimals } = CURRENCY_INFO[currency];
      return `${symbol}${formatAmount({ value: fiatValue, maximumFractionDigits: decimals })}`;
  }
}

/**
 * Get raw numeric price value (without symbol) for clipboard
 */
function getRawPrice(sats: number, unit: PriceUnit, btcPrice: number | null, currency: FiatCurrency): string {
  switch (unit) {
    case "sats":
      return formatAmount({ value: sats, maximumFractionDigits: 0 });
    case "btc":
      return formatAmount({ value: sats / SATS_PER_BTC, minimumFractionDigits: 8, maximumFractionDigits: 8 });
    case "fiat":
      if (!btcPrice) return "";
      const decimals = CURRENCY_INFO[currency].decimals;
      return formatAmount({ value: (sats / SATS_PER_BTC) * btcPrice, maximumFractionDigits: decimals });
  }
}

/**
 * Get next price unit in cycle: BTC → SATS → FIAT → BTC
 */
function getNextUnit(current: PriceUnit, hasFiat: boolean): PriceUnit {
  if (current === "btc") return "sats";
  if (current === "sats") return hasFiat ? "fiat" : "btc";
  return "btc";
}

/**
 * Copyable stat display with highlight feedback
 */
function CopyableStat({
  label,
  value,
  rawValue,
  onCopy,
  isCopied,
}: {
  label: string;
  value: string;
  rawValue: string;
  onCopy: (value: string) => void;
  isCopied: boolean;
}): ReactElement {
  return (
    <div>
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <div
          onClick={() => onCopy(rawValue)}
          className={`font-medium text-gray-900 truncate cursor-pointer rounded px-1 -mx-1 ${isCopied ? "bg-gray-200" : ""}`}
        >
          <span>{value}</span>
        </div>
        {isCopied && <FaCheck className="size-3 text-green-500 flex-shrink-0" aria-hidden="true" />}
      </div>
    </div>
  );
}

/**
 * Calculate effective sats per unit from dispenser data
 * satoshirate = total sats per dispense
 * give_quantity_normalized = units given per dispense
 */
function getSatsPerUnit(dispenser: DispenserDetails): number {
  const unitsPerDispense = Number(dispenser.give_quantity_normalized);
  if (unitsPerDispense <= 0) return Infinity;
  return dispenser.satoshirate / unitsPerDispense;
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

  // Data state
  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [dispensers, setDispensers] = useState<DispenserDetails[]>([]);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state for dispensers
  const [dispenserOffset, setDispenserOffset] = useState(0);
  const [hasMoreDispensers, setHasMoreDispensers] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Pagination state for dispenses
  const [dispenseOffset, setDispenseOffset] = useState(0);
  const [hasMoreDispenses, setHasMoreDispenses] = useState(true);
  const [isFetchingMoreDispenses, setIsFetchingMoreDispenses] = useState(false);

  // UI state - initialize from settings
  const [tab, setTab] = useState<"open" | "dispensed">("open");
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
    const nextUnit = getNextUnit(priceUnit, btcPrice !== null);
    setPriceUnit(nextUnit);

    // Debounce saving to settings
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      updateSettings({ priceUnit: nextUnit }).catch(console.error);
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

  // Load data function (used for initial load and refresh)
  const loadData = useCallback(async (isRefresh = false) => {
    if (!asset) return;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setDispensers([]);
    setDispenses([]);
    setDispenserOffset(0);
    setDispenseOffset(0);
    setHasMoreDispensers(true);
    setHasMoreDispenses(true);

    try {
      const [infoRes, dispensersRes, dispensesRes] = await Promise.all([
        fetchAssetDetails(asset),
        fetchAssetDispensers(asset, { limit: FETCH_LIMIT, status: "open" }),
        fetchAssetDispenses(asset, { limit: FETCH_LIMIT }),
      ]);
      if (infoRes) setAssetInfo(infoRes);

      // Sort by price (lowest first) for better UX
      const sortedDispensers = [...dispensersRes.result].sort(
        (a, b) => getSatsPerUnit(a) - getSatsPerUnit(b)
      );
      setDispensers(sortedDispensers);
      setDispenserOffset(FETCH_LIMIT);
      if (dispensersRes.result.length < FETCH_LIMIT) {
        setHasMoreDispensers(false);
      }

      setDispenses(dispensesRes.result);
      setDispenseOffset(FETCH_LIMIT);
      if (dispensesRes.result.length < FETCH_LIMIT) {
        setHasMoreDispenses(false);
      }
    } catch (err) {
      console.error('Failed to load dispensers:', { asset }, err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [asset]);

  // Refresh handler with cooldown to prevent spam
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) {
      return; // Still in cooldown
    }
    lastRefreshRef.current = now;
    loadData(true);
  }, [loadData]);

  // Configure header with refresh button
  useEffect(() => {
    setHeaderProps({
      title: "Dispensers",
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: "Refresh dispensers",
        icon: <FiRefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />,
        onClick: handleRefresh,
        disabled: isRefreshing,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isRefreshing, handleRefresh]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load more dispensers on scroll (when on "open" tab)
  useEffect(() => {
    if (!asset || !inView || isFetchingMore || !hasMoreDispensers || tab !== "open") {
      return;
    }

    const loadMore = async () => {
      setIsFetchingMore(true);
      try {
        const res = await fetchAssetDispensers(asset, {
          limit: FETCH_LIMIT,
          offset: dispenserOffset,
          status: "open",
        });

        if (res.result.length < FETCH_LIMIT) {
          setHasMoreDispensers(false);
        }

        if (res.result.length > 0) {
          setDispensers((prev) => {
            // Append, dedupe, and re-sort by price
            const merged = [...prev, ...res.result];
            const deduped = merged.filter(
              (d, i, arr) => arr.findIndex((x) => x.tx_hash === d.tx_hash) === i
            );
            return deduped.sort((a, b) => getSatsPerUnit(a) - getSatsPerUnit(b));
          });
          setDispenserOffset((prev) => prev + FETCH_LIMIT);
        }
      } catch (err) {
        console.error("Failed to load more dispensers:", err);
        setHasMoreDispensers(false);
      } finally {
        setIsFetchingMore(false);
      }
    };

    loadMore();
  }, [asset, inView, isFetchingMore, hasMoreDispensers, dispenserOffset, tab]);

  // Load more dispenses on scroll (when on "dispensed" tab)
  useEffect(() => {
    if (!asset || !inView || isFetchingMoreDispenses || !hasMoreDispenses || tab !== "dispensed") {
      return;
    }

    const loadMore = async () => {
      setIsFetchingMoreDispenses(true);
      try {
        const res = await fetchAssetDispenses(asset, {
          limit: FETCH_LIMIT,
          offset: dispenseOffset,
        });

        if (res.result.length < FETCH_LIMIT) {
          setHasMoreDispenses(false);
        }

        if (res.result.length > 0) {
          setDispenses((prev) => {
            const merged = [...prev, ...res.result];
            // Dedupe by tx_hash
            return merged.filter(
              (d, i, arr) => arr.findIndex((x) => x.tx_hash === d.tx_hash) === i
            );
          });
          setDispenseOffset((prev) => prev + FETCH_LIMIT);
        }
      } catch (err) {
        console.error("Failed to load more dispenses:", err);
        setHasMoreDispenses(false);
      } finally {
        setIsFetchingMoreDispenses(false);
      }
    };

    loadMore();
  }, [asset, inView, isFetchingMoreDispenses, hasMoreDispenses, dispenseOffset, tab]);

  // Calculate stats for open dispensers (updates as more load)
  const dispenserStats = useMemo(() => {
    if (dispensers.length === 0) return null;

    // Total asset remaining across all dispensers
    const totalAsset = dispensers.reduce(
      (sum, d) => sum + Number(d.give_remaining_normalized), 0
    );

    // Total BTC required to buy all remaining assets (sum of satoshirate * remaining dispenses)
    const totalBtcSats = dispensers.reduce((sum, d) => {
      const remainingDispenses = Math.floor(
        Number(d.give_remaining_normalized) / Number(d.give_quantity_normalized)
      );
      return sum + d.satoshirate * remainingDispenses;
    }, 0);
    const totalBtc = totalBtcSats / SATS_PER_BTC;

    // Floor price per unit in sats (find minimum)
    const floorPrice = Math.min(...dispensers.map(d => getSatsPerUnit(d)));

    // Weighted average price per unit by remaining quantity
    const weightedSum = dispensers.reduce(
      (sum, d) => sum + getSatsPerUnit(d) * Number(d.give_remaining_normalized), 0
    );
    const weightedAvg = totalAsset > 0 ? weightedSum / totalAsset : 0;

    return {
      totalAsset,
      totalBtc,
      floorPrice: Math.round(floorPrice),
      weightedAvg: Math.round(weightedAvg),
    };
  }, [dispensers]);

  // Calculate stats for dispenses (updates as more load)
  const dispenseStats = useMemo(() => {
    if (dispenses.length === 0) return null;

    // Last dispense price (first in array = most recent)
    const lastDispense = dispenses[0];
    const lastQuantity = Number(lastDispense.dispense_quantity_normalized);
    const lastPricePerUnit = lastQuantity > 0 ? lastDispense.btc_amount / lastQuantity : 0;

    // Average price per unit across all loaded dispenses (weighted by quantity)
    const totalAsset = dispenses.reduce(
      (sum, d) => sum + Number(d.dispense_quantity_normalized), 0
    );
    const totalBtcSats = dispenses.reduce(
      (sum, d) => sum + d.btc_amount, 0
    );
    const totalBtc = totalBtcSats / SATS_PER_BTC;
    const avgPricePerUnit = totalAsset > 0 ? totalBtcSats / totalAsset : 0;

    return {
      lastPrice: Math.round(lastPricePerUnit),
      avgPrice: Math.round(avgPricePerUnit),
      totalAsset,
      totalBtc,
    };
  }, [dispenses]);

  const handleDispenserClick = (dispenser: DispenserDetails) => {
    navigate(`/compose/dispenser/dispense?address=${dispenser.source}`);
  };

  if (loading) {
    return <Spinner message={`Loading ${asset} dispensers…`} />;
  }

  const hasMore = tab === "open" ? hasMoreDispensers : hasMoreDispenses;
  const isFetching = tab === "open" ? isFetchingMore : isFetchingMoreDispenses;

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        {/* Asset Header - matches BalanceHeader style */}
        <div className="flex items-center mb-4">
          <AssetIcon asset={asset || ""} size="lg" className="mr-4" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold break-all">
              {assetInfo?.asset_longname || asset}
            </h2>
            <p className="text-sm text-gray-600">
              Supply: {formatAmount({ value: Number(assetInfo?.supply_normalized || 0), maximumFractionDigits: 0 })}
            </p>
          </div>
          <AssetInfoPopover assetInfo={assetInfo} className="flex-shrink-0 ml-2" />
        </div>

        {/* Stats Card - contextual based on tab */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
              {tab === "open" && dispenserStats && (
                <>
                  <CopyableStat
                    label="Floor"
                    value={formatPrice(dispenserStats.floorPrice, priceUnit, btcPrice, settings.fiat)}
                    rawValue={getRawPrice(dispenserStats.floorPrice, priceUnit, btcPrice, settings.fiat)}
                    onCopy={copy}
                    isCopied={isCopied(getRawPrice(dispenserStats.floorPrice, priceUnit, btcPrice, settings.fiat))}
                  />
                  <CopyableStat
                    label="Avg"
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
                    <span className="text-gray-500">Floor</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Avg</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                </>
              )}
              {tab === "dispensed" && dispenseStats && (
                <>
                  <CopyableStat
                    label="Last"
                    value={formatPrice(dispenseStats.lastPrice, priceUnit, btcPrice, settings.fiat)}
                    rawValue={getRawPrice(dispenseStats.lastPrice, priceUnit, btcPrice, settings.fiat)}
                    onCopy={copy}
                    isCopied={isCopied(getRawPrice(dispenseStats.lastPrice, priceUnit, btcPrice, settings.fiat))}
                  />
                  <CopyableStat
                    label="Avg"
                    value={formatPrice(dispenseStats.avgPrice, priceUnit, btcPrice, settings.fiat)}
                    rawValue={getRawPrice(dispenseStats.avgPrice, priceUnit, btcPrice, settings.fiat)}
                    onCopy={copy}
                    isCopied={isCopied(getRawPrice(dispenseStats.avgPrice, priceUnit, btcPrice, settings.fiat))}
                  />
                </>
              )}
              {tab === "dispensed" && !dispenseStats && (
                <>
                  <div>
                    <span className="text-gray-500">Last</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Avg</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={togglePriceUnit}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              title={`Switch to ${getNextUnit(priceUnit, btcPrice !== null).toUpperCase()}`}
              aria-label={`Switch price display to ${getNextUnit(priceUnit, btcPrice !== null).toUpperCase()}`}
            >
              <TbRepeat className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Section Header with Tabs left, Create button right */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("open")}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                tab === "open"
                  ? "bg-gray-200 text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setTab("dispensed")}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                tab === "dispensed"
                  ? "bg-gray-200 text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Dispensed
            </button>
          </div>
          <button
            onClick={() => navigate("/market/dispensers/manage")}
            className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            My Dispensers
          </button>
        </div>

        {/* Content */}
        {tab === "open" ? (
          dispensers.length > 0 ? (
            <div className="space-y-2">
              {dispensers.map((d) => (
                <AssetDispenserCard
                  key={d.tx_hash}
                  dispenser={d}
                  formattedPrice={formatPrice(getSatsPerUnit(d), priceUnit, btcPrice, settings.fiat)}
                  onClick={() => handleDispenserClick(d)}
                  onCopyAddress={copy}
                  isCopied={isCopied(d.source)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message={`No open ${asset} dispensers found`} />
          )
        ) : (
          dispenses.length > 0 ? (
            <div className="space-y-2">
              {dispenses.map((d) => {
                const quantity = Number(d.dispense_quantity_normalized);
                const pricePerUnit = quantity > 0 ? Math.round(d.btc_amount / quantity) : 0;
                return (
                  <AssetDispenseCard
                    key={d.tx_hash}
                    dispense={d}
                    asset={asset || ""}
                    formattedPricePerUnit={formatPrice(pricePerUnit, priceUnit, btcPrice, settings.fiat)}
                    onCopyTx={copy}
                    isCopied={isCopied(d.tx_hash)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState message={`No recent ${asset} dispenses`} />
          )
        )}

        {/* Load more sentinel */}
        <div ref={loadMoreRef} className="py-2">
          {hasMore ? (
            isFetching ? (
              <div className="flex justify-center">
                <Spinner className="py-4" />
              </div>
            ) : (
              <div className="text-xs text-gray-400 text-center">Scroll to load more…</div>
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
        {tab === "dispensed" && dispenseStats && dispenses.length > 1 && (
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
  );
}
