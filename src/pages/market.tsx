
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { FaPlus, FaCog } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { MarketDispenserCard } from "@/components/cards/market-dispenser-card";
import { MarketOrderCard } from "@/components/cards/market-order-card";
import { MarketDispenseCard } from "@/components/cards/market-dispense-card";
import { MarketMatchCard } from "@/components/cards/market-match-card";
import { ManageOrderCard } from "@/components/cards/manage-order-card";
import { ManageDispenserCard } from "@/components/cards/manage-dispenser-card";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/headers/section-header";
import { PriceTicker } from "@/components/price-ticker";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import {
  fetchAllDispensers,
  fetchAllDispenses,
  fetchAllOrders,
  fetchAllOrderMatches,
  fetchOrders,
  fetchAddressDispensers,
  type DispenserDetails,
  type OrderDetails,
  type OrderMatch,
  type Order,
  type Dispenser,
  type Dispense,
} from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";

// Constants
const FETCH_LIMIT = 10;
const MANAGE_FETCH_LIMIT = 50;
const DISPLAY_LIMIT = 5;
const COPY_FEEDBACK_MS = 2000;

/**
 * Market component displays the XCP DEX marketplace with Browse and Manage tabs.
 */
export default function Market(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const { btc, xcp, loading: pricesLoading } = useMarketPrices(settings.fiat);

  // Orders section state
  const [recentOrders, setRecentOrders] = useState<OrderDetails[]>([]);
  const [orderMatches, setOrderMatches] = useState<OrderMatch[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersTab, setOrdersTab] = useState<"open" | "history">("open");

  // Dispensers section state
  const [recentDispensers, setRecentDispensers] = useState<DispenserDetails[]>([]);
  const [recentDispenses, setRecentDispenses] = useState<Dispense[]>([]);
  const [dispensersLoading, setDispensersLoading] = useState(true);
  const [dispensersTab, setDispensersTab] = useState<"open" | "dispensed">("open");

  // Manage tab state
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myDispensers, setMyDispensers] = useState<Dispenser[]>([]);
  const [manageLoading, setManageLoading] = useState(false);

  // Copy feedback state
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Marketplace",
      onBack: () => navigate("/index"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  // Load orders data
  useEffect(() => {
    const loadOrdersData = async () => {
      setOrdersLoading(true);
      try {
        const [ordersRes, matchesRes] = await Promise.all([
          fetchAllOrders({ limit: FETCH_LIMIT, status: "open" }),
          fetchAllOrderMatches({ limit: FETCH_LIMIT }),
        ]);
        setRecentOrders(ordersRes.result);
        setOrderMatches(matchesRes.result);
      } catch (err) {
        console.error("Failed to load orders data:", err);
      } finally {
        setOrdersLoading(false);
      }
    };
    loadOrdersData();
  }, []);

  // Load dispensers data
  useEffect(() => {
    const loadDispensersData = async () => {
      setDispensersLoading(true);
      try {
        const [dispensersRes, dispensesRes] = await Promise.all([
          fetchAllDispensers({ limit: FETCH_LIMIT, status: "open" }),
          fetchAllDispenses({ limit: FETCH_LIMIT }),
        ]);
        setRecentDispensers(dispensersRes.result);
        setRecentDispenses(dispensesRes.result);
      } catch (err) {
        console.error("Failed to load dispensers data:", err);
      } finally {
        setDispensersLoading(false);
      }
    };
    loadDispensersData();
  }, []);

  // Load manage data when tab becomes active
  const loadManageData = useCallback(async () => {
    if (!activeAddress?.address) {
      setMyOrders([]);
      setMyDispensers([]);
      return;
    }

    setManageLoading(true);
    try {
      const [ordersRes, dispensersRes] = await Promise.all([
        fetchOrders(activeAddress.address, { status: "open", limit: MANAGE_FETCH_LIMIT }),
        fetchAddressDispensers(activeAddress.address, { status: "open", limit: MANAGE_FETCH_LIMIT }),
      ]);
      setMyOrders(ordersRes.result);
      setMyDispensers(dispensersRes.result);
    } catch (err) {
      console.error("Failed to load your DEX data:", err);
    } finally {
      setManageLoading(false);
    }
  }, [activeAddress?.address]);

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

  // Navigate to asset orders page to compare prices
  const handleOrderClick = (order: OrderDetails) => {
    const baseAsset = order.give_asset;
    const quoteAsset = order.get_asset;
    navigate(`/market/orders/${baseAsset}/${quoteAsset}`);
  };

  // Navigate to asset dispensers page to compare prices
  const handleDispenserClick = (dispenser: DispenserDetails) => {
    navigate(`/market/dispensers/${dispenser.asset}`);
  };

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <PriceTicker
          btc={btc}
          xcp={xcp}
          currency={settings.fiat}
          loading={pricesLoading}
          onBtcClick={() => navigate("/market/btc")}
          onXcpClick={() => navigate("/market/dispensers/XCP")}
          className="mb-4"
        />

        <TabGroup onChange={(index) => index === 1 && loadManageData()}>
          <TabList className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
            <Tab className={({ selected }) =>
              `flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                selected
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`
            }>
              Browse
            </Tab>
            <Tab className={({ selected }) =>
              `flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                selected
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`
            }>
              Manage
            </Tab>
          </TabList>

          <TabPanels>
            {/* Browse Tab */}
            <TabPanel>
              <div className="space-y-6">
                {/* Dispensers Section */}
                <div>
                  <SectionHeader
                    title="Dispensers"
                    tabs={[
                      { id: "open", label: "Open" },
                      { id: "dispensed", label: "Dispensed" },
                    ]}
                    activeTab={dispensersTab}
                    onTabChange={(tab) => setDispensersTab(tab as "open" | "dispensed")}
                  />
                  {dispensersLoading ? (
                    <Spinner message="Loading dispensers…" />
                  ) : dispensersTab === "open" ? (
                    recentDispensers.length > 0 ? (
                      <div className="space-y-2">
                        {recentDispensers.slice(0, DISPLAY_LIMIT).map((d) => (
                          <MarketDispenserCard
                            key={d.tx_hash}
                            dispenser={d}
                            onClick={() => handleDispenserClick(d)}
                            onAssetClick={() => navigate(`/market/dispensers/${d.asset}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No open dispensers found" />
                    )
                  ) : (
                    recentDispenses.length > 0 ? (
                      <div className="space-y-2">
                        {recentDispenses.slice(0, DISPLAY_LIMIT).map((d) => (
                          <MarketDispenseCard
                            key={d.tx_hash}
                            dispense={d}
                            onCopyTx={copyToClipboard}
                            isCopied={copiedTx === d.tx_hash}
                            onAssetClick={() => navigate(`/market/dispensers/${d.asset}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No recent dispenses" />
                    )
                  )}
                </div>

                {/* Orders Section */}
                <div>
                  <SectionHeader
                    title="Orders"
                    tabs={[
                      { id: "open", label: "Open" },
                      { id: "history", label: "History" },
                    ]}
                    activeTab={ordersTab}
                    onTabChange={(tab) => setOrdersTab(tab as "open" | "history")}
                  />
                  {ordersLoading ? (
                    <Spinner message="Loading orders…" />
                  ) : ordersTab === "open" ? (
                    recentOrders.length > 0 ? (
                      <div className="space-y-2">
                        {recentOrders.slice(0, DISPLAY_LIMIT).map((o) => (
                          <MarketOrderCard
                            key={o.tx_hash}
                            order={o}
                            onClick={() => handleOrderClick(o)}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No open orders found" />
                    )
                  ) : (
                    orderMatches.length > 0 ? (
                      <div className="space-y-2">
                        {orderMatches.slice(0, DISPLAY_LIMIT).map((m) => (
                          <MarketMatchCard
                            key={m.id}
                            match={m}
                            onCopyTx={copyToClipboard}
                            isCopied={copiedTx === m.tx0_hash}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No recent order matches" />
                    )
                  )}
                </div>
              </div>
            </TabPanel>

            {/* Manage Tab */}
            <TabPanel>
              {manageLoading ? (
                <Spinner message="Loading your DEX activity…" />
              ) : (
                <div className="space-y-4">
                  {/* My Orders */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="text-sm font-semibold text-gray-700">Your Orders</h2>
                      <button
                        onClick={() => navigate("/compose/order")}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        <FaPlus className="size-3" aria-hidden="true" />
                        New Order
                      </button>
                    </div>
                    {myOrders.length > 0 ? (
                      <div className="space-y-2">
                        {myOrders.map((o) => (
                          <ManageOrderCard key={o.tx_hash} order={o} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        message="You don't have any open orders"
                        action={{ label: "Create Order", onClick: () => navigate("/compose/order") }}
                      />
                    )}
                  </div>

                  {/* My Dispensers */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="text-sm font-semibold text-gray-700">Your Dispensers</h2>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate("/dispensers/manage")}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 rounded"
                          title="Manage all dispensers"
                        >
                          <FaCog className="size-3" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => navigate("/compose/dispenser")}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        >
                          <FaPlus className="size-3" aria-hidden="true" />
                          New
                        </button>
                      </div>
                    </div>
                    {myDispensers.length > 0 ? (
                      <div className="space-y-2">
                        {myDispensers.slice(0, DISPLAY_LIMIT).map((d) => (
                          <ManageDispenserCard key={d.tx_hash} dispenser={d} />
                        ))}
                        {myDispensers.length > DISPLAY_LIMIT && (
                          <button
                            onClick={() => navigate("/dispensers/manage")}
                            className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                          >
                            View all {myDispensers.length} dispensers
                          </button>
                        )}
                      </div>
                    ) : (
                      <EmptyState
                        message="You don't have any open dispensers"
                        action={{ label: "Create Dispenser", onClick: () => navigate("/compose/dispenser") }}
                      />
                    )}
                  </div>
                </div>
              )}
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>
    </div>
  );
}
