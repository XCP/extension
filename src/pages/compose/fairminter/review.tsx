import React, { FC, useState } from 'react';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { formatAddress, formatAmount } from '@/utils/format';

export interface ReviewFairminterProps {
  apiResponse: any;
  handleSignAndBroadcast: () => Promise<void>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export const ReviewFairminter: FC<ReviewFairminterProps> = ({
  apiResponse,
  handleSignAndBroadcast,
  error,
  setError,
}) => {
  const [isSigning, setIsSigning] = useState(false);
  const { result } = apiResponse;

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await handleSignAndBroadcast();
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Fairminter</h3>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(result.params.source, true)}
          </div>
        </div>
        {/* Asset */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Asset:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {result.params.asset}
          </div>
        </div>
        {/* Price */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Price:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {result.params.price}
          </div>
        </div>
        {/* Quantity by Price */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Quantity by Price:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {result.params.quantity_by_price}
          </div>
        </div>
        {/* Hard Cap */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Hard Cap:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {result.params.hard_cap}
          </div>
        </div>
        {/* Description (if provided) */}
        {result.params.description && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Description:</span>
            <div className="text-gray-900 bg-gray-50 p-2 rounded">
              {result.params.description}
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
