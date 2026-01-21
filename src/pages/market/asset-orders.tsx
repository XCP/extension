
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TbRepeat, FiRefreshCw, FaCheck } from "@/components/icons";
import { AssetInfoPopover } from "@/components/asset-info-popover";
import { Spinner } from "@/components/spinner";
import { AssetIcon } from "@/components/asset-icon";
import { EmptyState } from "@/components/empty-state";
import { MarketOrderCard } from "@/components/cards/market-order-card";
import { MarketMatchCard } from "@/components/cards/market-match-card";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useTradingPair } from "@/hooks/useTradingPair";
import { useInView } from "@/hooks/useInView";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatAmount } from "@/utils/format";
import { CURRENCY_INFO, type FiatCurrency } from "@/utils/blockchain/bitcoin/price";
import {
  fetchOrdersByPair,
  fetchOrderMatchesByPair,
  fetchAssetDetails,
  type Order,
  type OrderMatch,
  type AssetInfo,
} from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";

// Constants
const FETCH_LIMIT = 20;
const DEBOUNCE_MS = 1000;
const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes

// Price unit types for orders
type OrderPriceUnit = "raw" | "fiat";

/**
 * Format price based on quote asset and selected unit
 */
function formatOrderPrice(
  price: number,
  quoteAsset: string,
  unit: OrderPriceUnit,
  btcPrice: number | null,
  xcpPrice: number | null,
  currency: FiatCurrency
): string {
  if (unit === "fiat") {
    const { symbol, decimals } = CURRENCY_INFO[currency];
    if (quoteAsset === "BTC" && btcPrice) {
      const fiatValue = price * btcPrice;
      return `${symbol}${formatAmount({ value: fiatValue, maximumFractionDigits: decimals })}`;
    }
    if (quoteAsset === "XCP" && xcpPrice) {
      const fiatValue = price * xcpPrice;
      return `${symbol}${formatAmount({ value: fiatValue, maximumFractionDigits: decimals })}`;
    }
    return "—";
  }
  // Raw quote asset value
  return `${formatAmount({ value: price, maximumFractionDigits: 8 })} ${quoteAsset}`;
}

/**
 * Get raw numeric price value (without symbol) for clipboard
 */
function getRawOrderPrice(
  price: number,
  quoteAsset: string,
  unit: OrderPriceUnit,
  btcPrice: number | null,
  xcpPrice: number | null,
  currency: FiatCurrency
): string {
  if (unit === "fiat") {
    const decimals = CURRENCY_INFO[currency].decimals;
    if (quoteAsset === "BTC" && btcPrice) {
      return formatAmount({ value: price * btcPrice, maximumFractionDigits: decimals });
    }
    if (quoteAsset === "XCP" && xcpPrice) {
      return formatAmount({ value: price * xcpPrice, maximumFractionDigits: decimals });
    }
    return "";
  }
  return formatAmount({ value: price, maximumFractionDigits: 8 });
}

/**
 * Check if fiat price toggle is available for this quote asset
 */
function hasFiatOption(quoteAsset: string): boolean {
  return quoteAsset === "BTC" || quoteAsset === "XCP";
}

/**
 * Calculate price per unit from order (get_quantity / give_quantity)
 */
function getPricePerUnit(order: Order): number {
  const giveQty = Number(order.give_quantity_normalized);
  if (giveQty <= 0) return 0;
  return Number(order.get_quantity_normalized) / giveQty;
}

/**
 * Calculate price per unit from order match
 */
function getMatchPricePerUnit(match: OrderMatch, baseAsset: string): number {
  // Determine which is base and which is quote
  if (match.forward_asset === baseAsset) {
    const baseQty = Number(match.forward_quantity_normalized);
    if (baseQty <= 0) return 0;
    return Number(match.backward_quantity_normalized) / baseQty;
  } else {
    const baseQty = Number(match.backward_quantity_normalized);
    if (baseQty <= 0) return 0;
    return Number(match.forward_quantity_normalized) / baseQty;
  }
}

/**
 * AssetOrders displays orders and order matches for a specific trading pair.
 */
export default function AssetOrders(): ReactElement {
  const { baseAsset, quoteAsset } = useParams<{ baseAsset: string; quoteAsset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings } = useSettings();
  const { btc: btcPrice, xcp: xcpPrice } = useMarketPrices(settings.fiat);
  const { data: tradingPairData } = useTradingPair(baseAsset, quoteAsset);

  // Data state
  const [baseAssetInfo, setBaseAssetInfo] = useState<AssetInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [matches, setMatches] = useState<OrderMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state for orders
  const [orderOffset, setOrderOffset] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Pagination state for matches
  const [matchOffset, setMatchOffset] = useState(0);
  const [hasMoreMatches, setHasMoreMatches] = useState(true);
  const [isFetchingMoreMatches, setIsFetchingMoreMatches] = useState(false);

  // UI state
  const [tab, setTab] = useState<"open" | "matched">("open");
  const [priceUnit, setPriceUnit] = useState<OrderPriceUnit>("raw");

  // Clipboard
  const { copy, isCopied } = useCopyToClipboard();

  // Infinite scroll refs
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // Debounce timer ref for saving preference
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last refresh time to prevent spam
  const lastRefreshRef = useRef<number>(0);

  // Check if fiat toggle is available
  const canToggleFiat = hasFiatOption(quoteAsset || "");

  // Price unit toggle handler
  const togglePriceUnit = useCallback(() => {
    if (!canToggleFiat) return;
    const nextUnit: OrderPriceUnit = priceUnit === "raw" ? "fiat" : "raw";
    setPriceUnit(nextUnit);
  }, [priceUnit, canToggleFiat]);

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
    if (!baseAsset || !quoteAsset) return;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setOrders([]);
    setMatches([]);
    setOrderOffset(0);
    setMatchOffset(0);
    setHasMoreOrders(true);
    setHasMoreMatches(true);

    try {
      // Fetch orders where someone is selling baseAsset for quoteAsset (buy orders from our perspective)
      const [infoRes, ordersRes, matchesRes] = await Promise.all([
        fetchAssetDetails(baseAsset),
        fetchOrdersByPair(baseAsset, quoteAsset, { limit: FETCH_LIMIT, status: "open" }),
        fetchOrderMatchesByPair(baseAsset, quoteAsset, { limit: FETCH_LIMIT }),
      ]);
      if (infoRes) setBaseAssetInfo(infoRes);

      setOrders(ordersRes.result);
      setOrderOffset(FETCH_LIMIT);
      if (ordersRes.result.length < FETCH_LIMIT) {
        setHasMoreOrders(false);
      }

      setMatches(matchesRes.result);
      setMatchOffset(FETCH_LIMIT);
      if (matchesRes.result.length < FETCH_LIMIT) {
        setHasMoreMatches(false);
      }
    } catch (err) {
      console.error('Failed to load orders:', { baseAsset, quoteAsset }, err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [baseAsset, quoteAsset]);

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
    const pairName = tradingPairData?.name || `${baseAsset}/${quoteAsset}`;
    setHeaderProps({
      title: "Orders",
      onBack: () => navigate("/market"),
      rightButton: {
        ariaLabel: "Refresh orders",
        icon: <FiRefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />,
        onClick: handleRefresh,
        disabled: isRefreshing,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isRefreshing, handleRefresh, tradingPairData, baseAsset, quoteAsset]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load more orders on scroll (when on "open" tab)
  useEffect(() => {
    if (!baseAsset || !quoteAsset || !inView || isFetchingMore || !hasMoreOrders || tab !== "open") {
      return;
    }

    const loadMore = async () => {
      setIsFetchingMore(true);
      try {
        const res = await fetchOrdersByPair(baseAsset, quoteAsset, {
          limit: FETCH_LIMIT,
          offset: orderOffset,
          status: "open",
        });

        if (res.result.length < FETCH_LIMIT) {
          setHasMoreOrders(false);
        }

        if (res.result.length > 0) {
          setOrders((prev) => {
            const merged = [...prev, ...res.result];
            return merged.filter(
              (d, i, arr) => arr.findIndex((x) => x.tx_hash === d.tx_hash) === i
            );
          });
          setOrderOffset((prev) => prev + FETCH_LIMIT);
        }
      } catch (err) {
        console.error("Failed to load more orders:", err);
        setHasMoreOrders(false);
      } finally {
        setIsFetchingMore(false);
      }
    };

    loadMore();
  }, [baseAsset, quoteAsset, inView, isFetchingMore, hasMoreOrders, orderOffset, tab]);

  // Load more matches on scroll (when on "matched" tab)
  useEffect(() => {
    if (!baseAsset || !quoteAsset || !inView || isFetchingMoreMatches || !hasMoreMatches || tab !== "matched") {
      return;
    }

    const loadMore = async () => {
      setIsFetchingMoreMatches(true);
      try {
        const res = await fetchOrderMatchesByPair(baseAsset, quoteAsset, {
          limit: FETCH_LIMIT,
          offset: matchOffset,
        });

        if (res.result.length < FETCH_LIMIT) {
          setHasMoreMatches(false);
        }

        if (res.result.length > 0) {
          setMatches((prev) => {
            const merged = [...prev, ...res.result];
            return merged.filter(
              (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i
            );
          });
          setMatchOffset((prev) => prev + FETCH_LIMIT);
        }
      } catch (err) {
        console.error("Failed to load more matches:", err);
        setHasMoreMatches(false);
      } finally {
        setIsFetchingMoreMatches(false);
      }
    };

    loadMore();
  }, [baseAsset, quoteAsset, inView, isFetchingMoreMatches, hasMoreMatches, matchOffset, tab]);

  // Calculate stats for open orders
  const orderStats = useMemo(() => {
    if (orders.length === 0) return null;

    // Total base asset available
    const totalBaseAsset = orders.reduce(
      (sum, o) => sum + Number(o.give_remaining_normalized), 0
    );

    // Total quote asset required
    const totalQuoteAsset = orders.reduce(
      (sum, o) => sum + Number(o.get_remaining_normalized), 0
    );

    // Floor price (lowest ask)
    const floorPrice = Math.min(...orders.map(o => getPricePerUnit(o)));

    // Weighted average price
    const weightedSum = orders.reduce(
      (sum, o) => sum + getPricePerUnit(o) * Number(o.give_remaining_normalized), 0
    );
    const weightedAvg = totalBaseAsset > 0 ? weightedSum / totalBaseAsset : 0;

    return {
      totalBaseAsset,
      totalQuoteAsset,
      floorPrice,
      weightedAvg,
    };
  }, [orders]);

  // Calculate stats for matches
  const matchStats = useMemo(() => {
    if (matches.length === 0) return null;

    // Last match price
    const lastMatch = matches[0];
    const lastPrice = getMatchPricePerUnit(lastMatch, baseAsset || "");

    // Calculate totals and average
    let totalBaseAsset = 0;
    let totalQuoteAsset = 0;

    matches.forEach(m => {
      if (m.forward_asset === baseAsset) {
        totalBaseAsset += Number(m.forward_quantity_normalized);
        totalQuoteAsset += Number(m.backward_quantity_normalized);
      } else {
        totalBaseAsset += Number(m.backward_quantity_normalized);
        totalQuoteAsset += Number(m.forward_quantity_normalized);
      }
    });

    const avgPrice = totalBaseAsset > 0 ? totalQuoteAsset / totalBaseAsset : 0;

    return {
      lastPrice,
      avgPrice,
      totalBaseAsset,
      totalQuoteAsset,
    };
  }, [matches, baseAsset]);

  const handleOrderClick = (order: Order) => {
    // Navigate to order matching page
    navigate(`/compose/order/${baseAsset}?type=buy&quote=${quoteAsset}`);
  };

  if (loading) {
    return <Spinner message={`Loading ${baseAsset}/${quoteAsset} orders…`} />;
  }

  const hasMore = tab === "open" ? hasMoreOrders : hasMoreMatches;
  const isFetching = tab === "open" ? isFetchingMore : isFetchingMoreMatches;

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        {/* Asset Header */}
        <div className="flex items-center mb-4">
          <AssetIcon asset={baseAsset || ""} size="lg" className="mr-4" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold break-all">
              {baseAssetInfo?.asset_longname || baseAsset}
            </h2>
            <p className="text-sm text-gray-600">
              {tradingPairData?.name || `${baseAsset}/${quoteAsset}`}
            </p>
          </div>
          <AssetInfoPopover assetInfo={baseAssetInfo} className="flex-shrink-0 ml-2" />
        </div>

        {/* Stats Card - contextual based on tab */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
              {tab === "open" && orderStats && (
                <>
                  <div>
                    <span className="text-gray-500">Floor</span>
                    <div
                      onClick={() => copy(getRawOrderPrice(orderStats.floorPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat))}
                      className={`font-medium text-gray-900 truncate cursor-pointer rounded px-1 -mx-1 flex items-center justify-between gap-1 ${isCopied(getRawOrderPrice(orderStats.floorPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) ? "bg-gray-200" : ""}`}
                    >
                      <span>{formatOrderPrice(orderStats.floorPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)}</span>
                      {isCopied(getRawOrderPrice(orderStats.floorPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) && <FaCheck className="size-3 text-green-500 flex-shrink-0" aria-hidden="true" />}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Avg</span>
                    <div
                      onClick={() => copy(getRawOrderPrice(orderStats.weightedAvg, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat))}
                      className={`font-medium text-gray-900 truncate cursor-pointer rounded px-1 -mx-1 flex items-center justify-between gap-1 ${isCopied(getRawOrderPrice(orderStats.weightedAvg, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) ? "bg-gray-200" : ""}`}
                    >
                      <span>{formatOrderPrice(orderStats.weightedAvg, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)}</span>
                      {isCopied(getRawOrderPrice(orderStats.weightedAvg, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) && <FaCheck className="size-3 text-green-500 flex-shrink-0" aria-hidden="true" />}
                    </div>
                  </div>
                </>
              )}
              {tab === "open" && !orderStats && (
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
              {tab === "matched" && matchStats && (
                <>
                  <div>
                    <span className="text-gray-500">Last</span>
                    <div
                      onClick={() => copy(getRawOrderPrice(matchStats.lastPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat))}
                      className={`font-medium text-gray-900 truncate cursor-pointer rounded px-1 -mx-1 flex items-center justify-between gap-1 ${isCopied(getRawOrderPrice(matchStats.lastPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) ? "bg-gray-200" : ""}`}
                    >
                      <span>{formatOrderPrice(matchStats.lastPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)}</span>
                      {isCopied(getRawOrderPrice(matchStats.lastPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) && <FaCheck className="size-3 text-green-500 flex-shrink-0" aria-hidden="true" />}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Avg</span>
                    <div
                      onClick={() => copy(getRawOrderPrice(matchStats.avgPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat))}
                      className={`font-medium text-gray-900 truncate cursor-pointer rounded px-1 -mx-1 flex items-center justify-between gap-1 ${isCopied(getRawOrderPrice(matchStats.avgPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) ? "bg-gray-200" : ""}`}
                    >
                      <span>{formatOrderPrice(matchStats.avgPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)}</span>
                      {isCopied(getRawOrderPrice(matchStats.avgPrice, quoteAsset || "", priceUnit, btcPrice, xcpPrice, settings.fiat)) && <FaCheck className="size-3 text-green-500 flex-shrink-0" aria-hidden="true" />}
                    </div>
                  </div>
                </>
              )}
              {tab === "matched" && !matchStats && (
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
            {canToggleFiat && (
              <button
                onClick={togglePriceUnit}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                title={`Switch to ${priceUnit === "raw" ? settings.fiat.toUpperCase() : quoteAsset}`}
                aria-label={`Switch price display to ${priceUnit === "raw" ? settings.fiat.toUpperCase() : quoteAsset}`}
              >
                <TbRepeat className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Section Header with Tabs left, My Orders right */}
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
              onClick={() => setTab("matched")}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                tab === "matched"
                  ? "bg-gray-200 text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Matched
            </button>
          </div>
          <a
            href="#"
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            My Orders
          </a>
        </div>

        {/* Content */}
        {tab === "open" ? (
          orders.length > 0 ? (
            <div className="space-y-2">
              {orders.map((o) => (
                <MarketOrderCard
                  key={o.tx_hash}
                  order={o}
                  onClick={() => handleOrderClick(o)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message={`No open ${baseAsset}/${quoteAsset} orders`} />
          )
        ) : (
          matches.length > 0 ? (
            <div className="space-y-2">
              {matches.map((m) => (
                <MarketMatchCard
                  key={m.id}
                  match={m}
                  onCopyTx={copy}
                  isCopied={isCopied(m.tx0_hash)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message={`No ${baseAsset}/${quoteAsset} matches`} />
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
        {tab === "open" && orderStats && orders.length > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-2">
            <span>
              {formatAmount({ value: orderStats.totalQuoteAsset, maximumFractionDigits: 8 })} {quoteAsset}
            </span>
            <span>
              for {formatAmount({ value: orderStats.totalBaseAsset, maximumFractionDigits: 0 })} {baseAsset}
            </span>
          </div>
        )}
        {tab === "matched" && matchStats && matches.length > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-2">
            <span>
              {formatAmount({ value: matchStats.totalQuoteAsset, maximumFractionDigits: 8 })} {quoteAsset}
            </span>
            <span>
              for {formatAmount({ value: matchStats.totalBaseAsset, maximumFractionDigits: 0 })} {baseAsset}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
