import React, { useState } from 'react';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { formatAmount } from '@/utils/format';

interface ReviewOrderProps {
  apiResponse: any;
  giveAsset: string;
  assetDivisible: boolean;
  handleSignAndBroadcast: () => Promise<void>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export const ReviewOrder = ({
  apiResponse,
  giveAsset,
  assetDivisible,
  handleSignAndBroadcast,
  error,
  setError,
}: ReviewOrderProps) => {
  const [isSigning, setIsSigning] = useState(false);
  const [isPriceFlipped, setIsPriceFlipped] = useState(false);
  const { result } = apiResponse;

  const getPriceDisplay = () => {
    const giveQuantity = Number(result.params.give_quantity) / 1e8;
    const getQuantity = Number(result.params.get_quantity) / 1e8;
    if (isPriceFlipped) {
      return {
        baseAsset: result.params.get_asset,
        quoteAsset: result.params.give_asset,
        ratio: giveQuantity / getQuantity,
      };
    } else {
      return {
        baseAsset: result.params.give_asset,
        quoteAsset: result.params.get_asset,
        ratio: getQuantity / giveQuantity,
      };
    }
  };

  const priceDisplay = getPriceDisplay();

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await handleSignAndBroadcast();
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Transaction Review"
      className="p-4 bg-white rounded-lg shadow-lg space-y-4"
    >
      <h3 className="text-lg font-bold">Review Order</h3>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      <div className="space-y-4">
        {/* Give Amount */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Give:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {assetDivisible
              ? formatAmount({
                  value: Number(result.params.give_quantity) / 1e8,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })
              : result.params.give_quantity}{' '}
            {result.params.give_asset}
          </div>
        </div>

        {/* Get Amount */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Get:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {formatAmount({
              value: Number(result.params.get_quantity) / 1e8,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{' '}
            {result.params.get_asset}
          </div>
        </div>

        {/* Price */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Price:</span>
          <div
            className="text-gray-900 bg-gray-50 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-gray-100"
            onClick={() => setIsPriceFlipped((prev) => !prev)}
          >
            <span>
              1 {priceDisplay.baseAsset} ={' '}
              {formatAmount({
                value: priceDisplay.ratio,
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
              })}{' '}
              {priceDisplay.quoteAsset}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-gray-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Expiration (if not default) */}
        {result.params.expiration !== 8064 && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Expiration:</span>
            <div className="text-gray-900 bg-gray-50 p-2 rounded">
              {result.params.expiration} blocks
            </div>
          </div>
        )}

        {/* Fee */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {formatAmount({
              value: result.btc_fee / 1e8,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{' '}
            BTC
          </div>
        </div>
      </div>

      {/* Raw Transaction (collapsible) */}
      <div className="mt-4">
        <details>
          <summary className="text-md font-semibold cursor-pointer text-gray-700 hover:text-gray-900">
            Raw Transaction
          </summary>
          <pre className="mt-2 overflow-y-auto overflow-x-auto text-sm bg-gray-50 p-3 rounded-md h-44 border border-gray-200">
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </details>
      </div>

      <Button color="blue" fullWidth onClick={handleSignClick} disabled={isSigning}>
        {isSigning ? "Signing..." : "Sign & Broadcast"}
      </Button>
    </div>
  );
};
