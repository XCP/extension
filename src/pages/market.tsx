"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import {
  FaBitcoin,
  FaCoins,
  FaExternalLinkAlt,
  FaPlus,
  FaCog,
} from "@/components/icons";
import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import {
  fetchAllDispensers,
  fetchAllOrders,
  fetchOrders,
  fetchAddressDispensers,
  type DispenserDetails,
  type OrderDetails,
  type Order,
  type Dispenser,
} from "@/utils/blockchain/counterparty/api";
import { formatAmount } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Market component displays the XCP DEX marketplace with Browse and Manage tabs.
 */
export default function Market(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const { btc, xcp, loading: pricesLoading } = useMarketPrices();

  // Browse tab state
  const [browseDispensers, setBrowseDispensers] = useState<DispenserDetails[]>([]);
  const [browseOrders, setBrowseOrders] = useState<OrderDetails[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Manage tab state
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myDispensers, setMyDispensers] = useState<Dispenser[]>([]);
  const [manageLoading, setManageLoading] = useState(false);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Marketplace",
      onBack: () => navigate("/index"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  // Load browse data
  useEffect(() => {
    const loadBrowseData = async () => {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const [dispensersRes, ordersRes] = await Promise.all([
          fetchAllDispensers({ limit: 50, status: "open" }),
          fetchAllOrders({ limit: 20, status: "open" }),
        ]);
        // Sort dispensers by price per unit (lowest first = best deals)
        const sortedDispensers = [...dispensersRes.dispensers].sort(
          (a, b) => a.price - b.price
        );
        setBrowseDispensers(sortedDispensers);
        setBrowseOrders(ordersRes.orders);
      } catch (err) {
        console.error("Failed to load marketplace data:", err);
        setBrowseError(err instanceof Error ? err.message : "Failed to load marketplace data");
      } finally {
        setBrowseLoading(false);
      }
    };
    loadBrowseData();
  }, []);

  // Load manage data when tab becomes active or address changes
  const loadManageData = async () => {
    if (!activeAddress?.address) {
      setMyOrders([]);
      setMyDispensers([]);
      return;
    }

    setManageLoading(true);
    try {
      const [ordersRes, dispensersRes] = await Promise.all([
        fetchOrders(activeAddress.address, { status: "open", limit: 50 }),
        fetchAddressDispensers(activeAddress.address, { status: "open", limit: 50 }),
      ]);
      setMyOrders(ordersRes.orders);
      setMyDispensers(dispensersRes.dispensers);
    } catch (err) {
      console.error("Failed to load your DEX data:", err);
    } finally {
      setManageLoading(false);
    }
  };

  /**
   * Price ticker component
   */
  const PriceTicker = () => (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaBitcoin className="text-orange-500" aria-hidden="true" />
            <span className="font-medium text-gray-900 text-sm">BTC</span>
          </div>
          {pricesLoading ? (
            <div className="animate-pulse bg-gray-200 h-4 w-14 rounded" />
          ) : btc ? (
            <span className="font-semibold text-gray-900 text-sm">
              ${formatAmount({ value: btc, maximumFractionDigits: 0 })}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaCoins className="text-blue-500" aria-hidden="true" />
            <span className="font-medium text-gray-900 text-sm">XCP</span>
          </div>
          {pricesLoading ? (
            <div className="animate-pulse bg-gray-200 h-4 w-14 rounded" />
          ) : xcp ? (
            <span className="font-semibold text-gray-900 text-sm">
              ${formatAmount({ value: xcp, maximumFractionDigits: 2 })}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
      </div>
    </div>
  );

  /**
   * Dispenser card for browse view
   */
  const DispenserCard = ({ dispenser }: { dispenser: DispenserDetails }) => (
    <div
      className="bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/compose/dispenser/dispense/${dispenser.source}`)}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {dispenser.asset_info?.asset_longname || dispenser.asset}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatAmount({ value: Number(dispenser.give_quantity_normalized), maximumFractionDigits: 2 })} per dispense @ {formatAmount({ value: dispenser.satoshirate, maximumFractionDigits: 0 })} sats
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-orange-600">
            {formatAmount({ value: dispenser.price, maximumFractionDigits: 0 })} sats/unit
          </div>
          <div className="text-xs text-gray-400">
            {formatAmount({ value: Number(dispenser.give_remaining_normalized), maximumFractionDigits: 0 })} left
          </div>
        </div>
      </div>
    </div>
  );

  /**
   * Order card for browse view
   */
  const OrderCard = ({ order }: { order: OrderDetails }) => {
    const giveAsset = order.give_asset_info?.asset_longname || order.give_asset;
    const getAsset = order.get_asset_info?.asset_longname || order.get_asset;
    return (
      <div className="bg-white rounded-lg shadow-sm p-3">
        <div className="flex justify-between items-center">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-900 truncate max-w-[80px]">{giveAsset}</span>
              <span className="text-gray-400">→</span>
              <span className="font-medium text-gray-900 truncate max-w-[80px]">{getAsset}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatAmount({ value: Number(order.give_remaining_normalized), maximumFractionDigits: 2 })} remaining
            </div>
          </div>
          <button
            onClick={() => window.open(`https://www.xcp.io/tx/${order.tx_hash}`, "_blank")}
            className="text-gray-400 hover:text-gray-600"
            aria-label="View on XCP.io"
          >
            <FaExternalLinkAlt className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  /**
   * My Order card for manage view
   */
  const MyOrderCard = ({ order }: { order: Order }) => (
    <div className="bg-white rounded-lg shadow-sm p-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900">{order.give_asset}</span>
            <span className="text-gray-400">→</span>
            <span className="font-medium text-gray-900">{order.get_asset}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatAmount({ value: Number(order.give_remaining_normalized), maximumFractionDigits: 4 })} / {formatAmount({ value: Number(order.give_quantity_normalized), maximumFractionDigits: 4 })} remaining
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          order.status === "open" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}>
          {order.status}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          color="gray"
          onClick={() => navigate(`/compose/cancel/${order.tx_hash}`)}
          fullWidth
        >
          Cancel
        </Button>
        <button
          onClick={() => window.open(`https://www.xcp.io/tx/${order.tx_hash}`, "_blank")}
          className="px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          aria-label="View on XCP.io"
        >
          <FaExternalLinkAlt className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  /**
   * My Dispenser card for manage view
   */
  const MyDispenserCard = ({ dispenser }: { dispenser: Dispenser }) => (
    <div className="bg-white rounded-lg shadow-sm p-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="font-medium text-gray-900">
            {dispenser.asset_info?.asset_longname || dispenser.asset}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatAmount({ value: Number(dispenser.give_remaining_normalized), maximumFractionDigits: 4 })} remaining
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          dispenser.status === 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}>
          {dispenser.status === 0 ? "Open" : "Closed"}
        </span>
      </div>
      <div className="flex gap-2">
        {dispenser.status === 0 && (
          <Button
            color="gray"
            onClick={() => navigate(`/compose/dispenser/close/${dispenser.source}/${dispenser.asset}`)}
            fullWidth
          >
            Close
          </Button>
        )}
        <button
          onClick={() => window.open(`https://www.xcp.io/tx/${dispenser.tx_hash}`, "_blank")}
          className="px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          aria-label="View on XCP.io"
        >
          <FaExternalLinkAlt className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  /**
   * Empty state component
   */
  const EmptyState = ({ message, action }: { message: string; action?: { label: string; onClick: () => void } }) => (
    <div className="bg-gray-50 rounded-lg p-6 text-center">
      <div className="text-gray-500 text-sm">{message}</div>
      {action && (
        <Button onClick={action.onClick} color="blue" className="mt-3">
          {action.label}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <PriceTicker />

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
              {browseLoading ? (
                <Spinner message="Loading marketplace..." />
              ) : browseError ? (
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-red-600 text-sm mb-2">{browseError}</div>
                  <Button
                    onClick={() => {
                      setBrowseLoading(true);
                      setBrowseError(null);
                      Promise.all([
                        fetchAllDispensers({ limit: 50, status: "open" }),
                        fetchAllOrders({ limit: 20, status: "open" }),
                      ]).then(([dispensersRes, ordersRes]) => {
                        const sortedDispensers = [...dispensersRes.dispensers].sort(
                          (a, b) => a.price - b.price
                        );
                        setBrowseDispensers(sortedDispensers);
                        setBrowseOrders(ordersRes.orders);
                      }).catch((err) => {
                        setBrowseError(err instanceof Error ? err.message : "Failed to load");
                      }).finally(() => setBrowseLoading(false));
                    }}
                    color="blue"
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Recent Dispensers */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="text-sm font-semibold text-gray-700">Best Dispenser Prices</h2>
                    </div>
                    {browseDispensers.length > 0 ? (
                      <div className="space-y-2">
                        {browseDispensers.slice(0, 5).map((d) => (
                          <DispenserCard key={d.tx_hash} dispenser={d} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No open dispensers found" />
                    )}
                  </div>

                  {/* Recent Orders */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="text-sm font-semibold text-gray-700">Open DEX Orders</h2>
                    </div>
                    {browseOrders.length > 0 ? (
                      <div className="space-y-2">
                        {browseOrders.slice(0, 5).map((o) => (
                          <OrderCard key={o.tx_hash} order={o} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No open orders found" />
                    )}
                  </div>
                </div>
              )}
            </TabPanel>

            {/* Manage Tab */}
            <TabPanel>
              {manageLoading ? (
                <Spinner message="Loading your DEX activity..." />
              ) : (
                <div className="space-y-4">
                  {/* My Orders */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="text-sm font-semibold text-gray-700">Your Orders</h2>
                      <button
                        onClick={() => navigate("/compose/order")}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <FaPlus className="w-3 h-3" />
                        New Order
                      </button>
                    </div>
                    {myOrders.length > 0 ? (
                      <div className="space-y-2">
                        {myOrders.map((o) => (
                          <MyOrderCard key={o.tx_hash} order={o} />
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
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                          title="Manage all dispensers"
                        >
                          <FaCog className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => navigate("/compose/dispenser")}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <FaPlus className="w-3 h-3" />
                          New
                        </button>
                      </div>
                    </div>
                    {myDispensers.length > 0 ? (
                      <div className="space-y-2">
                        {myDispensers.slice(0, 5).map((d) => (
                          <MyDispenserCard key={d.tx_hash} dispenser={d} />
                        ))}
                        {myDispensers.length > 5 && (
                          <button
                            onClick={() => navigate("/dispensers/manage")}
                            className="w-full py-2 text-sm text-blue-600 hover:text-blue-800"
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
