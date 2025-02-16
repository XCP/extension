import React, { useState } from "react";
import { formatAddress, formatAmount } from "@/utils/format";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";

interface ReviewSendProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewSend({ apiResponse, onSign, onBack }: ReviewSendProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { result } = apiResponse;
  const asset = result.params.asset || "XCP";
  // Use asset_info.divisible if available; otherwise, default to asset !== "BTC"
  const assetDivisible = result.params.asset_info?.divisible ?? (asset !== "BTC");

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await onSign();
    } finally {
      setIsSigning(false);
    }
  };

  const formatQuantity = (quantity: number) =>
    assetDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();

  const formatBTCAmount = (amount: number) =>
    formatAmount({
      value: amount / 1e8,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    });

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Transaction</h3>

      {result.error && (
        <ErrorAlert message={result.error} onClose={() => {}} />
      )}

      <div className="space-y-4">
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {formatAddress(result.params.source, true)}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">To:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {result.params.destination}
          </div>
        </div>
        {result.params.memo && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Memo:</span>
            <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
              {result.params.memo}
            </div>
          </div>
        )}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Amount:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {`${formatQuantity(Number(result.params.quantity))} ${asset}`}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {formatBTCAmount(result.btc_fee)} BTC
          </div>
        </div>
      </div>

      <div className="mt-4">
        <details>
          <summary className="text-md font-semibold cursor-pointer text-gray-700 hover:text-gray-900">
            Raw Transaction
          </summary>
          <pre className="mt-2 overflow-y-auto overflow-x-auto text-sm bg-gray-50 p-3 rounded-md h-[175px] border border-gray-200">
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </details>
      </div>

      <div className="flex space-x-4 mt-4">
        <Button onClick={onBack} color="gray">
          Back
        </Button>
        <Button onClick={handleSignClick} color="blue" disabled={isSigning}>
          {isSigning ? "Signing..." : "Sign & Broadcast"}
        </Button>
      </div>
    </div>
  );
}
