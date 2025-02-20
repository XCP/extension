import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { formatAddress, formatAmount } from "@/utils/format";

interface ReviewBetProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewBet({ apiResponse, onSign, onBack }: ReviewBetProps) {
  const [isSigning, setIsSigning] = useState(false);
  const { result } = apiResponse;

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await onSign();
    } finally {
      setIsSigning(false);
    }
  };

  const formatQuantity = (quantity: number) =>
    formatAmount({
      value: quantity / 1e8,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    });

  const formatBTCAmount = (amount: number) =>
    formatAmount({
      value: amount / 1e8,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    });

  const betTypeMapping: { [key: string]: string } = {
    "0": "Bullish CFD (deprecated)",
    "1": "Bearish CFD (deprecated)",
    "2": "Equal",
    "3": "NotEqual",
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Bet Transaction</h3>

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
          <span className="font-semibold text-gray-700">Feed Address:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {result.params.feed_address}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Bet Type:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {betTypeMapping[result.params.bet_type] || result.params.bet_type}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Deadline:</span>
          <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
            {result.params.deadline}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Wager Quantity:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {`${formatQuantity(Number(result.params.wager_quantity))} XCP`}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Counterwager Quantity:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {`${formatQuantity(Number(result.params.counterwager_quantity))} XCP`}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Expiration (Blocks):</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {result.params.expiration}
          </div>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Leverage:</span>
          <div className="bg-gray-50 p-2 rounded text-gray-900">
            {result.params.leverage}
          </div>
        </div>
        {result.params.target_value && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Target Value:</span>
            <div className="bg-gray-50 p-2 rounded text-gray-900">
              {result.params.target_value}
            </div>
          </div>
        )}
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
