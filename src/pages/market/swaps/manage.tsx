import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiExternalLink, FiRefreshCw, FaSpinner } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { getWalletService } from '@/services/walletService';
import {
  fetchSwapListings,
  prepareCancel,
  cancelListing,
  type SwapListing,
} from '@/utils/xcpdex-api';
import { formatAmount, formatAsset, formatTimeAgo } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import type { ReactElement } from 'react';

export default function MyListingsPage(): ReactElement {
  const navigate = useNavigate();
  const { activeAddress } = useWallet();
  const { setHeaderProps } = useHeader();

  const [listings, setListings] = useState<SwapListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    if (!activeAddress) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchSwapListings({ seller: activeAddress.address });
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setIsLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    setHeaderProps({
      title: 'My Listings',
      onBack: () => navigate(-1),
      rightButton: {
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: loadListings,
        ariaLabel: 'Refresh listings',
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, loadListings]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handleCancel = async (listing: SwapListing) => {
    if (!activeAddress) return;
    setCancellingId(listing.id);
    setError('');

    try {
      // Step 1: Get challenge
      const { challenge } = await prepareCancel(listing.id);

      // Step 2: Sign challenge with BIP-322
      const walletService = getWalletService();
      const { signature } = await walletService.signMessage(
        challenge,
        activeAddress.address
      );

      // Step 3: Submit cancellation
      await cancelListing(
        listing.id,
        activeAddress.address,
        challenge,
        signature
      );

      // Remove from list
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
    } catch (err) {
      console.error('Cancel failed:', err);
      const apiErr = err as { response?: { data?: { error?: string } } };
      const serverMsg = apiErr?.response?.data?.error;
      setError(serverMsg || (err instanceof Error ? err.message : 'Failed to cancel listing'));
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <FaSpinner className="text-2xl text-blue-600 animate-spin" aria-label="Loading..." />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}

      {listings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 mb-4">No active listings</p>
          <Button color="gray" onClick={() => navigate('/index?tab=UTXOs')}>
            Browse UTXOs
          </Button>
        </div>
      ) : (
        listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            isCancelling={cancellingId === listing.id}
            onCancel={() => handleCancel(listing)}
          />
        ))
      )}
    </div>
  );
}

function ListingCard({
  listing,
  isCancelling,
  onCancel,
}: {
  listing: SwapListing;
  isCancelling: boolean;
  onCancel: () => void;
}): ReactElement {
  const priceBtc = fromSatoshis(listing.price_sats, true);
  const displayAsset = listing.asset_longname || listing.asset;
  const createdTime = Math.floor(new Date(listing.created_at).getTime() / 1000);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {formatAsset(listing.asset, {
              assetInfo: { asset_longname: listing.asset_longname },
              shorten: true,
            })}
          </p>
          <p className="text-xs text-gray-500">
            {listing.asset_quantity} &middot; Listed {formatTimeAgo(createdTime)}
          </p>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-sm font-bold text-gray-900">
            {formatAmount({ value: priceBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
          </p>
          <p className="text-xs text-gray-400">{listing.price_sats.toLocaleString()} sats</p>
        </div>
      </div>

      {listing.expires_at && (
        <p className="text-xs text-gray-400 mb-2">
          Expires {new Date(listing.expires_at).toLocaleDateString()}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <Button
          color="red"
          fullWidth
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? (
            <>
              <FaSpinner className="animate-spin mr-1" aria-hidden="true" />
              Cancelling...
            </>
          ) : (
            'Cancel'
          )}
        </Button>
        <Button
          color="gray"
          onClick={() => {
            window.open(
              `https://xcpdex.com/swap/${encodeURIComponent(displayAsset)}`,
              '_blank'
            );
          }}
          aria-label="View on xcpdex.com"
        >
          <FiExternalLink className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
