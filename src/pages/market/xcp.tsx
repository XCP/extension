import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FiRefreshCw } from "@/components/icons";
import { PriceChart } from "@/components/ui/charts/price-chart";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import type { PricePoint } from "@/core/bitcoin/price";
import { fetchAssetDispensers } from "@/core/counterparty/api";
import {
  getXcpPriceHistory,
  getXcpStats,
  type XcpPriceHistoryData,
  type XcpStats,
} from "@/core/counterparty/price";
import { formatAmount } from "@/core/format";
import { analytics } from "@/platform/fathom";

// Time range options over the daily history from api.xcp.io
type XcpTimeRange = "7d" | "30d" | "1y" | "all";
const TIME_RANGES: { id: XcpTimeRange; label: string; days: number | null }[] = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
];

// Chart dimensions
const CHART_HEIGHT = 200;

/** The cheapest open XCP dispenser: the price you can actually pay right now. */
interface DispenserFloor {
  satsPerXcp: number;
  source: string;
}

function filterHistory(history: PricePoint[], range: XcpTimeRange): PricePoint[] {
  const days = TIME_RANGES.find((t) => t.id === range)?.days;
  if (!days) return history;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((point) => point.timestamp >= cutoff);
}

/**
 * XcpPrice displays the XCP (Counterparty) price chart with time range selection.
 * Price data comes from the xcp.io explorer API (USD).
 */
export default function XcpPricePage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  // Data state
  const [stats, setStats] = useState<XcpStats | null>(null);
  const [historyData, setHistoryData] = useState<XcpPriceHistoryData | null>(null);
  const [floor, setFloor] = useState<DispenserFloor | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // UI state
  const [range, setRange] = useState<XcpTimeRange>("30d");

  // Load stats
  const loadStats = useCallback(async () => {
    setStatsError(null);
    const statsData = await getXcpStats();
    if (statsData) {
      setStats(statsData);
    } else {
      setStatsError("Unable to load price");
    }
  }, []);

  // Find the cheapest open XCP dispenser (sats per whole XCP). Checks the first
  // 100 open dispensers; the true floor could hide beyond that, but in practice
  // open XCP dispensers number far fewer.
  const loadFloor = useCallback(async () => {
    try {
      const response = await fetchAssetDispensers("XCP", { limit: 100, status: "open" });
      let best: DispenserFloor | null = null;
      for (const dispenser of response.result) {
        const unitsPerDispense = Number(dispenser.give_quantity_normalized);
        if (unitsPerDispense <= 0) continue;
        const satsPerXcp = Number(dispenser.satoshirate) / unitsPerDispense;
        if (!best || satsPerXcp < best.satsPerXcp) {
          best = { satsPerXcp, source: dispenser.source };
        }
      }
      setFloor(best);
    } catch (err) {
      console.error("Failed to load XCP dispenser floor:", err);
      setFloor(null);
    }
  }, []);

  // Load full daily history (range filtering happens client-side)
  const loadHistory = useCallback(async () => {
    setChartError(null);
    try {
      const data = await getXcpPriceHistory();
      setHistoryData(data);
    } catch (err) {
      console.error("Failed to load XCP price history:", err);
      setHistoryData(null);
      setChartError("Unable to load chart data");
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        await Promise.all([loadStats(), loadHistory(), loadFloor()]);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, [loadStats, loadHistory, loadFloor]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadStats(), loadHistory(), loadFloor()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadStats, loadHistory, loadFloor]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "XCP Price",
      onBack: () => navigate("/market"),
      rightButton: {
        ariaLabel: "Refresh price",
        icon: <FiRefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />,
        onClick: handleRefresh,
        disabled: isRefreshing,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isRefreshing, handleRefresh]);

  const handleBuyXcp = () => {
    analytics.track("buy_xcp");
    navigate("/market/dispensers/XCP");
  };

  // XCP trades around $1, so keep cents visible
  const formatPrice = (price: number) =>
    `$${formatAmount({ value: price, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const chartData = historyData ? filterHistory(historyData.history, range) : [];

  if (loading) {
    return <Spinner message="Loading XCP price…" />;
  }

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        {/* Price Stats Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <img
                  src="https://cdn.xcp.io/img/icon/XCP"
                  alt=""
                  className="size-8 rounded-full"
                  aria-hidden="true"
                />
                <span className="text-xl font-semibold text-gray-900">XCP</span>
              </div>
              <span className="text-xs text-gray-500 mt-1">Counterparty (USD)</span>
            </div>
            <div className="text-right">
              {statsError ? (
                <div className="text-sm text-red-600">
                  <span className="block">{statsError}</span>
                  <button
                    onClick={loadStats}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-2xl font-bold text-gray-900 block">
                    {stats ? formatPrice(stats.price) : "—"}
                  </span>
                  {stats?.change24h !== null && stats?.change24h !== undefined && (
                    <span className={`text-sm font-medium ${stats.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {stats.change24h >= 0 ? "+" : ""}{formatAmount({ value: stats.change24h, maximumFractionDigits: 2 })}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section Header with Tabs left, Buy XCP link right */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {TIME_RANGES.map((t) => (
              <button
                key={t.id}
                onClick={() => setRange(t.id)}
                className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  range === t.id
                    ? "bg-gray-200 text-gray-900 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleBuyXcp}
            className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Buy XCP
          </button>
        </div>

        {/* Price Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          {chartError ? (
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{ height: CHART_HEIGHT }}
            >
              <span className="text-sm text-red-600 mb-2">{chartError}</span>
              <button
                onClick={loadHistory}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Try Again
              </button>
            </div>
          ) : (
            <PriceChart
              data={chartData}
              height={CHART_HEIGHT}
              lineColor="#0ea5e9"
              className="w-full"
              currencySymbol="$"
              priceDecimals={2}
              timeFormat="date"
            />
          )}
        </div>

        {/* Market Stats */}
        {(floor || historyData?.satsPerXcp || historyData?.ath) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mt-4">
            {floor ? (
              <div className={`flex items-center justify-between ${historyData?.ath ? "pb-2 border-b border-gray-100" : ""}`}>
                <span className="text-sm text-gray-600">Floor Price</span>
                <button
                  onClick={() => navigate(`/compose/dispenser/dispense?address=${floor.source}&asset=XCP`)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  aria-label="Buy from the cheapest open XCP dispenser"
                >
                  1 XCP = {formatAmount({ value: floor.satsPerXcp, maximumFractionDigits: 0 })} sats
                </button>
              </div>
            ) : historyData?.satsPerXcp ? (
              <div className={`flex items-center justify-between ${historyData.ath ? "pb-2 border-b border-gray-100" : ""}`}>
                <span className="text-sm text-gray-600">DEX Rate</span>
                <span className="text-sm font-medium text-gray-900">
                  1 XCP = {formatAmount({ value: historyData.satsPerXcp, maximumFractionDigits: 0 })} sats
                </span>
              </div>
            ) : null}
            {historyData?.ath && (
              <div className={`flex items-center justify-between ${(floor || historyData.satsPerXcp) ? "pt-2" : ""}`}>
                <span className="text-sm text-gray-600">All-Time High</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatPrice(historyData.ath.usd)}
                  <span className="text-gray-400 font-normal">
                    {" "}· {new Date(`${historyData.ath.day}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
