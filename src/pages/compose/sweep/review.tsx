import React, { useState, useEffect } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { getSweepEstimateXcpFee } from "@/utils/blockchain/counterparty/compose";
import { formatAddress, formatAmount } from "@/utils/format";

// These flag options help display a friendly sweep type name.
const flagOptions = [
  { id: 1, name: "Asset Balances Only", value: 1 },
  { id: 2, name: "Asset Ownership Only", value: 2 },
  { id: 3, name: "Asset Balances & Ownership", value: 1 | 2 },
];

function getSweepTypeName(flags: number) {
  const option = flagOptions.find((opt) => opt.value === flags);
  return option ? option.name : "Unknown";
}

interface ReviewSweepProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
}

export function ReviewSweep({ apiResponse, onSign, onBack }: ReviewSweepProps) {
  const [isSigning, setIsSigning] = useState(false);
  const [xcpFee, setXcpFee] = useState<number | null>(null);
  const [isLoadingFees, setIsLoadingFees] = useState(true);
  const { result } = apiResponse;

  useEffect(() => {
    const fetchXcpFee = async () => {
      try {
        const fee = await getSweepEstimateXcpFee(result.params.source);
        setXcpFee(fee);
      } catch (err) {
        console.error("Failed to fetch XCP fee:", err);
      } finally {
        setIsLoadingFees(false);
      }
    };

    fetchXcpFee();
  }, [result.params.source]);

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await onSign();
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Sweep</h3>

      {/* Display any error returned in the composed result */}
      {result.error && (
        <ErrorAlert message={result.error} onClose={() => {}} />
      )}

      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(result.params.source, true)}
          </div>
        </div>

        {/* To Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">To:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {result.params.destination}
          </div>
        </div>

        {/* Sweep Type */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Sweep:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {getSweepTypeName(result.params.flags)}
          </div>
        </div>

        {/* Memo */}
        {result.params.memo && (
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Memo:</span>
            <div className="text-gray-900 bg-gray-50 p-2 rounded break-all">
              {result.params.memo}
            </div>
          </div>
        )}

        {/* Fees */}
        <div className="space-y-4">
          {/* Gas Fee */}
          <div className="space-y-1">
            <span className="font-semibold text-gray-700">Gas:</span>
            <div className="text-gray-900 bg-gray-50 p-2 rounded">
              {isLoadingFees ? (
                <span className="text-gray-500">Loading...</span>
              ) : xcpFee !== null ? (
                `${formatAmount({
                  value: xcpFee / 1e8,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} XCP`
              ) : (
                <span className="text-red-500">Failed to load XCP fee</span>
              )}
            </div>
          </div>

          {/* BTC Fee */}
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
        <Button onClick={handleSignClick} color="blue" disabled={isSigning}>
          {isSigning ? "Signing..." : "Sign & Broadcast"}
        </Button>
      </div>
    </div>
  );
}
