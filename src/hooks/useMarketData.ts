import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DispenserDetails, fetchAddressDispensers, fetchAllDispensers, fetchAllOrders,
  fetchAssetDispensers, fetchAssetOrders, fetchOrders, type Order, type OrderDetails,
} from "@/core/counterparty/api";
import { isFixedRateDispenser } from "@/core/counterparty/oraclePolicy";
import { normalizeAssetQuery } from "@/core/format";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";

const PAGE_SIZE = 20;
const getDispenserKey = (d: DispenserDetails) => d.tx_hash;
const getOrderKey = (o: Order) => o.tx_hash;

interface UseMarketDataOptions {
  activeAddress: string | undefined;
  activeTab: number;
  viewMode: "explore" | "manage";
  searchQuery: string;
  inView: boolean;
}

/** Market lists share paging, cancellation and retry behavior, including asset searches. */
export function useMarketData({ activeAddress, activeTab, viewMode, searchQuery, inView }: UseMarketDataOptions) {
  const query = normalizeAssetQuery(searchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const explore = viewMode === "explore";
  const searchReady = !!query && query === debouncedQuery;
  const dispensersFetch = useCallback(
    (offset: number, limit: number) => fetchAllDispensers({ offset, limit, status: "open" }), []);
  const ordersFetch = useCallback(
    (offset: number, limit: number) => fetchAllOrders({ offset, limit, status: "open" }), []);
  const userDispensersFetch = useCallback(
    (offset: number, limit: number) => activeAddress
      ? fetchAddressDispensers(activeAddress, { offset, limit, status: "open" })
      : Promise.resolve({ result: [], result_count: 0 }), [activeAddress]);
  const userOrdersFetch = useCallback(
    (offset: number, limit: number) => activeAddress
      ? fetchOrders(activeAddress, { offset, limit, status: "open" })
      : Promise.resolve({ result: [], result_count: 0 }), [activeAddress]);
  const dispenserSearchFetch = useCallback(
    (offset: number, limit: number) => fetchAssetDispensers(debouncedQuery, { offset, limit, status: "open" }),
    [debouncedQuery]);
  const orderSearchFetch = useCallback(
    (offset: number, limit: number) => fetchAssetOrders(debouncedQuery, { offset, limit, status: "open" }),
    [debouncedQuery]);

  // Only the selected list spends requests. Each page remains bounded, but an
  // arbitrary total-row cap must not make later listings or positions disappear.
  const paging = { pageSize: PAGE_SIZE, maxItems: Infinity };
  const dispensers = usePaginatedFetch<DispenserDetails>({
    ...paging, fetchFn: dispensersFetch, getKey: getDispenserKey,
    enabled: activeTab === 0 && explore && !query,
  });
  const orders = usePaginatedFetch<OrderDetails>({
    ...paging, fetchFn: ordersFetch, getKey: getOrderKey,
    enabled: activeTab === 1 && explore && !query,
  });
  const userDispensers = usePaginatedFetch<DispenserDetails>({
    ...paging, fetchFn: userDispensersFetch, getKey: getDispenserKey,
    enabled: activeTab === 0 && !explore,
  });
  const userOrders = usePaginatedFetch<Order>({
    ...paging, fetchFn: userOrdersFetch, getKey: getOrderKey,
    enabled: activeTab === 1 && !explore,
  });
  const dispenserSearch = usePaginatedFetch<DispenserDetails>({
    ...paging, fetchFn: dispenserSearchFetch, getKey: getDispenserKey,
    enabled: activeTab === 0 && explore && searchReady,
  });
  const orderSearch = usePaginatedFetch<OrderDetails>({
    ...paging, fetchFn: orderSearchFetch, getKey: getOrderKey,
    enabled: activeTab === 1 && explore && searchReady,
  });

  const visibleDispensers = useMemo(() => dispensers.data.filter(isFixedRateDispenser), [dispensers.data]);
  const visibleUserDispensers = useMemo(() => userDispensers.data.filter(isFixedRateDispenser), [userDispensers.data]);
  const dispenserResults = useMemo(() => searchReady
    ? dispenserSearch.data.filter(isFixedRateDispenser) : [], [searchReady, dispenserSearch.data]);
  const orderResults = searchReady ? orderSearch.data : [];

  const filteredUserDispensers = useMemo(() => {
    const q = query.toLowerCase();
    return visibleUserDispensers.filter(d => !q || d.asset.toLowerCase().includes(q)
      || (d.asset_info?.asset_longname?.toLowerCase() || "").includes(q));
  }, [visibleUserDispensers, query]);
  const filteredUserOrders = useMemo(() => {
    const q = query.toLowerCase();
    return userOrders.data.filter(o => !q || o.give_asset.toLowerCase().includes(q)
      || o.get_asset.toLowerCase().includes(q)
      || (o.give_asset_info?.asset_longname?.toLowerCase() || "").includes(q)
      || (o.get_asset_info?.asset_longname?.toLowerCase() || "").includes(q));
  }, [userOrders.data, query]);

  const selected = activeTab === 0
    ? (explore ? (query ? dispenserSearch : dispensers) : userDispensers)
    : activeTab === 1 ? (explore ? (query ? orderSearch : orders) : userOrders) : null;
  const visibleCount = activeTab === 0
    ? (explore ? (query ? dispenserResults.length : visibleDispensers.length) : filteredUserDispensers.length)
    : (explore ? (query ? orderResults.length : orders.data.length) : filteredUserOrders.length);
  useEffect(() => {
    if (!selected || selected.error || selected.isLoading || selected.isFetchingMore || !selected.hasMore) return;
    if (explore && query && !searchReady) return;
    // Local position filters need the remaining pages even if the filter hides
    // every card. Oracle-only dispenser pages also cannot hide fixed listings.
    const filteredPageIsEmpty = selected.data.length > 0 && visibleCount === 0;
    if (!inView && !(!explore && query) && !filteredPageIsEmpty) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) selected.loadMore(); });
    return () => { cancelled = true; };
  }, [selected, visibleCount, explore, query, searchReady, inView]);

  return {
    dispensers: { ...dispensers, data: visibleDispensers },
    orders, userDispensers: { ...userDispensers, data: visibleUserDispensers }, userOrders,
    filteredUserDispensers, filteredUserOrders,
    dispenserSearch, orderSearch, dispenserResults, orderResults,
    dispenserSearchLoading: !!query && (!searchReady || dispenserSearch.isLoading),
    orderSearchLoading: !!query && (!searchReady || orderSearch.isLoading),
    dispenserSearchError: searchReady ? dispenserSearch.error?.message ?? null : null,
    orderSearchError: searchReady ? orderSearch.error?.message ?? null : null,
  };
}
