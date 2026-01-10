import { useState, useEffect, useCallback } from "react";
import {
  fetchAllDispensers,
  fetchAllDispenses,
  fetchAssetDispensers,
  fetchAssetDispenses,
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

const DEFAULT_LIMIT = 10;
const MANAGE_LIMIT = 50;
const DISPLAY_LIMIT = 5;
const COPY_FEEDBACK_DURATION = 2000;

interface XcpSectionData {
  dispensers: DispenserDetails[];
  dispenses: Dispense[];
  loading: boolean;
  tab: "dispensers" | "dispenses";
  setTab: (tab: "dispensers" | "dispenses") => void;
}

interface OrdersSectionData {
  orders: OrderDetails[];
  matches: OrderMatch[];
  loading: boolean;
  tab: "open" | "matched";
  setTab: (tab: "open" | "matched") => void;
}

interface DispensersSectionData {
  dispensers: DispenserDetails[];
  dispenses: Dispense[];
  loading: boolean;
  tab: "open" | "recent";
  setTab: (tab: "open" | "recent") => void;
}

interface ManageSectionData {
  orders: Order[];
  dispensers: Dispenser[];
  loading: boolean;
  load: () => Promise<void>;
}

interface UseMarketDataReturn {
  xcp: XcpSectionData;
  orders: OrdersSectionData;
  dispensers: DispensersSectionData;
  manage: ManageSectionData;
  copiedTx: string | null;
  copyToClipboard: (text: string) => Promise<void>;
  displayLimit: number;
}

/**
 * useMarketData hook consolidates all market data fetching and state management.
 */
export function useMarketData(activeAddress?: string): UseMarketDataReturn {
  // XCP section state
  const [xcpDispensers, setXcpDispensers] = useState<DispenserDetails[]>([]);
  const [xcpDispenses, setXcpDispenses] = useState<Dispense[]>([]);
  const [xcpLoading, setXcpLoading] = useState(true);
  const [xcpTab, setXcpTab] = useState<"dispensers" | "dispenses">("dispensers");

  // Orders section state
  const [recentOrders, setRecentOrders] = useState<OrderDetails[]>([]);
  const [orderMatches, setOrderMatches] = useState<OrderMatch[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersTab, setOrdersTab] = useState<"open" | "matched">("open");

  // Dispensers section state
  const [recentDispensers, setRecentDispensers] = useState<DispenserDetails[]>([]);
  const [recentDispenses, setRecentDispenses] = useState<Dispense[]>([]);
  const [dispensersLoading, setDispensersLoading] = useState(true);
  const [dispensersTab, setDispensersTab] = useState<"open" | "recent">("open");

  // Manage tab state
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myDispensers, setMyDispensers] = useState<Dispenser[]>([]);
  const [manageLoading, setManageLoading] = useState(false);

  // Copy feedback state
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Load XCP data
  useEffect(() => {
    const loadXcpData = async () => {
      setXcpLoading(true);
      try {
        const [dispensersRes, dispensesRes] = await Promise.all([
          fetchAssetDispensers("XCP", { limit: DEFAULT_LIMIT, status: "open" }),
          fetchAssetDispenses("XCP", { limit: DEFAULT_LIMIT }),
        ]);
        // Sort by price (lowest first)
        const sorted = [...dispensersRes.result].sort((a, b) => a.price - b.price);
        setXcpDispensers(sorted);
        setXcpDispenses(dispensesRes.result);
      } catch (err) {
        console.error("Failed to load XCP data:", err);
      } finally {
        setXcpLoading(false);
      }
    };
    loadXcpData();
  }, []);

  // Load orders data
  useEffect(() => {
    const loadOrdersData = async () => {
      setOrdersLoading(true);
      try {
        const [ordersRes, matchesRes] = await Promise.all([
          fetchAllOrders({ limit: DEFAULT_LIMIT, status: "open" }),
          fetchAllOrderMatches({ limit: DEFAULT_LIMIT }),
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
          fetchAllDispensers({ limit: DEFAULT_LIMIT, status: "open" }),
          fetchAllDispenses({ limit: DEFAULT_LIMIT }),
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

  // Load manage data when called
  const loadManageData = useCallback(async () => {
    if (!activeAddress) {
      setMyOrders([]);
      setMyDispensers([]);
      return;
    }

    setManageLoading(true);
    try {
      const [ordersRes, dispensersRes] = await Promise.all([
        fetchOrders(activeAddress, { status: "open", limit: MANAGE_LIMIT }),
        fetchAddressDispensers(activeAddress, { status: "open", limit: MANAGE_LIMIT }),
      ]);
      setMyOrders(ordersRes.result);
      setMyDispensers(dispensersRes.result);
    } catch (err) {
      console.error("Failed to load your DEX data:", err);
    } finally {
      setManageLoading(false);
    }
  }, [activeAddress]);

  // Copy to clipboard handler
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTx(text);
      setTimeout(() => setCopiedTx(null), COPY_FEEDBACK_DURATION);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  return {
    xcp: {
      dispensers: xcpDispensers,
      dispenses: xcpDispenses,
      loading: xcpLoading,
      tab: xcpTab,
      setTab: setXcpTab,
    },
    orders: {
      orders: recentOrders,
      matches: orderMatches,
      loading: ordersLoading,
      tab: ordersTab,
      setTab: setOrdersTab,
    },
    dispensers: {
      dispensers: recentDispensers,
      dispenses: recentDispenses,
      loading: dispensersLoading,
      tab: dispensersTab,
      setTab: setDispensersTab,
    },
    manage: {
      orders: myOrders,
      dispensers: myDispensers,
      loading: manageLoading,
      load: loadManageData,
    },
    copiedTx,
    copyToClipboard,
    displayLimit: DISPLAY_LIMIT,
  };
}
