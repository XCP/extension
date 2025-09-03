import React, { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { formatAddress, formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";

interface ConsolidationReviewProps {
  apiResponse: {
    params: {
      source: string;
      destination: string;
      feeRateSatPerVByte: number;
    };
    // Include the UTXO data from the form
    utxoData: { count: number; total: number } | null;
    // Include fee configuration and estimates
    feeConfig?: { feeAddress?: string; feePercent?: number } | null;
    estimatedFees?: {
      networkFee: bigint;
      serviceFee: bigint;
      totalFee: bigint;
      netOutput: bigint;
    } | null;
  };
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

// Helper to compute the size of a varint given a number
function varIntSize(n: number): number {
  if (n < 0xfd) return 1;
  else if (n <= 0xffff) return 3;
  else if (n <= 0xffffffff) return 5;
  else return 9;
}

// Estimate transaction size (in bytes) using a rough calculation similar to your consolidation function
function estimateTransactionSize(numInputs: number, numOutputs: number): number {
  let size = 8; // version (4 bytes) + locktime (4 bytes)
  size += varIntSize(numInputs);
  for (let i = 0; i < numInputs; i++) {
    const signaturesSize = 74; // approximate signature size
    size += 36 + varIntSize(signaturesSize) + signaturesSize + 4;
  }
  size += varIntSize(numOutputs);
  for (let i = 0; i < numOutputs; i++) {
    size += 8 + varIntSize(25) + 25; // output: amount + script length + script (assumed 25 bytes)
  }
  return size;
}

export const ConsolidationReview = ({
  apiResponse,
  onSign,
  onBack,
  error,
  setError
}: ConsolidationReviewProps) => {
  const [isSigning, setIsSigning] = useState(false);
  const { params, utxoData, feeConfig, estimatedFees } = apiResponse;

  // Use provided estimates if available, otherwise calculate
  let consolidatingBtc = 0;
  let networkFeeBtc = 0;
  let serviceFeeBtc = 0;
  let totalFeeBtc = 0;
  let netTotalBtc = 0;

  if (estimatedFees) {
    // Use the pre-calculated estimates
    networkFeeBtc = Number(estimatedFees.networkFee) / 100000000; // Convert sats to BTC
    serviceFeeBtc = Number(estimatedFees.serviceFee) / 100000000;
    totalFeeBtc = Number(estimatedFees.totalFee) / 100000000;
    netTotalBtc = Number(estimatedFees.netOutput) / 100000000;
    consolidatingBtc = utxoData ? utxoData.total : 0;
  } else if (utxoData) {
    // Fallback to simple calculation
    consolidatingBtc = utxoData.total;
    const numOutputs = feeConfig?.feeAddress ? 2 : 1;
    const estimatedSize = estimateTransactionSize(utxoData.count, numOutputs);
    const feeSats = estimatedSize * params.feeRateSatPerVByte;
    networkFeeBtc = fromSatoshis(feeSats, true);
    totalFeeBtc = networkFeeBtc;
    netTotalBtc = consolidatingBtc - totalFeeBtc;
  }

  const handleSignClick = async () => {
    setIsSigning(true);
    try {
      await onSign();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg space-y-4">
      <h3 className="text-lg font-bold">Review Consolidation</h3>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div className="space-y-4">
        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">From:</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(params.source, true)}
          </div>
        </div>

        {/* Destination Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">To:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {formatAddress(params.destination, true)}
          </div>
        </div>

        {/* Fee Rate */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee Rate:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {params.feeRateSatPerVByte} sat/vB
          </div>
        </div>

        {/* Additional Information */}
        {utxoData && (
          <>
            <div className="space-y-1">
              <span className="font-semibold text-gray-700">Consolidating:</span>
              <div className="text-gray-900 bg-gray-50 p-2 rounded">
                {formatAmount({
                  value: consolidatingBtc,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })}{" "}
                BTC
              </div>
            </div>

            {/* Fee breakdown */}
            <div className="space-y-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <h4 className="font-semibold text-yellow-900">Fee Breakdown</h4>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Network Fee:</span>
                <span className="text-gray-900">
                  {formatAmount({
                    value: networkFeeBtc,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}{" "}
                  BTC
                </span>
              </div>
              
              {serviceFeeBtc > 0 && feeConfig?.feePercent && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Service Fee ({feeConfig.feePercent}%):</span>
                  <span className="text-gray-900">
                    {formatAmount({
                      value: serviceFeeBtc,
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })}{" "}
                    BTC
                  </span>
                </div>
              )}
              
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span className="text-gray-700">Total Fees:</span>
                <span className="text-yellow-900">
                  {formatAmount({
                    value: totalFeeBtc,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}{" "}
                  BTC
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="font-semibold text-gray-700">Net Total:</span>
              <div className="text-gray-900 bg-gray-50 p-2 rounded">
                {formatAmount({
                  value: netTotalBtc,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })}{" "}
                BTC
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex space-x-4">
        <Button onClick={onBack} color="gray">
          Back
        </Button>
        <Button onClick={handleSignClick} color="blue" fullWidth disabled={isSigning}>
          {isSigning ? "Broadcasting..." : "Broadcast Transaction"}
        </Button>
      </div>
    </div>
  );
};
