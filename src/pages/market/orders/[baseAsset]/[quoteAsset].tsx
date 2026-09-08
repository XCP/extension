import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { FiRefreshCw } from "@/components/icons";
import { MarketMatchCard } from "@/components/ui/cards/market-match-card";
import { OrderBookLevelCard } from "@/components/ui/cards/order-book-level-card";
import { CopyableStat } from "@/components/ui/copyable-stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { TabButton } from "@/components/ui/tab-button";
import { useHeader } from "@/contexts/header-context";
import {
  type AssetInfo,
  fetchAssetDetails,
  fetchOrderMatchesByPair,
  fetchOrdersByPair,
  type Order,
} from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { divide, toBigNumber, toNumber } from "@/core/numeric";
import {
  getMatchPricePerUnit,
  getOrderBaseAmount,
  getOrderPricePerUnit,
  getOrderQuoteAmount,
} from "@/core/tradingPair";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useInView } from "@/hooks/useInView";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";

import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';

// Constants
const FETCH_LIMIT = 20;
const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes
/** Stable empty result, so the order memos below do not recompute on every render. */
const NO_ORDERS: Order[] = [];

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
 * AssetOrders displays orders and order matches for a specific trading pair.
 */
type OrderTab = "buy" | "sell" | "history";
interface PairProps { baseAsset: string; quoteAsset: string }

export default function AssetOrdersPage(): ReactElement {
  useLocaleRevision();
  const { baseAsset, quoteAsset } = useParams<{ baseAsset: string; quoteAsset: string }>();
  if (!baseAsset || !quoteAsset) return <EmptyState message={t('baseasset_quoteasset_select_pair')} />;
  return <AssetOrdersPair key={JSON.stringify([baseAsset, quoteAsset])} baseAsset={baseAsset} quoteAsset={quoteAsset} />;
}

function AssetOrdersPair({ baseAsset, quoteAsset }: PairProps): ReactElement {
  const [generation, setGeneration] = useState(0);
  const [tab, setTab] = useState<OrderTab>("sell");
  const lastRefreshRef = useRef(0);
  const hasAutoSelectedTab = useRef(false);
  const autoSelectTab = useCallback((onlyBuyOrders: boolean) => {
    if (hasAutoSelectedTab.current) return;
    hasAutoSelectedTab.current = true;
    if (onlyBuyOrders) setTab("buy");
  }, []);
  const reload = useCallback(() => setGeneration(current => current + 1), []);
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    lastRefreshRef.current = now;
    reload();
  }, [reload]);
  // Keep the selected tab, but retire every request when the pair is refreshed.
  return <AssetOrdersView key={generation} baseAsset={baseAsset} quoteAsset={quoteAsset}
    tab={tab} setTab={setTab} onAutoSelectTab={autoSelectTab}
    isRefresh={generation > 0} onRefresh={handleRefresh} onRetry={reload} />;
}

function AssetOrdersView({ baseAsset, quoteAsset, tab, setTab, onAutoSelectTab, isRefresh, onRefresh, onRetry }: PairProps & {
  tab: OrderTab;
  setTab: (tab: OrderTab) => void;
  onAutoSelectTab: (onlyBuyOrders: boolean) => void;
  isRefresh: boolean;
  onRefresh: () => void;
  onRetry: () => void;
}): ReactElement {
  const navigateRouter = useNavigate();
  const navigate = useCallback((to: string) => { void navigateRouter(to); }, [navigateRouter]);
  const { setHeaderProps } = useHeader();
  const [book, setBook] = useState<{ info: AssetInfo | null; orders: Order[]; error: { message: string | null } | null } | null>(null);
  const baseAssetInfo = book?.info ?? null;
  const orders = book?.orders ?? NO_ORDERS;
  const loading = book === null;
  const bookError = book?.error;
  const isRefreshing = isRefresh && loading;
  const { copy: copyAsync, isCopied } = useCopyToClipboard();
  const copy = useCallback((value: string) => { void copyAsync(value); }, [copyAsync]);
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  const fetchMatches = useCallback((offset: number, limit: number) =>
    fetchOrderMatchesByPair(baseAsset, quoteAsset, { limit, offset }), [baseAsset, quoteAsset]);
  const {
    data: matches, isLoading: matchesLoading, isFetchingMore: isFetchingMoreMatches,
    hasMore: hasMoreMatches, error: matchesError, loadMore: loadMoreMatches, refresh: retryMatches,
  } = usePaginatedFetch({ fetchFn: fetchMatches, getKey: (match) => match.id, maxItems: Infinity });

  useEffect(() => {
    let cancelled = false;
    const fetchAllOrders = async (): Promise<Order[]> => {
      const allOrders: Order[] = [];
      let offset = 0;
      while (true) {
        if (cancelled) return [];
        const response = await fetchOrdersByPair(baseAsset, quoteAsset, { limit: FETCH_LIMIT, offset, status: "open" });
        if (cancelled) return [];
        allOrders.push(...response.result);
        offset += response.result.length;
        if (response.result.length < FETCH_LIMIT
          || (Number.isSafeInteger(response.result_count) && offset >= response.result_count)) break;
      }
      return allOrders;
    };
    const loadBook = async () => {
      try {
        const [info, allOrders] = await Promise.all([fetchAssetDetails(baseAsset), fetchAllOrders()]);
        // Publishing only here preserves complete price levels and totals.
        if (!cancelled) setBook({ info, orders: allOrders, error: null });
      } catch (error) {
        if (!cancelled) {
          cancelled = true; // Stop any still-running full-book pagination loop.
          setBook({ info: null, orders: [], error: { message: error instanceof Error ? error.message : null } });
        }
      }
    };
    void loadBook();
    return () => { cancelled = true; };
  }, [baseAsset, quoteAsset]);

  useEffect(() => {
    setHeaderProps({
      title: t('baseasset_quoteasset_orders'),
      onBack: () => navigate("/market"),
      rightButton: {
        ariaLabel: t('baseasset_quoteasset_refresh_orders'),
        icon: <FiRefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />,
        onClick: onRefresh,
        disabled: isRefreshing,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isRefreshing, onRefresh]);

  useEffect(() => {
    if (!inView || tab !== "history" || loading || bookError || matchesLoading || isFetchingMoreMatches || !hasMoreMatches || matchesError) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) loadMoreMatches(); });
    return () => { cancelled = true; };
  }, [inView, tab, loading, bookError, matchesLoading, isFetchingMoreMatches, hasMoreMatches, matchesError, loadMoreMatches]);

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

  // Auto-select tab based on available orders (only on initial load)
  useEffect(() => {
    // Only run once after orders load
    if (loading || orders.length === 0) return;

    const hasSellOrders = sellOrders.length > 0;
    const hasBuyOrders = buyOrders.length > 0;

    // If only buy orders exist, show buy tab
    // Otherwise show sell tab (default)
    onAutoSelectTab(hasBuyOrders && !hasSellOrders);
    // If only sell or both, keep default "sell"
  }, [loading, orders.length, buyOrders.length, sellOrders.length, onAutoSelectTab]);

  // Get current orders based on tab
  const currentOrders = tab === "buy" ? buyOrders : tab === "sell" ? sellOrders : NO_ORDERS;

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
    const lastMatch = matches[0]!;
    const lastPrice = getMatchPricePerUnit(lastMatch, baseAsset || "");

    // Calculate totals and average
    let totalBaseAsset = toBigNumber(0);
    let totalQuoteAsset = toBigNumber(0);

    matches.forEach(m => {
      const [base, quote] = m.forward_asset === baseAsset
        ? [m.forward_quantity_normalized, m.backward_quantity_normalized]
        : [m.backward_quantity_normalized, m.forward_quantity_normalized];
      totalBaseAsset = totalBaseAsset.plus(toBigNumber(base));
      totalQuoteAsset = totalQuoteAsset.plus(toBigNumber(quote));
    });

    // Nothing traded means no average to report, rather than an average of zero.
    const avgPrice = totalBaseAsset.isGreaterThan(0)
      ? divide(totalQuoteAsset, totalBaseAsset)
      : null;

    return {
      lastPrice,
      avgPrice: avgPrice === null ? null : toNumber(avgPrice),
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
    return <Spinner message={t('baseasset_quoteasset_loading_orders', [String(baseAsset), String(quoteAsset)])} />;
  }

  if (book.error) {
    return <div role="alert" className="p-4 text-center text-sm text-gray-600">
      <p>{book.error.message ?? t('market_failed_to_load_orders')}</p>
      <button type="button" onClick={onRetry} className="mt-2 rounded px-3 py-1 text-blue-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{t('common_retry')}</button>
    </div>;
  }

  // Only history tab has pagination - orders are loaded fully upfront for the order book
  const hasMore = tab === "history" && hasMoreMatches;
  const isFetching = tab === "history" && isFetchingMoreMatches;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-grow min-h-0">
        {/* Fixed Header */}
        <div className="p-4 pb-0 flex-shrink-0">
          {/* Asset Header */}
          {baseAssetInfo && (
            <AssetHeader assetInfo={baseAssetInfo} showInfoPopover className="mt-1 mb-5" />
          )}

          {/* Stats Card - contextual based on tab */}
          <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
            <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
              {tab === "buy" && marketStats && marketStats.bestBid !== null && (
                <>
                  <CopyableStat
                    label={t('baseasset_quoteasset_bid')}
                    value={formatOrderPrice(marketStats.bestBid, quoteAsset || "")}
                    rawValue={getRawOrderPrice(marketStats.bestBid)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(marketStats.bestBid))}
                  />
                  {marketStats.spread !== null ? (
                    <CopyableStat
                      label={t('baseasset_quoteasset_spread')}
                      value={formatOrderPrice(marketStats.spread, quoteAsset || "")}
                      rawValue={getRawOrderPrice(marketStats.spread)}
                      onCopy={copy}
                      isCopied={isCopied(getRawOrderPrice(marketStats.spread))}
                    />
                  ) : (
                    <div>
                      <span className="text-gray-500">{t('baseasset_quoteasset_spread')}</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                  )}
                </>
              )}
              {tab === "buy" && (!marketStats || marketStats.bestBid === null) && (
                <>
                  <div>
                    <span className="text-gray-500">{t('baseasset_quoteasset_bid')}</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('baseasset_quoteasset_spread')}</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                </>
              )}
              {tab === "sell" && marketStats && marketStats.bestAsk !== null && (
                <>
                  <CopyableStat
                    label={t('baseasset_quoteasset_ask')}
                    value={formatOrderPrice(marketStats.bestAsk, quoteAsset || "")}
                    rawValue={getRawOrderPrice(marketStats.bestAsk)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(marketStats.bestAsk))}
                  />
                  {marketStats.spread !== null ? (
                    <CopyableStat
                      label={t('baseasset_quoteasset_spread')}
                      value={formatOrderPrice(marketStats.spread, quoteAsset || "")}
                      rawValue={getRawOrderPrice(marketStats.spread)}
                      onCopy={copy}
                      isCopied={isCopied(getRawOrderPrice(marketStats.spread))}
                    />
                  ) : (
                    <div>
                      <span className="text-gray-500">{t('baseasset_quoteasset_spread')}</span>
                      <div className="font-medium text-gray-900">—</div>
                    </div>
                  )}
                </>
              )}
              {tab === "sell" && (!marketStats || marketStats.bestAsk === null) && (
                <>
                  <div>
                    <span className="text-gray-500">{t('baseasset_quoteasset_ask')}</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('baseasset_quoteasset_spread')}</span>
                    <div className="font-medium text-gray-900">—</div>
                  </div>
                </>
              )}
              {tab === "history" && matchStats && (
                <>
                  <CopyableStat
                    label={t('common_last')}
                    value={formatOrderPrice(matchStats.lastPrice, quoteAsset || "")}
                    rawValue={getRawOrderPrice(matchStats.lastPrice)}
                    onCopy={copy}
                    isCopied={isCopied(getRawOrderPrice(matchStats.lastPrice))}
                  />
                  {matchStats.avgPrice !== null && (
                    <CopyableStat
                      label={t('common_avg')}
                      value={formatOrderPrice(matchStats.avgPrice, quoteAsset || "")}
                      rawValue={getRawOrderPrice(matchStats.avgPrice)}
                      onCopy={copy}
                      isCopied={isCopied(getRawOrderPrice(matchStats.avgPrice))}
                    />
                  )}
                </>
              )}
              {tab === "history" && !matchStats && (
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
          </div>

          {/* Section Header with Tabs */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              <TabButton isActive={tab === "buy"} onClick={() => setTab("buy")}>
                {t('common_buy')}
              </TabButton>
              <TabButton isActive={tab === "sell"} onClick={() => setTab("sell")}>
                {t('common_sell')}
              </TabButton>
              <TabButton isActive={tab === "history"} onClick={() => setTab("history")}>
                {t('common_history')}
              </TabButton>
            </div>
            <button type="button"
              onClick={() => navigate(`/market?tab=orders&mode=manage&search=${baseAsset}`)}
              className="text-xs text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded cursor-pointer"
            >
              {t('baseasset_quoteasset_my_orders')}
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
                  <div className="flex-1">{t('common_price')}</div>
                  <div className="flex-1">{t('common_amount')}</div>
                  <div className="flex-1 text-right">{t('common_total')}</div>
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
                  const hoverTitle = t('baseasset_quoteasset_avg_sum_sum', [String(formatAmount({ value: avgPrice, minimumFractionDigits: 8, maximumFractionDigits: 8 })), String(quoteAsset), String(formatAmount({ value: level.cumulativeBase, maximumFractionDigits: 8 })), String(baseAsset), String(formatAmount({ value: level.cumulativeQuote, minimumFractionDigits: 8, maximumFractionDigits: 8 })), String(quoteAsset)]);

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
              <EmptyState
                message={tab === 'buy'
                  ? t('baseasset_quoteasset_no_buy_orders', [String(baseAsset), String(quoteAsset)])
                  : t('baseasset_quoteasset_no_sell_orders', [String(baseAsset), String(quoteAsset)])}
                linkAction={{
                  label: t('common_create_new_order'),
                  onClick: () => {
                    const params = new URLSearchParams({
                      type: tab,
                      quote: quoteAsset || "XCP",
                    });
                    navigate(`/compose/order/${baseAsset}?${params.toString()}`);
                  },
                }}
              />
            )
          )}

          {tab === "history" && (
            matchesLoading ? <Spinner message={t('baseasset_quoteasset_loading_matches')} /> : matches.length > 0 ? (
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
            ) : !matchesError ? (
              <EmptyState message={t('baseasset_quoteasset_no_matches', [String(baseAsset), String(quoteAsset)])} />
            ) : null
          )}
          {tab === "history" && matchesError && (
            <div role="alert" className="py-3 text-center text-sm text-gray-600">
              <p>{matchesError.message}</p>
              <button type="button" onClick={retryMatches} className="mt-2 rounded px-3 py-1 text-blue-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{t('common_retry')}</button>
            </div>
          )}

          {/* Load more sentinel */}
          <div ref={loadMoreRef} className="py-2">
            {hasMore && !matchesLoading && !matchesError ? (
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
