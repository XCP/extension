import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ManageDispenserCard } from "@/components/domain/dispenser/manage-dispenser-card";
import { MarketDispenserCard } from "@/components/domain/dispenser/market-dispenser-card";
import { PriceTicker } from "@/components/domain/price/price-ticker";
import { FaCheck, FaChevronRight, FaClipboard, FaLock, FiGlobe, FiUser } from "@/components/icons";
import { ManageOrderCard } from "@/components/ui/cards/manage-order-card";
import { MarketOrderCard } from "@/components/ui/cards/market-order-card";
import { PoolCard } from "@/components/ui/cards/pool-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { TabButton } from "@/components/ui/tab-button";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import {
  type DispenserDetails,
  fetchAddressPools,
  fetchPools,
  type OrderDetails,
  type Pool,
  type PoolPosition,
} from "@/core/counterparty/api";
import { normalizePoolPosition } from "@/core/counterparty/pool";
import { formatAddress, normalizeAssetQuery } from "@/core/format";
import { toNumber } from "@/core/numeric";
import { formatPrice } from "@/core/priceFormat";
import { getTradingPair } from "@/core/tradingPair";
import { useInView } from "@/hooks/useInView";
import { useMarketData } from "@/hooks/useMarketData";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { usePendingCancellations } from "@/hooks/usePendingStatus";

import { t } from '@/i18n';

// Constants
const COPY_FEEDBACK_MS = 2000;
const POOL_PAGE_SIZE = 20;

/**
 * Market page displays the XCP DEX marketplace with Dispensers, Orders, and Pools tabs.
 */
export default function MarketPage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderProps } = useHeader();
  const { settings } = useSettings();
  const { activeAddress, lockKeychain } = useWallet();
  const { btc, xcp } = useMarketPrices(settings.fiat);

  // Address copy state
  const [addressCopied, setAddressCopied] = useState(false);

  // Tab and view mode state from URL params
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const viewMode = searchParams.get("mode") === "manage" ? "manage" : "explore";
  const activeTab = tabParam === "dispensers" ? 0 : tabParam === "pools" ? 2 : 1;

  const TAB_NAMES = ["dispensers", "orders", "pools"] as const;
  const setActiveTab = (tab: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", TAB_NAMES[tab]!);
      return next;
    }, { replace: true });
  };

  const setViewMode = (mode: "explore" | "manage") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("mode", mode);
      return next;
    }, { replace: true });
  };

  // Unified search state synced with URL
  const searchQuery = searchParams.get("search") || "";

  const setSearchQuery = useCallback((query: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (query.trim()) {
        next.set("search", query);
      } else {
        next.delete("search");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Infinite scroll ref
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px", threshold: 0 });

  // Market data hook - encapsulates all data fetching and filtering
  const {
    dispensers,
    orders,
    userDispensers,
    userOrders,
    filteredUserDispensers,
    filteredUserOrders,
    dispenserResults,
    orderResults,
    dispenserSearchLoading,
    orderSearchLoading,
    dispenserSearchError,
    orderSearchError,
    handleDispenserSearch,
    handleOrderSearch,
    PAGE_SIZE,
  } = useMarketData({
    activeAddress: activeAddress?.address,
    activeTab,
    viewMode,
    searchQuery,
    inView,
  });

  // Which of this address's orders and dispensers already have their ending in the mempool, so
  // the Manage lists can stand their Cancel/Close buttons down instead of inviting a duplicate.
  // Gated to the two tabs that render those buttons — the read skips the response cache for
  // freshness, so it should not fire for a pools view that never consults it.
  const wantsCancellations = viewMode === "manage" && (activeTab === 0 || activeTab === 1);
  const { orderHashes: cancellingOrders, dispenserHashes: closingDispensers } =
    usePendingCancellations(wantsCancellations ? activeAddress?.address : undefined);

  // Pool state (explore = all pools, manage = user's LP positions)
  const [pools, setPools] = useState<Pool[]>([]);
  const [userPools, setUserPools] = useState<PoolPosition[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [poolsFetchingMore, setPoolsFetchingMore] = useState(false);
  const [poolsError, setPoolsError] = useState("");
  const [poolsOffset, setPoolsOffset] = useState(0);
  const [poolsHasMore, setPoolsHasMore] = useState(true);
  const [poolsInitialLoaded, setPoolsInitialLoaded] = useState(false);

  const appendPools = useCallback((newPools: Pool[]) => {
    setPools((current) => {
      const existing = new Set(current.map((pool) => pool.lp_asset));
      const unique = newPools.filter((pool) => !existing.has(pool.lp_asset));
      return [...current, ...unique];
    });
  }, []);

  const appendUserPools = useCallback((newPools: PoolPosition[]) => {
    setUserPools((current) => {
      const existing = new Set(current.map((pool) => pool.lp_asset));
      const unique = newPools.filter((pool) => !existing.has(pool.lp_asset));
      return [...current, ...unique];
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 2) return;

    let cancelled = false;
    setPools([]);
    setUserPools([]);
    setPoolsOffset(0);
    setPoolsHasMore(true);
    setPoolsInitialLoaded(false);
    setPoolsLoading(true);
    setPoolsError("");

    const loadPools = async () => {
      try {
        if (viewMode === "manage") {
          if (!activeAddress?.address) {
            setPoolsInitialLoaded(true);
            return;
          }
          const response = await fetchAddressPools(activeAddress.address, { limit: POOL_PAGE_SIZE, offset: 0 });
          if (cancelled) return;
          setUserPools(response.result.map(normalizePoolPosition));
          setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && response.result.length < response.result_count);
        } else {
          const response = await fetchPools({ limit: POOL_PAGE_SIZE, offset: 0 });
          if (cancelled) return;
          setPools(response.result);
          setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && response.result.length < response.result_count);
        }
        setPoolsOffset(POOL_PAGE_SIZE);
        setPoolsInitialLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setPoolsError(err instanceof Error ? err.message : t('market_failed_to_load_pools'));
          setPoolsInitialLoaded(true);
        }
      } finally {
        if (!cancelled) setPoolsLoading(false);
      }
    };

    loadPools();

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address, activeTab, viewMode]);

  useEffect(() => {
    if (activeTab !== 2 || !inView || !poolsHasMore || poolsFetchingMore || poolsLoading || !poolsInitialLoaded) {
      return;
    }
    if (viewMode === "manage" && !activeAddress?.address) return;

    let cancelled = false;

    const loadMorePools = async () => {
      setPoolsFetchingMore(true);
      setPoolsError("");

      try {
        if (viewMode === "manage") {
          const response = await fetchAddressPools(activeAddress!.address, { limit: POOL_PAGE_SIZE, offset: poolsOffset });
          if (cancelled) return;
          appendUserPools(response.result.map(normalizePoolPosition));
          setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && poolsOffset + response.result.length < response.result_count);
        } else {
          const response = await fetchPools({ limit: POOL_PAGE_SIZE, offset: poolsOffset });
          if (cancelled) return;
          appendPools(response.result);
          setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && poolsOffset + response.result.length < response.result_count);
        }
        setPoolsOffset((current) => current + POOL_PAGE_SIZE);
      } catch (err) {
        if (!cancelled) {
          setPoolsError(err instanceof Error ? err.message : t('market_failed_to_load_more_pools'));
          setPoolsHasMore(false);
        }
      } finally {
        if (!cancelled) setPoolsFetchingMore(false);
      }
    };

    loadMorePools();

    return () => {
      cancelled = true;
    };
  }, [
    activeAddress,
    activeTab,
    appendPools,
    appendUserPools,
    inView,
    poolsFetchingMore,
    poolsHasMore,
    poolsInitialLoaded,
    poolsLoading,
    poolsOffset,
    viewMode,
  ]);

  const filterPools = <T extends Pool>(poolList: T[]): T[] => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return poolList;
    return poolList.filter((pool) =>
      pool.asset_a.toUpperCase().includes(q) ||
      pool.asset_b.toUpperCase().includes(q) ||
      pool.lp_asset.toUpperCase().includes(q)
    );
  };
  const filteredPools = filterPools(pools);
  const filteredUserPools = filterPools(userPools);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('common_market'),
      onBack: () => navigate("/index"),
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockKeychain();
          navigate("/keychain/unlock");
        },
        ariaLabel: t('common_lock_keychain'),
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, lockKeychain]);

  // Address copy feedback timer
  useEffect(() => {
    if (addressCopied) {
      const timer = setTimeout(() => setAddressCopied(false), COPY_FEEDBACK_MS);
      return () => clearTimeout(timer);
    }
  }, [addressCopied]);

  // Handlers
  const handleCopyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress.address).then(() => {
      setAddressCopied(true);
    });
  };

  const handleAddressSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate("/addresses", { state: { returnTo: location.pathname + location.search } });
  };

  const handleDispenserClick = (dispenser: DispenserDetails) => {
    navigate(`/market/dispensers/${dispenser.asset}`);
  };

  const handleOrderClick = (order: OrderDetails) => {
    const [baseAsset, quoteAsset] = getTradingPair(order.give_asset, order.get_asset);
    navigate(`/market/orders/${baseAsset}/${quoteAsset}`);
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-grow min-h-0">
        {/* Fixed Header */}
        <div className="p-4 pb-0 flex-shrink-0">
          {/* Address Selector */}
          {activeAddress && (
            // Not a RadioGroup: one option, an onChange that did nothing, and `checked` always
            // true — it existed so the ternary would pick the selected styling. Copying the
            // address is a button, and saying so is what lets the keyboard reach it. The classes
            // are the branch that always won, so this renders identically.
            // Copying and choosing another address are two buttons side by side, not
            // one inside the other. Neither needs to guard the other's keypresses.
            <div className="relative w-full rounded bg-blue-600 text-white shadow-md mb-4">
              <button
                type="button"
                className="block w-full rounded p-4 cursor-pointer text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={handleCopyAddress}
                aria-label={t('common_current_address')}
              >
                <div className="text-sm mb-1 font-medium">{activeAddress.name}</div>
                <div className="flex justify-center items-center">
                  <span className="font-mono text-sm">{formatAddress(activeAddress.address)}</span>
                  {addressCopied ? (
                    <FaCheck className="ml-2 text-green-500" aria-hidden="true" />
                  ) : (
                    <FaClipboard className="ml-2" aria-hidden="true" />
                  )}
                </div>
              </button>
              <div className="absolute top-1/2 right-4 -translate-y-1/2">
                <button
                  type="button"
                  className="block py-6 px-3 -m-2 cursor-pointer hover:bg-white/5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={handleAddressSelection}
                  aria-label={t('common_select_another_address')}
                >
                  <FaChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <PriceTicker
            btc={btc}
            xcp={xcp}
            currency={settings.fiat}
            onBtcClick={() => navigate("/market/btc")}
            onXcpClick={() => navigate("/market/xcp")}
            className="mb-4"
          />

          {/* Tab Header */}
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <div className="flex space-x-4" role="tablist" aria-label={t('market_sections')}>
                {(["Dispensers", "Orders", "Pools"] as const).map((label, idx) => (
                  <button type="button"
                    key={label}
                    role="tab"
                    aria-selected={activeTab === idx}
                    className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded ${
                      activeTab === idx ? "underline" : ""
                    }`}
                    onClick={() => setActiveTab(idx)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* View Mode Toggle */}
              <div className="flex gap-1" role="tablist" aria-label={t('market_view_mode')}>
                <TabButton isActive={viewMode === "explore"} onClick={() => setViewMode("explore")}>
                  <FiGlobe className="size-3.5" aria-hidden="true" />
                </TabButton>
                <TabButton isActive={viewMode === "manage"} onClick={() => setViewMode("manage")}>
                  <FiUser className="size-3.5" aria-hidden="true" />
                </TabButton>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4">
          {activeTab === 0 && (
            <div className="space-y-3">
              {viewMode === "explore" ? (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onSearch={handleDispenserSearch}
                    placeholder={t('market_search_asset_dispensers')}
                    name="dispenser-search"
                    isLoading={dispenserSearchLoading}
                    showClearButton
                    className="mt-0.5"
                  />

                  {isSearching ? (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">
                        {t('market_results_for', [String(normalizeAssetQuery(searchQuery))])}
                      </p>
                      {dispenserSearchLoading ? (
                        <Spinner message={t('market_searching')} />
                      ) : dispenserSearchError ? (
                        <EmptyState message={dispenserSearchError} />
                      ) : dispenserResults.length > 0 ? (
                        <div className="space-y-2">
                          {dispenserResults.map((d) => (
                            <MarketDispenserCard
                              key={d.tx_hash}
                              dispenser={d}
                              formattedPrice={formatPrice(toNumber(d.satoshirate), settings.priceUnit, btc, settings.fiat)}
                              onClick={() => handleDispenserClick(d)}
                            />
                          ))}
                          {dispenserResults.length >= PAGE_SIZE && (
                            <button type="button"
                              onClick={() => navigate(`/market/dispensers/${normalizeAssetQuery(searchQuery)}`)}
                              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            >
                              {t('market_view_all_dispensers_for', [String(normalizeAssetQuery(searchQuery))])}
                            </button>
                          )}
                        </div>
                      ) : (
                        <EmptyState message={t('market_no_open_dispensers_for', [String(normalizeAssetQuery(searchQuery))])} />
                      )}
                    </div>
                  ) : dispensers.isLoading ? (
                    <Spinner message={t('common_loading_dispensers')} />
                  ) : dispensers.error ? (
                    <EmptyState message={t('market_failed_to_load_dispensers')} />
                  ) : dispensers.data.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {dispensers.data.map((d) => (
                          <MarketDispenserCard
                            key={d.tx_hash}
                            dispenser={d}
                            formattedPrice={formatPrice(toNumber(d.satoshirate), settings.priceUnit, btc, settings.fiat)}
                            onClick={() => handleDispenserClick(d)}
                          />
                        ))}
                      </div>
                      <div ref={loadMoreRef} className="flex justify-center py-2">
                        {dispensers.isFetchingMore && <Spinner />}
                      </div>
                    </>
                  ) : (
                    <EmptyState message={t('market_no_open_dispensers_found')} />
                  )}
                </>
              ) : (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t('market_filter_your_dispensers')}
                    name="dispenser-filter"
                    showClearButton
                    className="mt-0.5"
                  />
                  {userDispensers.isLoading ? (
                    <Spinner message={t('market_loading_your_dispensers')} />
                  ) : userDispensers.error ? (
                    <EmptyState message={t('market_failed_to_load_your_dispensers')} />
                  ) : (
                    <>
                      {filteredUserDispensers.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {filteredUserDispensers.map((d) => (
                              <ManageDispenserCard key={d.tx_hash} dispenser={d} isClosing={closingDispensers.has(d.tx_hash)} />
                            ))}
                          </div>
                          <div ref={loadMoreRef} className="flex justify-center py-2">
                            {userDispensers.isFetchingMore && <Spinner />}
                          </div>
                        </>
                      ) : searchQuery.trim() ? (
                        <EmptyState message={t('market_no_dispensers_matching', [String(searchQuery)])} />
                      ) : (
                        <EmptyState message={t('market_you_don_t_have_any')} />
                      )}
                      <button type="button"
                        onClick={() => navigate(searchQuery.trim() ? `/compose/dispenser/${searchQuery.toUpperCase()}` : "/compose/dispenser")}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        {t('common_create_new_dispenser')}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 1 && (
            <div className="space-y-3">
              {viewMode === "explore" ? (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onSearch={handleOrderSearch}
                    placeholder={t('market_search_asset_orders')}
                    name="order-search"
                    isLoading={orderSearchLoading}
                    showClearButton
                    className="mt-0.5"
                  />

                  {isSearching ? (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">
                        {t('market_results_for', [String(normalizeAssetQuery(searchQuery))])}
                      </p>
                      {orderSearchLoading ? (
                        <Spinner message={t('market_searching')} />
                      ) : orderSearchError ? (
                        <EmptyState message={orderSearchError} />
                      ) : orderResults.length > 0 ? (
                        <div className="space-y-2">
                          {orderResults.map((o) => (
                            <MarketOrderCard
                              key={o.tx_hash}
                              order={o}
                              onClick={() => handleOrderClick(o)}
                            />
                          ))}
                          {orderResults.length >= PAGE_SIZE && (
                            <button type="button"
                              onClick={() => navigate(`/market/orders/${searchQuery.toUpperCase()}/XCP`)}
                              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            >
                              {t('market_view_all_orders_for', [String(searchQuery.toUpperCase())])}
                            </button>
                          )}
                        </div>
                      ) : (
                        <EmptyState message={t('market_no_open_orders_for', [String(searchQuery.toUpperCase())])} />
                      )}
                    </div>
                  ) : orders.isLoading ? (
                    <Spinner message={t('market_loading_orders')} />
                  ) : orders.error ? (
                    <EmptyState message={t('market_failed_to_load_orders')} />
                  ) : orders.data.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {orders.data.map((o) => (
                          <MarketOrderCard
                            key={o.tx_hash}
                            order={o}
                            onClick={() => handleOrderClick(o)}
                          />
                        ))}
                      </div>
                      <div ref={loadMoreRef} className="flex justify-center py-2">
                        {orders.isFetchingMore && <Spinner />}
                      </div>
                    </>
                  ) : (
                    <EmptyState message={t('market_no_open_orders_found')} />
                  )}
                </>
              ) : (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t('market_filter_your_orders')}
                    name="order-filter"
                    showClearButton
                    className="mt-0.5"
                  />
                  {userOrders.isLoading ? (
                    <Spinner message={t('market_loading_your_orders')} />
                  ) : userOrders.error ? (
                    <EmptyState message={t('market_failed_to_load_your_orders')} />
                  ) : (
                    <>
                      {filteredUserOrders.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {filteredUserOrders.map((o) => (
                              <ManageOrderCard key={o.tx_hash} order={o} isCancelling={cancellingOrders.has(o.tx_hash)} />
                            ))}
                          </div>
                          <div ref={loadMoreRef} className="flex justify-center py-2">
                            {userOrders.isFetchingMore && <Spinner />}
                          </div>
                        </>
                      ) : searchQuery.trim() ? (
                        <EmptyState message={t('market_no_orders_matching', [String(searchQuery)])} />
                      ) : (
                        <EmptyState message={t('market_you_don_t_have_any_2')} />
                      )}
                      <button type="button"
                        onClick={() => navigate(searchQuery.trim() ? `/compose/order/${searchQuery.toUpperCase()}` : "/compose/order")}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        {t('common_create_new_order')}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 2 && (
            <div className="space-y-3">
              {viewMode === "explore" ? (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t('market_search_pools')}
                    name="pool-filter"
                    showClearButton
                    className="mt-0.5"
                  />
                  {poolsLoading ? (
                    <Spinner message={t('market_loading_pools')} />
                  ) : poolsError ? (
                    <EmptyState message={poolsError} />
                  ) : filteredPools.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {filteredPools.map((pool) => (
                          <PoolCard
                            key={pool.lp_asset}
                            pool={pool}
                            onClick={() => navigate(`/pools/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`)}
                          />
                        ))}
                      </div>
                      <div ref={loadMoreRef} className="flex justify-center py-2">
                        {poolsFetchingMore && <Spinner />}
                      </div>
                    </>
                  ) : (
                    <EmptyState message={searchQuery.trim() ? t('market_no_pools_matching', [String(searchQuery)]) : t('market_no_pools_found')} />
                  )}
                  <button type="button"
                    onClick={() => navigate(searchQuery.trim() ? `/compose/pool/deposit/${searchQuery.toUpperCase()}/XCP` : "/compose/pool/deposit")}
                    className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    {t('market_enter_pool')}
                  </button>
                </>
              ) : (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t('market_search_your_pools')}
                    name="pool-manage-filter"
                    showClearButton
                    className="mt-0.5"
                  />
                  {poolsLoading ? (
                    <Spinner message={t('market_loading_your_pools')} />
                  ) : poolsError ? (
                    <EmptyState message={poolsError} />
                  ) : (
                    <>
                      {filteredUserPools.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {filteredUserPools.map((pool) => (
                              <PoolCard
                                key={pool.lp_asset}
                                pool={pool}
                                onClick={() => navigate(`/pools/${encodeURIComponent(pool.lp_asset)}`)}
                              />
                            ))}
                          </div>
                          <div ref={loadMoreRef} className="flex justify-center py-2">
                            {poolsFetchingMore && <Spinner />}
                          </div>
                        </>
                      ) : searchQuery.trim() ? (
                        <EmptyState message={t('market_no_pool_positions_matching', [String(searchQuery)])} />
                      ) : (
                        <EmptyState message={t('market_you_don_t_have_any_3')} />
                      )}
                      <button type="button"
                        onClick={() => navigate(searchQuery.trim() ? `/compose/pool/deposit/${searchQuery.toUpperCase()}/XCP` : "/compose/pool/deposit")}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        {t('market_enter_pool')}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
