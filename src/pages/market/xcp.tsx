import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FiRefreshCw } from "@/components/icons";
import { PriceChart } from "@/components/ui/charts/price-chart";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import type { PricePoint } from "@/core/bitcoin/price";
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
        await Promise.all([loadStats(), loadHistory()]);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, [loadStats, loadHistory]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadStats(), loadHistory()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadStats, loadHistory]);

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

  // Daily history stays historical; only today's endpoint follows the live,
  // mempool-adjusted dispenser ask used by the ticker headline.
  const liveHistory = useMemo(() => {
    const history = historyData?.history ?? [];
    if (!stats) return history;

    const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const livePoint = { timestamp: today, price: stats.price };
    const lastPoint = history[history.length - 1];

    return lastPoint?.timestamp === today
      ? [...history.slice(0, -1), livePoint]
      : [...history, livePoint];
  }, [historyData?.history, stats]);
  const chartData = useMemo(
    () => filterHistory(liveHistory, range),
    [liveHistory, range],
  );
  const ath = useMemo(() => {
    if (!stats || (historyData?.ath && historyData.ath.usd >= stats.price)) {
      return historyData?.ath ?? null;
    }
    return {
      usd: stats.price,
      day: new Date().toISOString().slice(0, 10),
    };
  }, [historyData?.ath, stats]);

  if (loading) {
    return <Spinner message="Loading XCP price…" />;
  }

  return (
    <div className="flex flex-col h-full">
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
                  <button type="button"
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
              <button type="button"
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
          <button type="button"
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
              <button type="button"
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
        {(stats?.satsPerXcp || historyData?.satsPerXcp || ath) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mt-4">
            {stats?.satsPerXcp ? (
              <div className={`flex items-center justify-between ${ath ? "pb-2 border-b border-gray-100" : ""}`}>
                <span className="text-sm text-gray-600">Floor Price</span>
                <button type="button"
                  onClick={handleBuyXcp}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  aria-label="View open XCP dispensers"
                >
                  1 XCP = {formatAmount({ value: stats.satsPerXcp, maximumFractionDigits: 0 })} sats
                </button>
              </div>
            ) : historyData?.satsPerXcp ? (
              <div className={`flex items-center justify-between ${ath ? "pb-2 border-b border-gray-100" : ""}`}>
                <span className="text-sm text-gray-600">DEX Rate</span>
                <span className="text-sm font-medium text-gray-900">
                  1 XCP = {formatAmount({ value: historyData.satsPerXcp, maximumFractionDigits: 0 })} sats
                </span>
              </div>
            ) : null}
            {ath && (
              <div className={`flex items-center justify-between ${(stats?.satsPerXcp || historyData?.satsPerXcp) ? "pt-2" : ""}`}>
                <span className="text-sm text-gray-600">All-Time High</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatPrice(ath.usd)}
                  <span className="text-gray-400 font-normal">
                    {" "}· {new Date(`${ath.day}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
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
