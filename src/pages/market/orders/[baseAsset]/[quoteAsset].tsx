import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiRefreshCw, FaCheck } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { AssetHeader } from "@/components/ui/headers/asset-header";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderBookLevelCard } from "@/components/ui/cards/order-book-level-card";
import { MarketMatchCard } from "@/components/ui/cards/market-match-card";
import { useHeader } from "@/contexts/header-context";
import { useInView } from "@/hooks/useInView";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatAmount } from "@/utils/format";
import {
  getOrderPricePerUnit,
  getOrderBaseAmount,
  getOrderQuoteAmount,
  getMatchPricePerUnit,
} from "@/utils/trading-pair";
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
const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes

/**
 * Format price in raw quote asset units
 */
function formatOrderPrice(price: number, quoteAsset: string): string {
  return `${formatAmount({ value: price, maximumFractionDigits: 8 })} ${quoteAsset}`;
}

/**
 * Get raw numeric price value (without symbol) for clipboard
 */
function getRawOrderPrice(price: number): string {
  return formatAmount({ value: price, maximumFractionDigits: 8 });
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
 * AssetOrders displays orders and order matches for a specific trading pair.
 */
export default function AssetOrdersPage(): ReactElement {
  const { baseAsset, quoteAsset } = useParams<{ baseAsset: string; quoteAsset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  // Data state
  const [baseAssetInfo, setBaseAssetInfo] = useState<AssetInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [matches, setMatches] = useState<OrderMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state for matches (orders are loaded fully upfront for order book)
  const [matchOffset, setMatchOffset] = useState(0);
  const [hasMoreMatches, setHasMoreMatches] = useState(true);
  const [isFetchingMoreMatches, setIsFetchingMoreMatches] = useState(false);

  // UI state
  const [tab, setTab] = useState<"buy" | "sell" | "history">("sell");

  // Clipboard
  const { copy, isCopied } = useCopyToClipboard();

  // Infinite scroll refs
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // Track last refresh time to prevent spam
  const lastRefreshRef = useRef<number>(0);

  // Fetch all orders by paginating through (order book needs complete data)
  const fetchAllOrders = useCallback(async (base: string, quote: string): Promise<Order[]> => {
    const allOrders: Order[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await fetchOrdersByPair(base, quote, {
        limit: FETCH_LIMIT,
        offset,
        status: "open",
      });
      allOrders.push(...res.result);
      offset += FETCH_LIMIT;
      hasMore = res.result.length === FETCH_LIMIT;
    }

    return allOrders;
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
    setMatchOffset(0);
    setHasMoreMatches(true);

    try {
      // Fetch asset info and all orders in parallel, plus first page of matches
      const [infoRes, allOrders, matchesRes] = await Promise.all([
        fetchAssetDetails(baseAsset),
        fetchAllOrders(baseAsset, quoteAsset),
        fetchOrderMatchesByPair(baseAsset, quoteAsset, { limit: FETCH_LIMIT }),
      ]);

      if (infoRes) setBaseAssetInfo(infoRes);
      setOrders(allOrders);

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
  }, [baseAsset, quoteAsset, fetchAllOrders]);

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
  }, [setHeaderProps, navigate, isRefreshing, handleRefresh]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load more matches on scroll (when on "history" tab)
  useEffect(() => {
    if (!baseAsset || !quoteAsset || !inView || isFetchingMoreMatches || !hasMoreMatches || tab !== "history") {
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

  // Split orders into buy and sell categories based on the URL's trading pair context
  // Sell order: give_asset = baseAsset (selling base for quote)
  // Buy order: give_asset = quoteAsset (buying base with quote)
  const { buyOrders, sellOrders } = useMemo(() => {
    const buy: Order[] = [];
    const sell: Order[] = [];

    orders.forEach(order => {
      if (order.give_asset === baseAsset) {
        sell.push(order);
      } else if (order.give_asset === quoteAsset) {
        buy.push(order);
      }
      // Orders that don't match either direction are ignored (shouldn't happen)
    });

    return { buyOrders: buy, sellOrders: sell };
  }, [orders, baseAsset, quoteAsset]);

  // Track if we've auto-selected the initial tab
  const hasAutoSelectedTab = useRef(false);

  // Auto-select tab based on available orders (only on initial load)
  useEffect(() => {
    // Only run once after orders load
    if (hasAutoSelectedTab.current || loading || orders.length === 0) return;
    hasAutoSelectedTab.current = true;

    const hasSellOrders = sellOrders.length > 0;
    const hasBuyOrders = buyOrders.length > 0;

    // If only buy orders exist, show buy tab
    // Otherwise show sell tab (default)
    if (hasBuyOrders && !hasSellOrders) {
      setTab("buy");
    }
    // If only sell or both, keep default "sell"
  }, [loading, orders.length, buyOrders.length, sellOrders.length]);

  // Get current orders based on tab
  const currentOrders = tab === "buy" ? buyOrders : tab === "sell" ? sellOrders : [];

  // Aggregate orders into price levels (like an exchange order book)
  const priceLevels = useMemo(() => {
    if (currentOrders.length === 0 || !baseAsset) return [];

    const isBuyTab = tab === "buy";

    // Group orders by price (using 8 decimal precision as key)
    const priceMap = new Map<string, { price: number; orders: Order[]; totalAmount: number }>();

    currentOrders.forEach(order => {
      const price = getOrderPricePerUnit(order, baseAsset);
      const amount = getOrderBaseAmount(order, baseAsset);
      const priceKey = price.toFixed(8);

      const existing = priceMap.get(priceKey);
      if (existing) {
        existing.orders.push(order);
        existing.totalAmount += amount;
      } else {
        priceMap.set(priceKey, { price, orders: [order], totalAmount: amount });
      }
    });

    // Convert to array and sort by price
    // Sells: ascending (best ask / lowest price first)
    // Buys: descending (best bid / highest price first)
    const levels = Array.from(priceMap.entries()).map(([priceKey, data]) => ({
      priceKey,
      ...data,
    }));

    levels.sort((a, b) => isBuyTab ? b.price - a.price : a.price - b.price);

    // Calculate cumulative depth percentages and cumulative sums
    const totalVolume = levels.reduce((sum, l) => sum + l.totalAmount, 0);
    let cumulativeBase = 0;
    let cumulativeQuote = 0;

    return levels.map(level => {
      cumulativeBase += level.totalAmount;
      cumulativeQuote += level.price * level.totalAmount;
      return {
        ...level,
        depthPercent: totalVolume > 0 ? (cumulativeBase / totalVolume) * 100 : 0,
        cumulativeBase,
        cumulativeQuote,
      };
    });
  }, [currentOrders, baseAsset, tab]);

  // Calculate stats for current orders
  const orderStats = useMemo(() => {
    if (currentOrders.length === 0 || !baseAsset) return null;

    // Use helper functions that account for buy vs sell order direction
    const totalBaseAsset = currentOrders.reduce(
      (sum, o) => sum + getOrderBaseAmount(o, baseAsset), 0
    );

    const totalQuoteAsset = currentOrders.reduce(
      (sum, o) => sum + getOrderQuoteAmount(o, baseAsset), 0
    );

    // Floor price (lowest price in quote per base)
    const prices = currentOrders.map(o => getOrderPricePerUnit(o, baseAsset)).filter(p => p > 0);
    const floorPrice = prices.length > 0 ? Math.min(...prices) : 0;

    // Weighted average price (weighted by base asset amount)
    const weightedSum = currentOrders.reduce(
      (sum, o) => sum + getOrderPricePerUnit(o, baseAsset) * getOrderBaseAmount(o, baseAsset), 0
    );
    const weightedAvg = totalBaseAsset > 0 ? weightedSum / totalBaseAsset : 0;

    return {
      totalBaseAsset,
      totalQuoteAsset,
      floorPrice,
      weightedAvg,
    };
  }, [currentOrders, baseAsset]);

  // Calculate market stats (bid, ask, spread) from both buy and sell orders
  const marketStats = useMemo(() => {
    if (!baseAsset) return null;

    // Best bid = highest buy price
    const buyPrices = buyOrders.map(o => getOrderPricePerUnit(o, baseAsset)).filter(p => p > 0);
    const bestBid = buyPrices.length > 0 ? Math.max(...buyPrices) : null;

    // Best ask = lowest sell price
    const sellPrices = sellOrders.map(o => getOrderPricePerUnit(o, baseAsset)).filter(p => p > 0);
    const bestAsk = sellPrices.length > 0 ? Math.min(...sellPrices) : null;

    // Spread = best ask - best bid (only if both exist)
    const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

    return { bestBid, bestAsk, spread };
  }, [buyOrders, sellOrders, baseAsset]);

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

  const handlePriceLevelClick = (price: number, totalAmount: number) => {
    if (!baseAsset || !quoteAsset) return;

    // Clicking a sell level means we want to buy; clicking a buy level means we want to sell
    const orderType = tab === "sell" ? "buy" : "sell";

    // Guard against invalid data
    if (price <= 0 || totalAmount <= 0) return;

    // Build URL with pre-filled values
    const params = new URLSearchParams({
      type: orderType,
      quote: quoteAsset,
      price: price.toFixed(8),
      amount: totalAmount.toString(),
    });

    navigate(`/compose/order/${baseAsset}?${params.toString()}`);
  };

  if (loading) {
    return <Spinner message={`Loading ${baseAsset}/${quoteAsset} orders…`} />;
  }

  // Only history tab has pagination - orders are loaded fully upfront for the order book
  const hasMore = tab === "history" && hasMoreMatches;
  const isFetching = tab === "history" && isFetchingMoreMatches;

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex flex-col flex-grow min-h-0">
        {/* Fixed Header */}
        <div className="p-4 pb-0 flex-shrink-0">
          {/* Asset Header */}
          {baseAssetInfo && (
            <AssetHeader assetInfo={baseAssetInfo} showInfoPopover className="mb-4" />
          )}

          {/* Stats Card - contextual based on tab */}
          <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
            <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
              {tab === "buy" && marketStats && marketStats.bestBid !== null && (
                <>
                  <CopyableStat
                    label="Bid"
                    value={formatOrderPrice(marketStats.bestBid, quoteAsset || "")}
                    rawValue={getRawOrderPrice(marketStats.bestBid)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(marketStats.bestBid))}
                  />
                  {marketStats.spread !== null ? (
                    <CopyableStat
                      label="Spread"
                      value={formatOrderPrice(marketStats.spread, quoteAsset || "")}
                      rawValue={getRawOrderPrice(marketStats.spread)}
                      onCopy={copy}
                      isCopied={isCopied(getRawOrderPrice(marketStats.spread))}
                    />
                  ) : (
                    <div>
                      <span className="text-gray-500">Spread</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                  )}
                </>
              )}
              {tab === "buy" && (!marketStats || marketStats.bestBid === null) && (
                <>
                  <div>
                    <span className="text-gray-500">Bid</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Spread</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                </>
              )}
              {tab === "sell" && marketStats && marketStats.bestAsk !== null && (
                <>
                  <CopyableStat
                    label="Ask"
                    value={formatOrderPrice(marketStats.bestAsk, quoteAsset || "")}
                    rawValue={getRawOrderPrice(marketStats.bestAsk)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(marketStats.bestAsk))}
                  />
                  {marketStats.spread !== null ? (
                    <CopyableStat
                      label="Spread"
                      value={formatOrderPrice(marketStats.spread, quoteAsset || "")}
                      rawValue={getRawOrderPrice(marketStats.spread)}
                      onCopy={copy}
                      isCopied={isCopied(getRawOrderPrice(marketStats.spread))}
                    />
                  ) : (
                    <div>
                      <span className="text-gray-500">Spread</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                  )}
                </>
              )}
              {tab === "sell" && (!marketStats || marketStats.bestAsk === null) && (
                <>
                  <div>
                    <span className="text-gray-500">Ask</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Spread</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                </>
              )}
              {tab === "history" && matchStats && (
                <>
                  <CopyableStat
                    label="Last"
                    value={formatOrderPrice(matchStats.lastPrice, quoteAsset || "")}
                    rawValue={getRawOrderPrice(matchStats.lastPrice)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(matchStats.lastPrice))}
                  />
                  <CopyableStat
                    label="Avg"
                    value={formatOrderPrice(matchStats.avgPrice, quoteAsset || "")}
                    rawValue={getRawOrderPrice(matchStats.avgPrice)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(matchStats.avgPrice))}
                  />
                </>
              )}
              {tab === "history" && !matchStats && (
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
          </div>

          {/* Section Header with Tabs */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              <button
                onClick={() => setTab("buy")}
                className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  tab === "buy"
                    ? "bg-gray-200 text-gray-900 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTab("sell")}
                className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  tab === "sell"
                    ? "bg-gray-200 text-gray-900 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Sell
              </button>
              <button
                onClick={() => setTab("history")}
                className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  tab === "history"
                    ? "bg-gray-200 text-gray-900 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                History
              </button>
            </div>
            <button
              onClick={() => navigate(`/market?tab=orders&mode=manage&search=${baseAsset}`)}
              className="text-xs text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded cursor-pointer"
            >
              My Orders
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4">
          {(tab === "buy" || tab === "sell") && (
            priceLevels.length > 0 ? (
              <div className="space-y-1">
                {/* Column headers */}
                <div className="flex items-center text-xs text-gray-400 px-2 py-1">
                  <div className="flex-1">Price</div>
                  <div className="flex-1">Amount</div>
                  <div className="flex-1 text-right">Total</div>
                </div>
                {priceLevels.map((level) => {
                  const total = level.price * level.totalAmount;
                  const avgPrice = level.cumulativeBase > 0 ? level.cumulativeQuote / level.cumulativeBase : 0;

                  // Format values
                  const formattedPrice = formatAmount({ value: level.price, maximumFractionDigits: 8 });
                  const formattedAmount = level.totalAmount % 1 === 0
                    ? formatAmount({ value: level.totalAmount, maximumFractionDigits: 0 })
                    : formatAmount({ value: level.totalAmount, maximumFractionDigits: 2 });
                  const formattedTotal = formatAmount({ value: total, minimumFractionDigits: 8, maximumFractionDigits: 8 });

                  // Build hover title with cumulative info
                  const hoverTitle = `Avg: ${formatAmount({ value: avgPrice, minimumFractionDigits: 8, maximumFractionDigits: 8 })} ${quoteAsset}\nSum: ${formatAmount({ value: level.cumulativeBase, maximumFractionDigits: 8 })} ${baseAsset}\nSum: ${formatAmount({ value: level.cumulativeQuote, minimumFractionDigits: 8, maximumFractionDigits: 8 })} ${quoteAsset}`;

                  return (
                    <OrderBookLevelCard
                      key={level.priceKey}
                      formattedPrice={formattedPrice}
                      formattedAmount={formattedAmount}
                      formattedTotal={formattedTotal}
                      hoverTitle={hoverTitle}
                      isBuy={tab === "buy"}
                      depthPercent={level.depthPercent}
                      onClick={() => handlePriceLevelClick(level.price, level.totalAmount)}
                    />
                  );
                })}
              </div>
            ) : (
              <>
                <EmptyState message={`No ${tab} orders for ${baseAsset}/${quoteAsset}`} />
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      type: tab,
                      quote: quoteAsset || "XCP",
                    });
                    navigate(`/compose/order/${baseAsset}?${params.toString()}`);
                  }}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  Create New Order →
                </button>
              </>
            )
          )}

          {tab === "history" && (
            matches.length > 0 ? (
              <div className="space-y-2">
                {matches.map((m) => (
                  <MarketMatchCard
                    key={m.id}
                    match={m}
                    baseAsset={baseAsset}
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
          {tab === "sell" && orderStats && priceLevels.length > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-2">
              <span>
                {formatAmount({ value: orderStats.totalBaseAsset, maximumFractionDigits: 0 })} {baseAsset}
              </span>
              <span>
                for {formatAmount({ value: orderStats.totalQuoteAsset, maximumFractionDigits: 8 })} {quoteAsset}
              </span>
            </div>
          )}
          {tab === "buy" && orderStats && priceLevels.length > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 px-1 pb-2">
              <span>
                {formatAmount({ value: orderStats.totalQuoteAsset, maximumFractionDigits: 8 })} {quoteAsset}
              </span>
              <span>
                for {formatAmount({ value: orderStats.totalBaseAsset, maximumFractionDigits: 0 })} {baseAsset}
              </span>
            </div>
          )}
          {tab === "history" && matchStats && matches.length > 1 && (
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
    </div>
  );
}
