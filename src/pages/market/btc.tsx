import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FaBitcoin, FiRefreshCw } from "@/components/icons";
import { PriceChart } from "@/components/ui/charts/price-chart";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import {
  type BtcStats,
  CURRENCY_INFO,
  type FiatCurrency,
  getBtc24hStats,
  getBtcPriceHistory,
  type PricePoint,
  type TimeRange,
} from "@/core/bitcoin/price";
import { formatAmount } from "@/core/format";
import { useFeeRates } from "@/hooks/useFeeRates";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { t } from '@/i18n';
import { analytics } from "@/platform/fathom";

// Time range options (limited to 1h/24h due to CoinGecko API limitations)
const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
];

// Chart dimensions
const CHART_HEIGHT = 200;

/**
 * BtcPrice displays Bitcoin history in the independently saved fiat currency.
 */
export default function BtcPricePage(): ReactElement {
  const { settings } = useSettings();
  return <BtcPriceContent key={settings.fiat} currency={settings.fiat} />;
}

function BtcPriceContent({ currency }: { currency: FiatCurrency }): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { btc: btcUsd, xcp: xcpUsd } = useMarketPrices('usd');

  // Data state
  const [stats, setStats] = useState<BtcStats | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Fee rates from mempool.space
  const { feeRates } = useFeeRates();

  // Time range is local to this currency view
  const [range, setRange] = useState<TimeRange>("24h");

  const currencySymbol = CURRENCY_INFO[currency].symbol;

  // Load stats
  const loadStats = useCallback(async (curr: FiatCurrency) => {
    setStatsError(null);
    try {
      const statsData = await getBtc24hStats(curr);
      if (statsData) {
        setStats(statsData);
      } else {
        setStatsError(t('common_unable_to_load_price'));
      }
    } catch (err) {
      console.error("Failed to load BTC stats:", err);
      setStatsError(t('common_unable_to_load_price'));
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
      setChartError(t('common_unable_to_load_chart_data'));
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

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('market_btc_bitcoin_price'),
      onBack: () => navigate("/market"),
      rightButton: {
        ariaLabel: t('common_refresh_price'),
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
    return <Spinner message={t('market_btc_loading_bitcoin_price')} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        {/* Price Stats Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FaBitcoin className="text-orange-500 text-3xl" aria-hidden="true" />
                <span className="text-xl font-semibold text-gray-900">BTC</span>
              </div>
              <span className="text-xs text-gray-500 mt-1">{t('market_btc_bitcoin', [currency.toUpperCase()])}</span>
            </div>
            <div className="text-right">
              {statsError ? (
                <div className="text-sm text-red-600">
                  <span className="block">{statsError}</span>
                  <button type="button"
                    onClick={() => loadStats(currency)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    {t('common_retry')}
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
              <button type="button"
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
            {t('market_btc_buy_bitcoin')}
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
              <button type="button"
                onClick={() => loadChartData(range, currency)}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {t('common_try_again')}
              </button>
            </div>
          ) : (
            <PriceChart
              data={priceHistory}
              height={CHART_HEIGHT}
              lineColor="#f97316"
              loading={chartLoading}
              className="w-full"
              currencySymbol={`${currency.toUpperCase()} `}
              priceDecimals={CURRENCY_INFO[currency].decimals}
            />
          )}
        </div>

        {/* Exchange Rate & Fee Rates */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mt-4">
          {/* BTC/XCP Exchange Rate */}
          {btcUsd && xcpUsd && xcpUsd > 0 && (
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">{t('market_btc_tx_fee_market')}</span>
              <span className="text-sm font-medium text-gray-900">
                1 BTC = {formatAmount({ value: btcUsd / xcpUsd, maximumFractionDigits: 0 })} XCP
              </span>
            </div>
          )}

          {/* Mempool Fee Rates */}
          {feeRates && (
            <div className="pt-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-md p-2 text-center">
                  <span className="block text-xs text-gray-500">{t('market_btc_fast')}</span>
                  <span className="text-sm font-medium text-gray-900">{feeRates.fastestFee}</span>
                  <span className="text-xs text-gray-400">{t('market_btc_sat_vb')}</span>
                </div>
                <div className="bg-gray-50 rounded-md p-2 text-center">
                  <span className="block text-xs text-gray-500">{t('market_btc_medium')}</span>
                  <span className="text-sm font-medium text-gray-900">{feeRates.halfHourFee}</span>
                  <span className="text-xs text-gray-400">{t('market_btc_sat_vb')}</span>
                </div>
                <div className="bg-gray-50 rounded-md p-2 text-center">
                  <span className="block text-xs text-gray-500">{t('market_btc_slow')}</span>
                  <span className="text-sm font-medium text-gray-900">{feeRates.hourFee}</span>
                  <span className="text-xs text-gray-400">{t('market_btc_sat_vb')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
