import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
import {
  fetchAllDispensers,
  fetchAllOrders,
  fetchAssetDispensers,
  fetchAssetOrders,
  fetchAddressDispensers,
  fetchOrders,
  type DispenserDetails,
  type OrderDetails,
  type Order,
} from "@/utils/blockchain/counterparty/api";

// Key extractors for deduplication
const getDispenserKey = (d: DispenserDetails) => d.tx_hash;
const getOrderKey = (o: OrderDetails) => o.tx_hash;
const getUserDispenserKey = (d: DispenserDetails) => d.tx_hash;
const getUserOrderKey = (o: Order) => o.tx_hash;

// Constants
const PAGE_SIZE = 20;
const MAX_ITEMS = 100;

interface UseMarketDataOptions {
  activeAddress: string | undefined;
  activeTab: number;
  viewMode: "explore" | "manage";
  searchQuery: string;
  inView: boolean;
}

interface UseMarketDataReturn {
  // Explore mode data
  dispensers: ReturnType<typeof usePaginatedFetch<DispenserDetails>>;
  orders: ReturnType<typeof usePaginatedFetch<OrderDetails>>;

  // Manage mode data
  userDispensers: ReturnType<typeof usePaginatedFetch<DispenserDetails>>;
  userOrders: ReturnType<typeof usePaginatedFetch<Order>>;
  filteredUserDispensers: DispenserDetails[];
  filteredUserOrders: Order[];

  // Search results
  dispenserResults: DispenserDetails[];
  orderResults: OrderDetails[];
  dispenserSearchLoading: boolean;
  orderSearchLoading: boolean;
  dispenserSearchError: string | null;
  orderSearchError: string | null;

  // Search handlers
  handleDispenserSearch: (query: string) => Promise<void>;
  handleOrderSearch: (query: string) => Promise<void>;

  // Constants
  PAGE_SIZE: number;
}

/**
 * Custom hook that encapsulates all market data fetching and filtering logic.
 * Handles explore mode (global dispensers/orders), manage mode (user's dispensers/orders),
 * and search functionality.
 */
export function useMarketData({
  activeAddress,
  activeTab,
  viewMode,
  searchQuery,
  inView,
}: UseMarketDataOptions): UseMarketDataReturn {
  // Search results state
  const [dispenserResults, setDispenserResults] = useState<DispenserDetails[]>([]);
  const [dispenserSearchLoading, setDispenserSearchLoading] = useState(false);
  const [dispenserSearchError, setDispenserSearchError] = useState<string | null>(null);
  const [orderResults, setOrderResults] = useState<OrderDetails[]>([]);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);
  const [orderSearchError, setOrderSearchError] = useState<string | null>(null);

  // Paginated data fetchers - memoized to prevent effect re-runs
  const dispensersFetch = useCallback(
    (offset: number, limit: number) => fetchAllDispensers({ offset, limit, status: "open" }),
    []
  );
  const ordersFetch = useCallback(
    (offset: number, limit: number) => fetchAllOrders({ offset, limit, status: "open" }),
    []
  );
  const userDispensersFetch = useCallback(
    (offset: number, limit: number) =>
      activeAddress
        ? fetchAddressDispensers(activeAddress, { offset, limit, status: "open" })
        : Promise.resolve({ result: [], next_cursor: null, result_count: 0 }),
    [activeAddress]
  );
  const userOrdersFetch = useCallback(
    (offset: number, limit: number) =>
      activeAddress
        ? fetchOrders(activeAddress, { offset, limit, status: "open" })
        : Promise.resolve({ result: [], next_cursor: null, result_count: 0 }),
    [activeAddress]
  );

  // Paginated data hooks
  const dispensers = usePaginatedFetch<DispenserDetails>({
    fetchFn: dispensersFetch,
    getKey: getDispenserKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });
  const orders = usePaginatedFetch<OrderDetails>({
    fetchFn: ordersFetch,
    getKey: getOrderKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });
  const userDispensers = usePaginatedFetch<DispenserDetails>({
    fetchFn: userDispensersFetch,
    getKey: getUserDispenserKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });
  const userOrders = usePaginatedFetch<Order>({
    fetchFn: userOrdersFetch,
    getKey: getUserOrderKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });

  // Memoized filtered data for manage mode
  const filteredUserDispensers = useMemo(() => {
    if (!searchQuery.trim()) return userDispensers.data;
    const query = searchQuery.toLowerCase();
    return userDispensers.data.filter((d) => {
      const asset = d.asset.toLowerCase();
      const longname = d.asset_info?.asset_longname?.toLowerCase() || "";
      return asset.includes(query) || longname.includes(query);
    });
  }, [userDispensers.data, searchQuery]);

  const filteredUserOrders = useMemo(() => {
    if (!searchQuery.trim()) return userOrders.data;
    const query = searchQuery.toLowerCase();
    return userOrders.data.filter((o) =>
      o.give_asset.toLowerCase().includes(query) ||
      o.get_asset.toLowerCase().includes(query)
    );
  }, [userOrders.data, searchQuery]);

  // Search handlers
  const handleDispenserSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setDispenserResults([]);
      setDispenserSearchLoading(false);
      setDispenserSearchError(null);
      return;
    }
    setDispenserSearchLoading(true);
    setDispenserSearchError(null);
    try {
      const res = await fetchAssetDispensers(query.toUpperCase(), { status: "open", limit: PAGE_SIZE });
      setDispenserResults(res.result);
    } catch (err) {
      console.error("Failed to search dispensers:", err);
      setDispenserResults([]);
      setDispenserSearchError("Failed to search dispensers");
    } finally {
      setDispenserSearchLoading(false);
    }
  }, []);

  const handleOrderSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setOrderResults([]);
      setOrderSearchLoading(false);
      setOrderSearchError(null);
      return;
    }
    setOrderSearchLoading(true);
    setOrderSearchError(null);
    try {
      const res = await fetchAssetOrders(query.toUpperCase(), { status: "open", limit: PAGE_SIZE });
      setOrderResults(res.result);
    } catch (err) {
      console.error("Failed to search orders:", err);
      setOrderResults([]);
      setOrderSearchError("Failed to search orders");
    } finally {
      setOrderSearchLoading(false);
    }
  }, []);

  // Trigger search when searchQuery changes in explore mode
  useEffect(() => {
    if (searchQuery && viewMode === "explore") {
      if (activeTab === 0) {
        handleDispenserSearch(searchQuery);
      } else {
        handleOrderSearch(searchQuery);
      }
    }
  }, [searchQuery, activeTab, viewMode, handleDispenserSearch, handleOrderSearch]);

  // Track previous inView state to only trigger on rising edge
  const prevInViewRef = useRef(false);

  // Trigger load more when scrolled into view
  useEffect(() => {
    const wasInView = prevInViewRef.current;
    prevInViewRef.current = inView;

    if (!inView || wasInView) return;

    if (viewMode === "explore") {
      if (activeTab === 0) {
        dispensers.loadMore();
      } else {
        orders.loadMore();
      }
    } else {
      if (activeTab === 0) {
        userDispensers.loadMore();
      } else {
        userOrders.loadMore();
      }
    }
  }, [inView, activeTab, viewMode, dispensers, orders, userDispensers, userOrders]);

  return {
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
  };
}
