import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Radio, RadioGroup } from "@headlessui/react";
import { FaChevronRight, FaClipboard, FaCheck, FaLock } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { MarketDispenserCard } from "@/components/ui/cards/market-dispenser-card";
import { MarketOrderCard } from "@/components/ui/cards/market-order-card";
import { ManageDispenserCard } from "@/components/ui/cards/manage-dispenser-card";
import { ManageOrderCard } from "@/components/ui/cards/manage-order-card";
import { EmptyState } from "@/components/ui/empty-state";
import { TabButton } from "@/components/ui/tab-button";
import { PriceTicker } from "@/components/domain/price/price-ticker";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useInView } from "@/hooks/useInView";
import { useMarketData } from "@/hooks/useMarketData";
import { formatAddress } from "@/utils/format";
import { formatPrice } from "@/utils/price-format";
import { getTradingPair } from "@/utils/trading-pair";
import type { DispenserDetails, OrderDetails } from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";

// Constants
const COPY_FEEDBACK_MS = 2000;

/**
 * Market page displays the XCP DEX marketplace with Dispensers and Orders tabs.
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
  const activeTab = searchParams.get("tab") === "dispensers" ? 0 : 1;
  const viewMode = searchParams.get("mode") === "manage" ? "manage" : "explore";

  const setActiveTab = (tab: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab === 0 ? "dispensers" : "orders");
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

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Exchange",
      onBack: () => navigate("/index"),
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockKeychain();
          navigate("/keychain/unlock");
        },
        ariaLabel: "Lock Keychain",
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
                aria-selected={activeTab === 0}
                className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded ${
                  activeTab === 0 ? "underline" : ""
                }`}
                onClick={() => setActiveTab(0)}
              >
                Dispensers
              </button>
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
            </div>
            {/* View Mode Toggle */}
            <div className="flex gap-1" role="tablist" aria-label="View mode">
              <TabButton isActive={viewMode === "explore"} onClick={() => setViewMode("explore")}>
                Explore
              </TabButton>
              <TabButton isActive={viewMode === "manage"} onClick={() => setViewMode("manage")}>
                Manage
              </TabButton>
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
                    placeholder="Search asset dispensers..."
                    name="dispenser-search"
                    isLoading={dispenserSearchLoading}
                    showClearButton
                    className="mt-0.5"
                  />

                  {isSearching ? (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">
                        Results for "{searchQuery.toUpperCase()}"
                      </p>
                      {dispenserSearchLoading ? (
                        <Spinner message="Searching..." />
                      ) : dispenserSearchError ? (
                        <EmptyState message={dispenserSearchError} />
                      ) : dispenserResults.length > 0 ? (
                        <div className="space-y-2">
                          {dispenserResults.map((d) => (
                            <MarketDispenserCard
                              key={d.tx_hash}
                              dispenser={d}
                              formattedPrice={formatPrice(d.satoshirate, settings.priceUnit, btc, settings.fiat)}
                              onClick={() => handleDispenserClick(d)}
                            />
                          ))}
                          {dispenserResults.length >= PAGE_SIZE && (
                            <button
                              onClick={() => navigate(`/market/dispensers/${searchQuery.toUpperCase()}`)}
                              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            >
                              View all dispensers for {searchQuery.toUpperCase()} →
                            </button>
                          )}
                        </div>
                      ) : (
                        <EmptyState message={`No open dispensers for ${searchQuery.toUpperCase()}`} />
                      )}
                    </div>
                  ) : dispensers.isLoading ? (
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
                          />
                        ))}
                      </div>
                      <div ref={loadMoreRef} className="flex justify-center py-2">
                        {dispensers.isFetchingMore && <Spinner />}
                      </div>
                    </>
                  ) : (
                    <EmptyState message="No open dispensers found" />
                  )}
                </>
              ) : (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Filter your dispensers..."
                    name="dispenser-filter"
                    showClearButton
                    className="mt-0.5"
                  />
                  {userDispensers.isLoading ? (
                    <Spinner message="Loading your dispensers…" />
                  ) : userDispensers.error ? (
                    <EmptyState message="Failed to load your dispensers" />
                  ) : (
                    <>
                      {filteredUserDispensers.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {filteredUserDispensers.map((d) => (
                              <ManageDispenserCard key={d.tx_hash} dispenser={d} />
                            ))}
                          </div>
                          <div ref={loadMoreRef} className="flex justify-center py-2">
                            {userDispensers.isFetchingMore && <Spinner />}
                          </div>
                        </>
                      ) : searchQuery.trim() ? (
                        <EmptyState message={`No dispensers matching "${searchQuery}"`} />
                      ) : (
                        <EmptyState message="You don't have any open dispensers" />
                      )}
                      <button
                        onClick={() => navigate(searchQuery.trim() ? `/compose/dispenser/${searchQuery.toUpperCase()}` : "/compose/dispenser")}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        Create New Dispenser →
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
                    placeholder="Search asset orders..."
                    name="order-search"
                    isLoading={orderSearchLoading}
                    showClearButton
                    className="mt-0.5"
                  />

                  {isSearching ? (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">
                        Results for "{searchQuery.toUpperCase()}"
                      </p>
                      {orderSearchLoading ? (
                        <Spinner message="Searching..." />
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
                            <button
                              onClick={() => navigate(`/market/orders/${searchQuery.toUpperCase()}/XCP`)}
                              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            >
                              View all orders for {searchQuery.toUpperCase()} →
                            </button>
                          )}
                        </div>
                      ) : (
                        <EmptyState message={`No open orders for ${searchQuery.toUpperCase()}`} />
                      )}
                    </div>
                  ) : orders.isLoading ? (
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
                  )}
                </>
              ) : (
                <>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Filter your orders..."
                    name="order-filter"
                    showClearButton
                    className="mt-0.5"
                  />
                  {userOrders.isLoading ? (
                    <Spinner message="Loading your orders…" />
                  ) : userOrders.error ? (
                    <EmptyState message="Failed to load your orders" />
                  ) : (
                    <>
                      {filteredUserOrders.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {filteredUserOrders.map((o) => (
                              <ManageOrderCard key={o.tx_hash} order={o} />
                            ))}
                          </div>
                          <div ref={loadMoreRef} className="flex justify-center py-2">
                            {userOrders.isFetchingMore && <Spinner />}
                          </div>
                        </>
                      ) : searchQuery.trim() ? (
                        <EmptyState message={`No orders matching "${searchQuery}"`} />
                      ) : (
                        <EmptyState message="You don't have any open orders" />
                      )}
                      <button
                        onClick={() => navigate(searchQuery.trim() ? `/compose/order/${searchQuery.toUpperCase()}` : "/compose/order")}
                        className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        Create New Order →
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
