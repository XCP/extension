import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaClipboard, FaCheck, FaSpinner } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { AddressHeader } from '@/components/ui/headers/address-header';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getWalletService } from '@/services/walletService';
import {
  fetchSwapListing,
  prepareFill,
  completeFill,
  type SwapListing,
  type PrepareFillResponse,
} from '@/utils/xcpdex-api';
import { useFeeRates } from '@/hooks/useFeeRates';
import { useSettings } from '@/contexts/settings-context';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { formatAmount, formatAsset, formatAddress } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import type { ReactElement } from 'react';

// Platform fee: max(price * 2%, 1000 sats) — matches server-side calculatePlatformFee()
function estimatePlatformFee(priceSats: number): number {
  return Math.max(Math.floor(priceSats * 0.02), 1000);
}

// Network fee estimate matching server's constructBuyerPsbt() sizing:
// ~68 vB per input (P2WPKH), ~31 vB per output, ~10 vB overhead
// Server uses hourFee from mempool.space (min 1, fallback 3)
function estimateNetworkFee(feeRateSatVb: number): number {
  const outputCount = 4; // seller pay + buyer dust + platform fee + change
  const estimatedVsize = 10 + (3 * 68) + (outputCount * 31); // seller input + ~2 buyer inputs + outputs
  return Math.ceil(estimatedVsize * feeRateSatVb);
}

type BuyStep = 'review' | 'preparing' | 'signing' | 'broadcasting' | 'success';

export default function SwapBuyPage(): ReactElement {
  const { id: listingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeAddress, activeWallet } = useWallet();
  const { setHeaderProps } = useHeader();
  const { copy, isCopied } = useCopyToClipboard();

  const { feeRates } = useFeeRates(true);
  const { settings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);
  const [listing, setListing] = useState<SwapListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fillData, setFillData] = useState<PrepareFillResponse | null>(null);
  const [step, setStep] = useState<BuyStep>('review');
  const [error, setError] = useState('');
  const [txId, setTxId] = useState('');

  useEffect(() => {
    const titles: Record<BuyStep, string> = {
      review: 'Buy Listing',
      preparing: 'Buy Listing',
      signing: 'Buy Listing',
      broadcasting: 'Buy Listing',
      success: 'Swap Complete',
    };
    setHeaderProps({
      title: titles[step],
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, step]);

  // Load listing only (no prepareFill — that happens on submit)
  useEffect(() => {
    if (!listingId) return;
    setIsLoading(true);
    fetchSwapListing(listingId)
      .then((data) => setListing(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load listing'))
      .finally(() => setIsLoading(false));
  }, [listingId]);

  const handleBuy = async () => {
    if (!activeAddress || !listing || !listingId) return;
    setError('');
    setStep('preparing');

    try {
      // Step 1: Prepare fill (locks listing, constructs PSBT)
      const fill = await prepareFill(listingId, activeAddress.address);
      setFillData(fill);

      // Step 2: Sign buyer inputs
      setStep('signing');
      const walletService = getWalletService();
      const signedPsbtHex = await walletService.signPsbt(
        fill.psbt_hex,
        { [activeAddress.address]: fill.buyer_input_indices }
      );

      // Step 3: Complete fill (server merges + broadcasts)
      setStep('broadcasting');
      const result = await completeFill(listingId, fill.fill_request_id, signedPsbtHex);
      setTxId(result.tx_id);
      setStep('success');
    } catch (err: unknown) {
      console.error('Buy failed:', err);
      const apiErr = err as { response?: { data?: { error?: string } } };
      const serverMsg = apiErr?.response?.data?.error;
      setError(serverMsg || (err instanceof Error ? err.message : 'Failed to complete swap'));
      setStep('review');
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <FaSpinner className="text-2xl text-blue-600 animate-spin" aria-label="Loading..." />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="p-4">
        <ErrorAlert message={error || 'Listing not found or no longer active.'} />
      </div>
    );
  }

  const priceBtc = fromSatoshis(listing.price_sats, true);
  const displayAsset = formatAsset(listing.asset, {
    assetInfo: { asset_longname: listing.asset_longname },
    shorten: true,
  });

  // Fee estimates (client-side, matches server logic)
  // Server uses hourFee from mempool.space (min 1, fallback 3)
  const serverFeeRate = Math.max(feeRates?.hourFee ?? 3, 1);
  const platformFeeSats = estimatePlatformFee(listing.price_sats);
  const networkFeeSats = estimateNetworkFee(serverFeeRate);
  const platformFeeBtc = fromSatoshis(platformFeeSats, true);
  const networkFeeBtc = fromSatoshis(networkFeeSats, true);

  // Success — matches SuccessScreen pattern
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
        <div className="p-6 bg-green-50 rounded-lg shadow-lg text-center max-w-md w-full">
          <FaCheckCircle className="text-green-600 size-10 mx-auto" aria-hidden="true" />
          <h2 className="text-xl font-bold text-green-800 mt-3">Swap Complete</h2>
          <p className="mt-1 text-sm text-green-700">
            Purchased {displayAsset} for{' '}
            {formatAmount({ value: priceBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
          </p>
          {txId && (
            <>
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Transaction ID</label>
                <div
                  onClick={() => copy(txId)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && copy(txId)}
                  role="button"
                  tabIndex={0}
                  aria-label="Click to copy transaction ID"
                  className="font-mono text-xs bg-white border border-gray-200 rounded-lg p-2 break-all text-gray-800 cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors select-all"
                >
                  {txId}
                </div>
              </div>
              <Button color="blue" fullWidth className="mt-4" onClick={() => copy(txId)} aria-label={isCopied(txId) ? 'Copied' : 'Copy transaction ID'}>
                {isCopied(txId) ? (
                  <><FaCheck className="size-4 mr-2" aria-hidden="true" /><span>Copied!</span></>
                ) : (
                  <><FaClipboard className="size-4 mr-2" aria-hidden="true" /><span>Copy Transaction ID</span></>
                )}
              </Button>
            </>
          )}
        </div>
        {txId && (
          <a
            href={`https://mempool.space/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 text-xs text-gray-500 hover:text-blue-600 hover:underline transition-colors"
            aria-label="View transaction on mempool.space (opens in new tab)"
          >
            View on mempool.space →
          </a>
        )}
      </div>
    );
  }

  // Processing states
  if (step === 'preparing' || step === 'signing' || step === 'broadcasting') {
    const messages = {
      preparing: 'Preparing transaction...',
      signing: 'Signing transaction...',
      broadcasting: 'Broadcasting transaction...',
    };
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FaSpinner className="text-3xl text-blue-600 animate-spin" aria-label="Processing..." />
        <p className="text-sm text-gray-600">{messages[step]}</p>
      </div>
    );
  }

  // Review with estimated fees
  return (
    <div className="p-4 space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ''}
          className="mt-1 mb-5"
        />
      )}

      <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Review Purchase</h2>

        {error && <ErrorAlert message={error} onClose={() => setError('')} />}

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="font-semibold text-gray-700">Seller:</label>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {formatAddress(listing.seller_address, true)}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-gray-700">Asset:</label>
            <div className="bg-gray-50 p-2 rounded text-gray-900">
              {displayAsset}
              <span className="text-gray-500 ml-2">{listing.asset_quantity} units</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-gray-700">Price:</label>
            <div className="bg-gray-50 p-2 rounded text-gray-900">
              <div className="flex justify-between items-center">
                <span>
                  {formatAmount({ value: priceBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
                </span>
                {btcPrice && (
                  <span className="text-gray-500">
                    ${formatAmount({ value: priceBtc * btcPrice, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-gray-700">Platform Fee:</label>
            <div className="bg-gray-50 p-2 rounded text-gray-900">
              <div className="flex justify-between items-center">
                <div>
                  <span>
                    {formatAmount({ value: platformFeeBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
                  </span>
                </div>
                <span className="text-gray-500">
                  {platformFeeSats <= 1000 ? 'min fee' : '2% fee'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-gray-700">Network Fee:</label>
            <div className="bg-gray-50 p-2 rounded text-gray-900">
              <div className="flex justify-between items-center">
                <div>
                  <span>
                    ~{formatAmount({ value: networkFeeBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
                  </span>
                  <span className="text-gray-500 ml-2">
                    (~{serverFeeRate} sats/vB)
                  </span>
                </div>
                {btcPrice && (
                  <span className="text-gray-500">
                    ~${formatAmount({ value: networkFeeBtc * btcPrice, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex space-x-4">
          <Button onClick={() => navigate(-1)} color="gray" aria-label="Cancel purchase">
            Back
          </Button>
          <Button onClick={handleBuy} color="blue" fullWidth aria-label="Sign and complete swap">
            Sign & Buy
          </Button>
        </div>
      </div>
    </div>
  );
}
