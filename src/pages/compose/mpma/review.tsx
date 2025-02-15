import React, { useState } from "react";
import { formatAddress, formatAmount } from "@/utils/format";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";

interface ReviewSendProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewMPMA({ apiResponse, onSign, onBack }: ReviewSendProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { result } = apiResponse;
  // In this MPMA flow we assume the transaction is multi-destination.
  const asset = result.params.asset || "XCP";
  const assetDivisible = asset !== "BTC";

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

  // Calculate total amount across all destinations.
  const calculateTotal = () => {
    const total = result.params.asset_dest_quant_list?.reduce(
      (sum: number, entry: [string, string, string]) => sum + Number(entry[2]),
      0
    );
    return total ? formatQuantity(total) : null;
  };

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
          <div className="space-y-2">
            {result.params.asset_dest_quant_list?.map(
              ([, destination]: [string, string, string], index: number) => (
                <div key={index} className="bg-gray-50 p-2 rounded break-all text-gray-900">
                  {destination}
                </div>
              )
            )}
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
          <span className="font-semibold text-gray-700">
            Amount (per destination):
          </span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {`${formatQuantity(Number(result.params.asset_dest_quant_list?.[0]?.[2] || 0))} ${asset}`}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Total:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900 font-medium">
            {calculateTotal()} {asset}
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
