import { useState } from "react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { formatAddress, formatAmount } from "@/utils/format";
import { type ConsolidationData } from "@/utils/blockchain/bitcoin/consolidationApi";
import { type ConsolidationResult } from "@/hooks/useMultiBatchConsolidation";

interface ConsolidationReviewProps {
  apiResponse: {
    params: {
      source: string;
      destination: string;
      feeRateSatPerVByte: number;
    };
    consolidationData: ConsolidationData | null;
    allBatches: ConsolidationData[];
  };
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
  isProcessing?: boolean;
  currentBatch?: number;
  results?: ConsolidationResult[];
}

// Calculate estimated fees for all batches
function calculateBatchFees(
  batches: ConsolidationData[],
  feeRate: number
): {
  totalNetworkFee: number;
  totalServiceFee: number;
  totalInput: number;
  totalOutput: number;
} {
  let totalNetworkFee = 0;
  let totalServiceFee = 0;
  let totalInput = 0;
  
  batches.forEach(batch => {
    // Use actual total from API
    const inputSats = Math.floor(batch.summary.total_btc * 100000000 / batch.summary.batches_required);
    totalInput += inputSats;
    
    // More accurate size estimation for bare multisig
    const bytesPerInput = 147; // 1-of-2 bare multisig
    const baseOverhead = 10;
    const bytesPerOutput = 34;
    const numOutputs = batch.fee_config?.fee_percent > 0 ? 2 : 1;
    
    const estimatedSize = (batch.summary.batch_utxos * bytesPerInput) + baseOverhead + (numOutputs * bytesPerOutput);
    const networkFee = Math.ceil(estimatedSize * feeRate);
    totalNetworkFee += networkFee;
    
    // Calculate service fee
    if (batch.fee_config && batch.fee_config.fee_percent > 0) {
      const afterNetworkFee = inputSats - networkFee;
      if (afterNetworkFee > batch.fee_config.exemption_threshold) {
        totalServiceFee += Math.floor(afterNetworkFee * batch.fee_config.fee_percent / 100);
      }
    }
  });
  
  const totalOutput = totalInput - totalNetworkFee - totalServiceFee;
  
  return {
    totalNetworkFee,
    totalServiceFee,
    totalInput,
    totalOutput
  };
}

export const ConsolidationReview = ({
  apiResponse,
  onSign,
  onBack,
  error,
  setError,
  isProcessing = false,
  currentBatch = 0,
  results = []
}: ConsolidationReviewProps) => {
  const [isSigning, setIsSigning] = useState(false);
  const { params, consolidationData, allBatches } = apiResponse;

  if (!consolidationData) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-lg">
        <p className="text-red-600">No consolidation data available</p>
        <Button onClick={onBack} color="gray" className="mt-4">
          Back
        </Button>
      </div>
    );
  }

  // Calculate fees for all batches
  const fees = calculateBatchFees(allBatches, params.feeRateSatPerVByte);
  const totalBtc = consolidationData.summary.total_btc;
  const totalUtxos = consolidationData.summary.total_utxos;
  const numBatches = consolidationData.summary.batches_required;
  const feeConfig = consolidationData.fee_config;

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
      <h2 className="text-lg font-bold">Review Consolidation</h2>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      {/* Progress indicator for multi-batch processing */}
      {isProcessing && currentBatch > 0 && numBatches > 1 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="font-semibold text-blue-900 mb-2">Processing Batches...</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current Batch:</span>
              <span className="font-medium">{currentBatch} of {numBatches}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-[width] duration-300"
                style={{ width: `${(currentBatch / numBatches) * 100}%` }}
              />
            </div>
            {results.length > 0 && (
              <div className="mt-2 text-xs">
                {results.map((result, idx) => (
                  <div key={idx} className={`flex justify-between ${result.status === 'error' ? 'text-red-700' : 'text-green-700'}`}>
                    <span>Batch {result.batchNumber}:</span>
                    <span>{result.status === 'success' ? '✓ Broadcast' : '✗ Failed'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Batch Information */}
        {numBatches > 1 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="font-semibold text-blue-900 mb-2">Batch Consolidation</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div className="flex justify-between">
                <span>Total Batches:</span>
                <span className="font-medium">{numBatches}</span>
              </div>
              <div className="flex justify-between">
                <span>UTXOs per Batch:</span>
                <span className="font-medium">Up to 420</span>
              </div>
              <div className="flex justify-between">
                <span>Total UTXOs:</span>
                <span className="font-medium">{totalUtxos}</span>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2 italic">
              All {numBatches} batches will be signed and broadcast automatically with one click.
            </p>
          </div>
        )}

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

        {/* Consolidation Summary */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Consolidating:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {formatAmount({
              value: totalBtc,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{" "}
            BTC ({totalUtxos} UTXOs)
          </div>
        </div>

        {/* Fee Rate */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">Fee Rate:</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {params.feeRateSatPerVByte} sat/vB
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="space-y-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h4 className="font-semibold text-yellow-900">
            Fee Breakdown {numBatches > 1 ? `(${numBatches} batches total)` : ''}
          </h4>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Network Fee:</span>
            <span className="text-gray-900">
              ~{formatAmount({
                value: fees.totalNetworkFee / 100000000,
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
              })}{" "}
              BTC
            </span>
          </div>
          
          {fees.totalServiceFee > 0 && feeConfig && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">Service Fee ({feeConfig.fee_percent}%):</span>
              <span className="text-gray-900">
                ~{formatAmount({
                  value: fees.totalServiceFee / 100000000,
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
              ~{formatAmount({
                value: (fees.totalNetworkFee + fees.totalServiceFee) / 100000000,
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
              })}{" "}
              BTC
            </span>
          </div>

          {fees.totalServiceFee === 0 && feeConfig && (
            <p className="text-xs text-green-700 italic">
              ✓ Service fee waived (amount below threshold)
            </p>
          )}
        </div>

        {/* Net Total */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">You Will Receive:</span>
          <div className="text-green-700 font-medium bg-green-50 p-2 rounded">
            ~{formatAmount({
              value: fees.totalOutput / 100000000,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{" "}
            BTC
          </div>
        </div>
      </div>

      <div className="flex space-x-4">
        <Button onClick={onBack} color="gray">
          Back
        </Button>
        <Button onClick={handleSignClick} color="blue" fullWidth disabled={isSigning || isProcessing}>
          {isProcessing 
            ? `Processing Batch ${currentBatch} of ${numBatches}...` 
            : isSigning 
              ? "Signing & Broadcasting…" 
              : `Sign & Broadcast ${numBatches > 1 ? `${numBatches} Transactions` : 'Transaction'}`}
        </Button>
      </div>
    </div>
  );
};
