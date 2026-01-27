import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiRefreshCw, FaBitcoin, FiChevronDown } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { PriceChart } from "@/components/charts/price-chart";
import { useHeader } from "@/contexts/header-context";
import { formatAmount } from "@/utils/format";
import {
  getBtcPriceHistory,
  getBtc24hStats,
  CURRENCY_INFO,
  type PricePoint,
  type TimeRange,
  type BtcStats,
  type FiatCurrency,
} from "@/utils/blockchain/bitcoin/price";
import { useSettings } from "@/contexts/settings-context";
import { analytics } from "@/utils/fathom";
import type { ReactElement } from "react";

// Time range options (limited to 1h/24h due to CoinGecko API limitations)
const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
];

// Currency options (USD only for now - other currencies disabled due to API rate limits)
// TODO: Re-enable when we have a more reliable price API: ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'cny']
const CURRENCIES: FiatCurrency[] = ['usd'];

// Chart dimensions
const CHART_HEIGHT = 200;
const CURRENCY_CHANGE_COOLDOWN_MS = 5000; // 5 second cooldown between currency changes

/**
 * BtcPrice displays Bitcoin price chart with time range and currency selection.
 */
export default function BtcPricePage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();

  // Data state
  const [stats, setStats] = useState<BtcStats | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // UI state - initialize currency from settings
  const [range, setRange] = useState<TimeRange>("24h");
  const [currency, setCurrency] = useState<FiatCurrency>(settings.fiat);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);

  // Track last currency change time to prevent spam
  const lastCurrencyChangeRef = useRef<number>(0);

  const currencySymbol = CURRENCY_INFO[currency].symbol;

  // Load stats
  const loadStats = useCallback(async (curr: FiatCurrency) => {
    setStatsError(null);
    try {
      const statsData = await getBtc24hStats(curr);
      if (statsData) {
        setStats(statsData);
      } else {
        setStatsError("Unable to load price");
      }
    } catch (err) {
      console.error("Failed to load BTC stats:", err);
      setStatsError("Unable to load price");
    }
  }, []);

  // Load chart data
  const loadChartData = useCallback(async (timeRange: TimeRange, curr: FiatCurrency) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const history = await getBtcPriceHistory(timeRange, curr);
      setPriceHistory(history);
    } catch (err) {
      console.error("Failed to load BTC price history:", err);
      setPriceHistory([]);
      setChartError("Unable to load chart data");
    } finally {
      setChartLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        await Promise.all([loadStats(currency), loadChartData(range, currency)]);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadStats(currency), loadChartData(range, currency)]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadStats, loadChartData, range, currency]);

  // Handle range change
  const handleRangeChange = useCallback((newRange: string) => {
    setRange(newRange as TimeRange);
    loadChartData(newRange as TimeRange, currency);
  }, [loadChartData, currency]);

  // Handle currency change with cooldown to prevent API spam
  const handleCurrencyChange = useCallback((newCurrency: FiatCurrency) => {
    const now = Date.now();
    if (now - lastCurrencyChangeRef.current < CURRENCY_CHANGE_COOLDOWN_MS) {
      setShowCurrencyMenu(false);
      return; // Still in cooldown
    }
    lastCurrencyChangeRef.current = now;
    setCurrency(newCurrency);
    setShowCurrencyMenu(false);
    // Persist to settings
    updateSettings({ fiat: newCurrency });
    // Reload data with new currency
    loadStats(newCurrency);
    loadChartData(range, newCurrency);
  }, [loadStats, loadChartData, range, updateSettings]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Bitcoin Price",
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

  // Format price with currency
  const formatPrice = (price: number) => {
    const decimals = CURRENCY_INFO[currency].decimals;
    return `${currencySymbol}${formatAmount({ value: price, maximumFractionDigits: decimals })}`;
  };

  if (loading) {
    return <Spinner message="Loading Bitcoin price…" />;
  }

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        {/* Price Stats Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FaBitcoin className="text-orange-500 text-xl" aria-hidden="true" />
                <span className="font-semibold text-gray-900">BTC</span>
              </div>
              {/* Currency Selector - only show if multiple currencies available */}
              {CURRENCIES.length > 1 ? (
                <div className="relative mt-1">
                  <button
                    onClick={() => setShowCurrencyMenu(!showCurrencyMenu)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    <span>{currency.toUpperCase()}</span>
                    <FiChevronDown className="size-3" aria-hidden="true" />
                  </button>
                  {showCurrencyMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[120px]">
                      {CURRENCIES.map((c) => (
                        <button
                          key={c}
                          onClick={() => handleCurrencyChange(c)}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            currency === c ? "font-medium text-gray-900" : "text-gray-600"
                          }`}
                        >
                          {c.toUpperCase()} - {CURRENCY_INFO[c].symbol}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-500 mt-1">{currency.toUpperCase()}</span>
              )}
            </div>
            <div className="text-right">
              {statsError ? (
                <div className="text-sm text-red-600">
                  <span className="block">{statsError}</span>
                  <button
                    onClick={() => loadStats(currency)}
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
                  {stats?.change24h !== undefined && (
                    <span className={`text-sm font-medium ${stats.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {stats.change24h >= 0 ? "+" : ""}{formatAmount({ value: stats.change24h, maximumFractionDigits: 2 })}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section Header with Tabs left, Buy Bitcoin link right */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {TIME_RANGES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleRangeChange(t.id)}
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
          <a
            href="https://simpleswap.io/?from=sol-sol&to=btc-btc"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => analytics.track('buy_bitcoin')}
          >
            Buy Bitcoin
          </a>
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
                onClick={() => loadChartData(range, currency)}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Try Again
              </button>
            </div>
          ) : (
            <PriceChart
              data={priceHistory}
              height={CHART_HEIGHT}
              lineColor="#f97316"
              loading={chartLoading}
              className="w-full"
              currencySymbol={currencySymbol}
            />
          )}
        </div>
      </div>
    </div>
  );
}
