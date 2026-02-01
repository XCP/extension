import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Radio, RadioGroup } from "@headlessui/react";
import { FaChevronRight, FaClipboard, FaCheck } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { MarketDispenserCard } from "@/components/ui/cards/market-dispenser-card";
import { MarketOrderCard } from "@/components/ui/cards/market-order-card";
import { MarketDispenseCard } from "@/components/ui/cards/market-dispense-card";
import { MarketMatchCard } from "@/components/ui/cards/market-match-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PriceTicker } from "@/components/domain/price/price-ticker";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { formatAddress } from "@/utils/format";
import { useInView } from "@/hooks/useInView";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";
import {
  fetchAllDispensers,
  fetchAllDispenses,
  fetchAllOrders,
  fetchAllOrderMatches,
  fetchAssetDispensers,
  fetchAssetOrders,
  type DispenserDetails,
  type OrderDetails,
  type OrderMatch,
  type Dispense,
} from "@/utils/blockchain/counterparty/api";
import { formatPrice } from "@/utils/price-format";
import type { ReactElement } from "react";

// Key extractors for deduplication - defined outside component to ensure stable references
const getDispenserKey = (d: DispenserDetails) => d.tx_hash;
const getDispenseKey = (d: Dispense) => d.tx_hash;
const getOrderKey = (o: OrderDetails) => o.tx_hash;
const getMatchKey = (m: OrderMatch) => m.id;

// Constants
const PAGE_SIZE = 20;
const MAX_ITEMS = 100;
const COPY_FEEDBACK_MS = 2000;

/**
 * Market page displays the XCP DEX marketplace with Dispensers and Orders tabs.
 */
export default function MarketPage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderProps } = useHeader();
  const { settings } = useSettings();
  const { activeAddress } = useWallet();
  const { btc, xcp } = useMarketPrices(settings.fiat);

  // Address copy state
  const [addressCopied, setAddressCopied] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  const [dispenserSubTab, setDispenserSubTab] = useState<"open" | "history">("open");
  const [orderSubTab, setOrderSubTab] = useState<"open" | "history">("open");

  // Search state - dispensers
  const [dispenserQuery, setDispenserQuery] = useState("");
  const [dispenserResults, setDispenserResults] = useState<DispenserDetails[]>([]);
  const [dispenserSearchLoading, setDispenserSearchLoading] = useState(false);

  // Search state - orders
  const [orderQuery, setOrderQuery] = useState("");
  const [orderResults, setOrderResults] = useState<OrderDetails[]>([]);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);

  // Copy feedback state
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Infinite scroll ref
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px", threshold: 0 });

  // Paginated data fetchers - memoized to prevent effect re-runs
  const dispensersFetch = useCallback(
    (offset: number, limit: number) => fetchAllDispensers({ offset, limit, status: "open" }),
    []
  );
  const dispensesFetch = useCallback(
    (offset: number, limit: number) => fetchAllDispenses({ offset, limit }),
    []
  );
  const ordersFetch = useCallback(
    (offset: number, limit: number) => fetchAllOrders({ offset, limit, status: "open" }),
    []
  );
  const matchesFetch = useCallback(
    (offset: number, limit: number) => fetchAllOrderMatches({ offset, limit }),
    []
  );

  // Paginated data hooks with stable key extractors
  const dispensers = usePaginatedFetch<DispenserDetails>({
    fetchFn: dispensersFetch,
    getKey: getDispenserKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });
  const dispenses = usePaginatedFetch<Dispense>({
    fetchFn: dispensesFetch,
    getKey: getDispenseKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });
  const orders = usePaginatedFetch<OrderDetails>({
    fetchFn: ordersFetch,
    getKey: getOrderKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });
  const matches = usePaginatedFetch<OrderMatch>({
    fetchFn: matchesFetch,
    getKey: getMatchKey,
    pageSize: PAGE_SIZE,
    maxItems: MAX_ITEMS,
  });

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Exchange",
      onBack: () => navigate("/index"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  // Address copy feedback timer
  useEffect(() => {
    if (addressCopied) {
      const timer = setTimeout(() => setAddressCopied(false), COPY_FEEDBACK_MS);
      return () => clearTimeout(timer);
    }
  }, [addressCopied]);

  // Address handlers
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

  // Search handlers - called by SearchInput's debounced onSearch
  const handleDispenserSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setDispenserResults([]);
      setDispenserSearchLoading(false);
      return;
    }
    setDispenserSearchLoading(true);
    try {
      const res = await fetchAssetDispensers(query.toUpperCase(), { status: "open", limit: PAGE_SIZE });
      setDispenserResults(res.result);
    } catch (err) {
      console.error("Failed to search dispensers:", err);
      setDispenserResults([]);
    } finally {
      setDispenserSearchLoading(false);
    }
  }, []);

  const handleOrderSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setOrderResults([]);
      setOrderSearchLoading(false);
      return;
    }
    setOrderSearchLoading(true);
    try {
      const res = await fetchAssetOrders(query.toUpperCase(), { status: "open", limit: PAGE_SIZE });
      setOrderResults(res.result);
    } catch (err) {
      console.error("Failed to search orders:", err);
      setOrderResults([]);
    } finally {
      setOrderSearchLoading(false);
    }
  }, []);

  // Extract loadMore functions for useEffect dependency array
  const loadMoreDispensers = dispensers.loadMore;
  const loadMoreDispenses = dispenses.loadMore;
  const loadMoreOrders = orders.loadMore;
  const loadMoreMatches = matches.loadMore;

  // Track previous inView state to only trigger on rising edge
  const prevInViewRef = useRef(false);

  // Trigger load more when scrolled into view (only on rising edge: false -> true)
  useEffect(() => {
    const wasInView = prevInViewRef.current;
    prevInViewRef.current = inView;

    if (!inView || wasInView) return;

    if (activeTab === 0) {
      if (dispenserSubTab === "open") {
        loadMoreDispensers();
      } else {
        loadMoreDispenses();
      }
    } else {
      if (orderSubTab === "open") {
        loadMoreOrders();
      } else {
        loadMoreMatches();
      }
    }
  }, [inView, activeTab, dispenserSubTab, orderSubTab, loadMoreDispensers, loadMoreDispenses, loadMoreOrders, loadMoreMatches]);

  // Copy to clipboard handler
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTx(text);
      setTimeout(() => setCopiedTx(null), COPY_FEEDBACK_MS);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Navigation handlers
  const handleDispenserClick = (dispenser: DispenserDetails) => {
    navigate(`/market/dispensers/${dispenser.asset}`);
  };

  const handleOrderClick = (order: OrderDetails) => {
    navigate(`/market/orders/${order.give_asset}/${order.get_asset}`);
  };

  const isSearchingDispensers = dispenserQuery.trim().length > 0;
  const isSearchingOrders = orderQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex flex-col flex-grow min-h-0">
        {/* Fixed Header */}
        <div className="p-4 pb-0 flex-shrink-0">
          {/* Address Selector */}
          {activeAddress && (
            <RadioGroup value={activeAddress} onChange={() => {}} className="mb-4">
              <Radio value={activeAddress}>
                {({ checked }) => (
                  <div
                    className={`relative w-full rounded p-4 cursor-pointer ${
                      checked ? "bg-blue-600 text-white shadow-md" : "bg-blue-200 hover:bg-blue-300 text-gray-800"
                    }`}
                    onClick={handleCopyAddress}
                    aria-label="Current address"
                  >
                    <div className="absolute top-1/2 right-4 -translate-y-1/2">
                      <div
                        className="py-6 px-3 -m-2 cursor-pointer hover:bg-white/5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        onClick={handleAddressSelection}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddressSelection(e as unknown as React.MouseEvent);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label="Select another address"
                      >
                        <FaChevronRight className="size-4" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="text-sm mb-1 font-medium text-center">{activeAddress.name}</div>
                    <div className="flex justify-center items-center">
                      <span className="font-mono text-sm">{formatAddress(activeAddress.address)}</span>
                      {addressCopied ? (
                        <FaCheck className="ml-2 text-green-500" aria-hidden="true" />
                      ) : (
                        <FaClipboard className="ml-2" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                )}
              </Radio>
            </RadioGroup>
          )}

          <PriceTicker
            btc={btc}
            xcp={xcp}
            currency={settings.fiat}
            onBtcClick={() => navigate("/market/btc")}
            onXcpClick={() => navigate("/market/dispensers/XCP")}
            className="mb-4"
          />

          {/* Tab Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex space-x-4" role="tablist" aria-label="Market sections">
              <button
                role="tab"
                aria-selected={activeTab === 1}
                className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded ${
                  activeTab === 1 ? "underline" : ""
                }`}
                onClick={() => setActiveTab(1)}
              >
                Orders
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 0}
                className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded ${
                  activeTab === 0 ? "underline" : ""
                }`}
                onClick={() => setActiveTab(0)}
              >
                Dispensers
              </button>
            </div>
            {/* Sub-tabs */}
            <div className="flex gap-1" role="tablist" aria-label="View filter">
              {activeTab === 0 ? (
                <>
                  <button
                    role="tab"
                    aria-selected={dispenserSubTab === "open"}
                    onClick={() => setDispenserSubTab("open")}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      dispenserSubTab === "open"
                        ? "bg-gray-200 text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Open
                  </button>
                  <button
                    role="tab"
                    aria-selected={dispenserSubTab === "history"}
                    onClick={() => setDispenserSubTab("history")}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      dispenserSubTab === "history"
                        ? "bg-gray-200 text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    History
                  </button>
                </>
              ) : (
                <>
                  <button
                    role="tab"
                    aria-selected={orderSubTab === "open"}
                    onClick={() => setOrderSubTab("open")}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      orderSubTab === "open"
                        ? "bg-gray-200 text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Open
                  </button>
                  <button
                    role="tab"
                    aria-selected={orderSubTab === "history"}
                    onClick={() => setOrderSubTab("history")}
                    className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      orderSubTab === "history"
                        ? "bg-gray-200 text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    History
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4">
        {activeTab === 0 && (
          <div className="space-y-4">
            {/* Search Bar */}
            <SearchInput
              value={dispenserQuery}
              onChange={setDispenserQuery}
              onSearch={handleDispenserSearch}
              placeholder="Search asset dispensers..."
              name="dispenser-search"
              isLoading={dispenserSearchLoading}
              showClearButton
              className="mt-0.5"
            />

            {/* Content */}
            {isSearchingDispensers ? (
              <div>
                <p className="text-sm text-gray-500 mb-2">
                  Results for "{dispenserQuery.toUpperCase()}"
                </p>
                {dispenserSearchLoading ? (
                  <Spinner message="Searching..." />
                ) : dispenserResults.length > 0 ? (
                  <div className="space-y-2">
                    {dispenserResults.map((d) => (
                      <MarketDispenserCard
                        key={d.tx_hash}
                        dispenser={d}
                        formattedPrice={formatPrice(d.satoshirate, settings.priceUnit, btc, settings.fiat)}
                        onClick={() => handleDispenserClick(d)}
                        onAssetClick={() => navigate(`/market/dispensers/${d.asset}`)}
                      />
                    ))}
                    {dispenserResults.length >= PAGE_SIZE && (
                      <button
                        onClick={() => navigate(`/market/dispensers/${dispenserQuery.toUpperCase()}`)}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        View all dispensers for {dispenserQuery.toUpperCase()} →
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState message={`No open dispensers for ${dispenserQuery.toUpperCase()}`} />
                )}
              </div>
            ) : dispenserSubTab === "open" ? (
              dispensers.isLoading ? (
                <Spinner message="Loading dispensers…" />
              ) : dispensers.error ? (
                <EmptyState message="Failed to load dispensers" />
              ) : dispensers.data.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {dispensers.data.map((d) => (
                      <MarketDispenserCard
                        key={d.tx_hash}
                        dispenser={d}
                        formattedPrice={formatPrice(d.satoshirate, settings.priceUnit, btc, settings.fiat)}
                        onClick={() => handleDispenserClick(d)}
                        onAssetClick={() => navigate(`/market/dispensers/${d.asset}`)}
                      />
                    ))}
                  </div>
                  <div ref={loadMoreRef} className="flex justify-center py-2">
                    {dispensers.isFetchingMore && <Spinner />}
                  </div>
                </>
              ) : (
                <EmptyState message="No open dispensers found" />
              )
            ) : (
              dispenses.isLoading ? (
                <Spinner message="Loading…" />
              ) : dispenses.error ? (
                <EmptyState message="Failed to load history" />
              ) : dispenses.data.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {dispenses.data.map((d) => (
                      <MarketDispenseCard
                        key={d.tx_hash}
                        dispense={d}
                        onCopyTx={copyToClipboard}
                        isCopied={copiedTx === d.tx_hash}
                        onAssetClick={() => navigate(`/market/dispensers/${d.asset}`)}
                      />
                    ))}
                  </div>
                  <div ref={loadMoreRef} className="flex justify-center py-2">
                    {dispenses.isFetchingMore && <Spinner />}
                  </div>
                </>
              ) : (
                <EmptyState message="No recent dispenses" />
              )
            )}
          </div>
        )}

        {activeTab === 1 && (
          <div className="space-y-4">
            {/* Search Bar */}
            <SearchInput
              value={orderQuery}
              onChange={setOrderQuery}
              onSearch={handleOrderSearch}
              placeholder="Search asset orders..."
              name="order-search"
              isLoading={orderSearchLoading}
              showClearButton
              className="mt-0.5"
            />

            {/* Content */}
            {isSearchingOrders ? (
              <div>
                <p className="text-sm text-gray-500 mb-2">
                  Results for "{orderQuery.toUpperCase()}"
                </p>
                {orderSearchLoading ? (
                  <Spinner message="Searching..." />
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
                      <button
                        onClick={() => navigate(`/market/orders/${orderQuery.toUpperCase()}/XCP`)}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        View all orders for {orderQuery.toUpperCase()} →
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState message={`No open orders for ${orderQuery.toUpperCase()}`} />
                )}
              </div>
            ) : orderSubTab === "open" ? (
              orders.isLoading ? (
                <Spinner message="Loading orders…" />
              ) : orders.error ? (
                <EmptyState message="Failed to load orders" />
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
                <EmptyState message="No open orders found" />
              )
            ) : (
              matches.isLoading ? (
                <Spinner message="Loading…" />
              ) : matches.error ? (
                <EmptyState message="Failed to load history" />
              ) : matches.data.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {matches.data.map((m) => (
                      <MarketMatchCard
                        key={m.id}
                        match={m}
                        onCopyTx={copyToClipboard}
                        isCopied={copiedTx === m.tx0_hash}
                      />
                    ))}
                  </div>
                  <div ref={loadMoreRef} className="flex justify-center py-2">
                    {matches.isFetchingMore && <Spinner />}
                  </div>
                </>
              ) : (
                <EmptyState message="No recent order matches" />
              )
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
