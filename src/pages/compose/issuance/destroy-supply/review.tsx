import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useComposer } from "@/contexts/composer-context";
import { formatAddress, formatAmount } from "@/utils/format";

interface ReviewDestroyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewDestroy({
  apiResponse,
  onSign,
  onBack,
}: ReviewDestroyProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { error, setError } = useComposer();
  const { result } = apiResponse;
  
  // Get asset info from the API response
  const asset = result.params.asset;
  const assetDivisible = result.params.asset_info?.divisible ?? true;

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await onSign();
    } finally {
      setIsSigning(false);
    }
  };

  const formatQuantity = (quantity: number) => {
    return assetDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();
  };

  return (
    <div
      role="region"
      aria-label="Transaction Review"
      className="p-4 bg-white rounded-lg shadow-lg space-y-4"
    >
      <h3 className="text-lg font-bold">Review Destroy</h3>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(result.params.source, true)}
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Amount:</span>
          <div className="text-gray-900 break-words bg-gray-50 p-2 rounded">
            {formatQuantity(Number(result.params.quantity))} {asset}
          </div>
        </div>

        {/* Memo */}
        {result.params.tag && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Memo:</span>
            <div className="text-gray-900 break-words bg-gray-50 p-2 rounded">
              {result.params.tag}
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
            })}{" "}
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

      <div className="flex space-x-4">
        <Button onClick={onBack} color="gray">
          Back
        </Button>
        <Button
          color="blue"
          onClick={handleSignClick}
          disabled={isSigning}
          className="flex-1"
        >
          {isSigning ? "Signing..." : "Sign & Broadcast"}
        </Button>
      </div>
    </div>
  );
}
