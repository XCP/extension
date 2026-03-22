import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FiExternalLink, FiAlertTriangle, FiHelpCircle, FaCheckCircle, FaSpinner } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { AddressHeader } from '@/components/ui/headers/address-header';
import { PriceWithSuggestInput } from '@/components/ui/inputs/price-with-suggest-input';
import { ExpiryInput } from '@/components/ui/inputs/expiry-input';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { useTradingPair } from '@/hooks/useTradingPair';
import { getWalletService } from '@/services/walletService';
import { fetchUtxoBalances, type UtxoBalance } from '@/utils/blockchain/counterparty/api';
import { prepareListing, completeListing } from '@/utils/xcpdex-api';
import { formatAmount, formatAsset, formatTxid } from '@/utils/format';
import { fromSatoshis, toSatoshis } from '@/utils/numeric';
import type { ReactElement } from 'react';

const SIGHASH_SINGLE_ANYONECANPAY = 0x83;

type ListingStep = 'form' | 'review' | 'signing' | 'submitting' | 'success';

export default function SwapListPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeAddress, activeWallet } = useWallet();
  const { setHeaderProps } = useHeader();
  const { settings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);

  const utxoParam = searchParams.get('utxo') || '';
  const [txid, voutStr] = utxoParam.split(':');
  const vout = parseInt(voutStr, 10);

  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [isLoadingUtxo, setIsLoadingUtxo] = useState(true);
  const [priceBtc, setPriceBtc] = useState('');
  const [expiresAt, setExpiresAt] = useState('none');
  const [step, setStep] = useState<ListingStep>('form');
  const [error, setError] = useState('');
  const [showHelpText, setShowHelpText] = useState(false);

  const primaryBalance = balances[0];
  const asset = primaryBalance?.asset || '';
  const assetLongname = primaryBalance?.asset_info?.asset_longname ?? null;
  const quantity = primaryBalance?.quantity ?? 0;
  const quantityNormalized = primaryBalance?.quantity_normalized || '0';
  const isDivisible = primaryBalance?.asset_info?.divisible ?? false;

  // Fetch last trade price for price suggestions.
  // Trading pair price is per-unit; swaps price the entire UTXO,
  // so multiply by quantity to get the suggested total price.
  const { data: rawTradingPair } = useTradingPair(asset || undefined, asset ? 'BTC' : undefined);
  const tradingPairData = rawTradingPair?.last_trade_price
    ? {
        ...rawTradingPair,
        last_trade_price: (Number(rawTradingPair.last_trade_price) * Number(quantityNormalized)).toFixed(8),
      }
    : rawTradingPair;

  const priceSats = priceBtc ? Number(toSatoshis(priceBtc)) : 0;
  const priceValid = priceSats > 0;
  const priceBtcNum = priceValid ? fromSatoshis(priceSats, true) : 0;

  useEffect(() => {
    setHeaderProps({
      title: step === 'review' ? 'Confirm Listing' : 'List for Sale',
      onBack: () => step === 'review' ? setStep('form') : navigate(-1),
      ...(step === 'form' && {
        rightButton: {
          icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
          onClick: () => setShowHelpText(prev => !prev),
          ariaLabel: 'Toggle help text',
        },
      }),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, step]);

  // Load UTXO balances
  useEffect(() => {
    if (!utxoParam) {
      setIsLoadingUtxo(false);
      return;
    }
    setIsLoadingUtxo(true);
    fetchUtxoBalances(utxoParam)
      .then((res) => setBalances(res.result))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load UTXO'))
      .finally(() => setIsLoadingUtxo(false));
  }, [utxoParam]);

  const handleConfirm = async () => {
    if (!activeAddress || !priceValid || !asset) return;

    setError('');
    setStep('signing');

    try {
      // Re-verify UTXO still has assets before submitting
      const freshBalances = await fetchUtxoBalances(utxoParam);
      if (!freshBalances.result?.length) {
        setError('This UTXO no longer has assets. It may have been spent or detached.');
        setStep('review');
        return;
      }

      const { psbt_hex } = await prepareListing({
        seller_address: activeAddress.address,
        utxo_txid: txid,
        utxo_vout: vout,
        asset,
        price_sats: priceSats,
      });

      const walletService = getWalletService();
      const signedPsbtHex = await walletService.signPsbt(
        psbt_hex,
        { [activeAddress.address]: [0] },
        [SIGHASH_SINGLE_ANYONECANPAY]
      );

      setStep('submitting');
      await completeListing({
        seller_address: activeAddress.address,
        utxo_txid: txid,
        utxo_vout: vout,
        asset,
        asset_longname: assetLongname,
        asset_quantity: Number(quantityNormalized),
        price_sats: priceSats,
        signed_psbt_hex: signedPsbtHex,
        expires_at: expiresAt === 'none' ? null : expiresAt,
      });

      setStep('success');
    } catch (err: unknown) {
      console.error('Listing failed:', err);
      // Extract server error message from API error response
      const apiErr = err as { response?: { data?: { error?: string } } };
      const serverMsg = apiErr?.response?.data?.error;
      setError(serverMsg || (err instanceof Error ? err.message : 'Failed to create listing'));
      setStep('review');
    }
  };

  // Loading
  if (isLoadingUtxo) {
    return (
      <div className="flex items-center justify-center h-64">
        <FaSpinner className="text-2xl text-blue-600 animate-spin" aria-label="Loading..." />
      </div>
    );
  }

  if (!utxoParam || !txid) {
    return (
      <div className="p-4">
        <ErrorAlert message="No UTXO specified. Navigate here from a UTXO details page." />
      </div>
    );
  }

  if (!isLoadingUtxo && balances.length === 0 && !error) {
    return (
      <div className="p-4">
        <ErrorAlert message="No assets found on this UTXO. It may have been spent or detached." />
      </div>
    );
  }

  // Success — matches SuccessScreen pattern
  if (step === 'success') {
    const viewAsset = assetLongname || asset;
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
        <div className="p-6 bg-green-50 rounded-lg shadow-lg text-center max-w-md w-full">
          <FaCheckCircle className="text-green-600 size-10 mx-auto" aria-hidden="true" />
          <h2 className="text-xl font-bold text-green-800 mt-3">Listing Created</h2>
          <p className="mt-1 text-sm text-green-700">
            {formatAsset(asset, { assetInfo: primaryBalance?.asset_info, shorten: true })} listed for{' '}
            {formatAmount({ value: priceBtcNum, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
          </p>
          <Button color="blue" fullWidth className="mt-4" onClick={() => {
            window.open(`https://xcpdex.com/swap/${encodeURIComponent(viewAsset)}`, '_blank');
          }}>
            <FiExternalLink className="mr-2" aria-hidden="true" />
            View on xcpdex.com
          </Button>
        </div>
        <button
          onClick={() => navigate('/market?tab=swaps&mode=manage')}
          className="mt-3 text-xs text-gray-500 hover:text-blue-600 hover:underline transition-colors cursor-pointer"
        >
          Manage your listings →
        </button>
      </div>
    );
  }

  // Signing / submitting
  if (step === 'signing' || step === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FaSpinner className="text-3xl text-blue-600 animate-spin" aria-label="Processing..." />
        <p className="text-sm text-gray-600">
          {step === 'signing' ? 'Signing transaction...' : 'Submitting listing...'}
        </p>
      </div>
    );
  }

  // Review — matches ReviewScreen pattern (label + gray box fields)
  if (step === 'review') {
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
          <h2 className="text-lg font-bold text-gray-900">Review Listing</h2>

          {error && <ErrorAlert message={error} onClose={() => setError('')} />}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="font-semibold text-gray-700">Asset:</label>
              <div className="bg-gray-50 p-2 rounded text-gray-900">
                {formatAsset(asset, { assetInfo: primaryBalance?.asset_info, shorten: true })}
                <span className="text-gray-500 ml-2">
                  {formatAmount({
                    value: Number(quantityNormalized),
                    minimumFractionDigits: isDivisible ? 8 : 0,
                    maximumFractionDigits: isDivisible ? 8 : 0,
                    useGrouping: true,
                  })}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-gray-700">Output:</label>
              <div className="bg-gray-50 p-2 rounded font-mono text-gray-900 break-all">
                {utxoParam}
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-gray-700">Price:</label>
              <div className="bg-gray-50 p-2 rounded text-gray-900">
                <div className="flex justify-between items-center">
                  <span>
                    {formatAmount({ value: priceBtcNum, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
                  </span>
                  {btcPrice && (
                    <span className="text-gray-500">
                      ${formatAmount({ value: priceBtcNum * btcPrice, minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-gray-700">Listing Expires:</label>
              <div className="bg-gray-50 p-2 rounded text-gray-900">
                {expiresAt !== 'none' ? (
                  <>
                    {new Date(expiresAt).toLocaleDateString()}
                    <span className="text-gray-500 ml-2">
                      ({Math.round((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} days)
                    </span>
                  </>
                ) : (
                  'No expiration'
                )}
              </div>
            </div>
          </div>

          {balances.length > 1 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-start">
                <FiAlertTriangle className="size-4 text-orange-600 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <div className="text-xs text-orange-800">
                  <p className="font-medium">This UTXO contains {balances.length} assets</p>
                  <p className="mt-1">
                    The buyer will receive all assets:
                    {' '}{balances.map(b => formatAsset(b.asset, { assetInfo: b.asset_info, shorten: true })).join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <Button onClick={() => setStep('form')} color="gray" aria-label="Go back to edit listing">
              Back
            </Button>
            <Button onClick={handleConfirm} color="blue" fullWidth aria-label="Sign and create listing">
              Sign & List
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Form view
  return (
    <div className="p-4 space-y-4">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ''}
          className="mt-1 mb-5"
        />
      )}

      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
        {error && (
          <ErrorAlert message={error} onClose={() => setError('')} />
        )}

        <div className="space-y-4">
          {/* UTXO display — clickable link to detail page */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Output <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => navigate(`/assets/utxos/${utxoParam}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/assets/utxos/${utxoParam}`);
                }
              }}
              className="mt-1 block w-full p-2.5 rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              role="button"
              tabIndex={0}
            >
              <span className="text-sm font-mono text-blue-600 hover:text-blue-800">
                {formatTxid(utxoParam)}
              </span>
              <span className="text-sm text-gray-500">
                {balances.length} {balances.length === 1 ? 'Balance' : 'Balances'}
              </span>
            </div>
          </div>

          {/* Multi-asset warning */}
          {balances.length > 1 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-start">
                <FiAlertTriangle className="size-4 text-orange-600 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <div className="text-xs text-orange-800">
                  <p className="font-medium">This UTXO contains {balances.length} assets</p>
                  <p className="mt-1">
                    The swap transfers the entire UTXO. The buyer will receive all assets:
                    {' '}{balances.map(b => formatAsset(b.asset, { assetInfo: b.asset_info, shorten: true })).join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Price input with suggested price from last trade */}
          <PriceWithSuggestInput
            value={priceBtc}
            onChange={setPriceBtc}
            tradingPairData={tradingPairData}
            showHelpText={showHelpText}
            label="Price in Bitcoin"
            name="price-btc"
            priceDescription="Total BTC you want to receive for this UTXO."
            showPairFlip={false}
            hideTradingPairInfo
          />

          {/* Expiry */}
          <ExpiryInput
            showHelpText={showHelpText}
            onChange={setExpiresAt}
          />

          {/* Continue to review */}
          <Button
            color="blue"
            fullWidth
            onClick={() => setStep('review')}
            disabled={!priceValid || !asset}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
