import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TbRepeat, FiRefreshCw } from '@/components/icons';
import { Spinner } from '@/components/ui/spinner';
import { AssetHeader } from '@/components/ui/headers/asset-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorAlert } from '@/components/ui/error-alert';
import { CopyableStat } from '@/components/ui/copyable-stat';
import { AssetSwapCard } from '@/components/ui/cards/asset-swap-card';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { formatPrice, getRawPrice, getNextPriceUnit } from '@/utils/price-format';
import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { fetchSwapListings, type SwapListing } from '@/utils/xcpdex-api';
import { fetchAssetDetails, type AssetInfo } from '@/utils/blockchain/counterparty/api';
import type { PriceUnit } from '@/utils/settings';
import type { ReactElement } from 'react';

const REFRESH_COOLDOWN_MS = 5000;

function getSatsPerUnit(listing: SwapListing): number {
  const qty = Number(listing.asset_quantity);
  if (qty <= 0) return Infinity;
  return listing.price_sats / qty;
}

export default function AssetSwapsPage(): ReactElement {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);
  const { copy, isCopied } = useCopyToClipboard();

  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [listings, setListings] = useState<SwapListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(settings.priceUnit);
  const lastRefreshRef = useRef(0);

  const togglePriceUnit = useCallback(() => {
    const nextUnit = getNextPriceUnit(priceUnit, btcPrice !== null);
    setPriceUnit(nextUnit);
    updateSettings({ priceUnit: nextUnit }).catch(console.error);
  }, [priceUnit, btcPrice, updateSettings]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!asset) return;
    if (isRefresh) {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
      lastRefreshRef.current = now;
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [info, swaps] = await Promise.all([
        fetchAssetDetails(asset),
        fetchSwapListings({ asset }),
      ]);

      if (info) setAssetInfo(info);

      swaps.sort((a, b) => getSatsPerUnit(a) - getSatsPerUnit(b));
      setListings(swaps);
    } catch (err) {
      console.error('Failed to load swaps:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load swaps');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [asset]);

  useEffect(() => {
    setHeaderProps({
      title: 'Swaps',
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: 'Refresh swaps',
        icon: <FiRefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />,
        onClick: () => loadData(true),
        disabled: isRefreshing,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isRefreshing, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats — matches dispenser page pattern
  const stats = useMemo(() => {
    if (listings.length === 0) return null;

    const floorPrice = Math.min(...listings.map(getSatsPerUnit));

    const totalQty = listings.reduce((sum, l) => sum + Number(l.asset_quantity), 0);
    const totalBtcSats = listings.reduce((sum, l) => sum + l.price_sats, 0);
    const totalBtc = fromSatoshis(totalBtcSats, true);

    const weightedSum = listings.reduce(
      (sum, l) => sum + getSatsPerUnit(l) * Number(l.asset_quantity), 0
    );
    const weightedAvg = totalQty > 0 ? weightedSum / totalQty : 0;

    return {
      floorPrice: Math.round(floorPrice),
      weightedAvg: Math.round(weightedAvg),
      totalQty,
      totalBtc,
    };
  }, [listings]);

  if (loading) {
    return <Spinner message={`Loading ${asset} swaps…`} />;
  }

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex flex-col flex-grow min-h-0">
        <div className="p-4 pb-0 flex-shrink-0">
          {assetInfo && (
            <AssetHeader assetInfo={assetInfo} showInfoPopover className="mb-4" />
          )}

          {/* Stats Card — matches dispenser page */}
          <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
                {stats ? (
                  <>
                    <CopyableStat
                      label="Floor"
                      value={formatPrice(stats.floorPrice, priceUnit, btcPrice, settings.fiat)}
                      rawValue={getRawPrice(stats.floorPrice, priceUnit, btcPrice, settings.fiat)}
                      onCopy={copy}
                      isCopied={isCopied(getRawPrice(stats.floorPrice, priceUnit, btcPrice, settings.fiat))}
                    />
                    <CopyableStat
                      label="Avg"
                      value={formatPrice(stats.weightedAvg, priceUnit, btcPrice, settings.fiat)}
                      rawValue={getRawPrice(stats.weightedAvg, priceUnit, btcPrice, settings.fiat)}
                      onCopy={copy}
                      isCopied={isCopied(getRawPrice(stats.weightedAvg, priceUnit, btcPrice, settings.fiat))}
                    />
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-gray-500">Floor</span>
                      <div className="font-medium text-gray-900">&mdash;</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Avg</span>
                      <div className="font-medium text-gray-900">&mdash;</div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={togglePriceUnit}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                aria-label={`Switch price display to ${getNextPriceUnit(priceUnit, btcPrice !== null).toUpperCase()}`}
              >
                <TbRepeat className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable listings */}
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4">
          {loadError && (
            <ErrorAlert message={loadError} onClose={() => setLoadError('')} />
          )}

          {listings.length > 0 ? (
            <div className="space-y-2">
              {listings.map((listing) => (
                <AssetSwapCard
                  key={listing.id}
                  listing={listing}
                  formattedTotalPrice={formatPrice(listing.price_sats, priceUnit, btcPrice, settings.fiat)}
                  formattedUnitPrice={formatPrice(getSatsPerUnit(listing), priceUnit, btcPrice, settings.fiat)}
                  onClick={() => navigate(`/market/swaps/buy/${listing.id}`)}
                  onCopyAddress={copy}
                  isCopied={isCopied(listing.seller_address)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message={`No active swap listings for ${asset}`} />
          )}

          {/* Footer summary */}
          {stats && listings.length > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500 px-1 pt-2 pb-2">
              <span>
                {formatAmount({ value: stats.totalBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
              </span>
              <span>
                for {formatAmount({ value: stats.totalQty, maximumFractionDigits: 0 })} {asset}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
