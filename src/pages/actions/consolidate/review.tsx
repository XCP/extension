import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { ConsolidationData } from "@/core/bitcoin/consolidationApi";
import { formatAddress, formatAmount } from "@/core/format";
import { add, divide, fromSatoshis, multiply, roundDown, roundUp, toNumber, toSatoshis } from '@/core/numeric';
import type { ConsolidationResult } from "@/hooks/useMultiBatchConsolidation";

import { t } from '@/i18n';

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
    // total_btc is a decimal BTC figure; multiplying it by 1e8 as a double is the classic way to
    // land a satoshi off. toSatoshis does the scaling exactly.
    const inputSats = toNumber(roundDown(
      divide(toSatoshis(batch.summary.total_btc), batch.summary.batches_required)
    ));
    totalInput += inputSats;
    
    // Measured against confirmed recoveries: a 420-input spend lands at ~48,200 bytes, so a 1-of-3
    // bare-multisig input costs ~114 bytes rather than the 147 this once assumed.
    const bytesPerInput = 114;
    const baseOverhead = 10;
    const bytesPerOutput = 34;
    const numOutputs = batch.fee_config?.fee_percent > 0 ? 2 : 1;
    
    const estimatedSize = (batch.summary.batch_utxos * bytesPerInput) + baseOverhead + (numOutputs * bytesPerOutput);
    const networkFee = toNumber(roundUp(multiply(estimatedSize, feeRate)));
    totalNetworkFee += networkFee;
    
    // Calculate service fee
    if (batch.fee_config && batch.fee_config.fee_percent > 0) {
      const afterNetworkFee = inputSats - networkFee;
      if (afterNetworkFee > batch.fee_config.exemption_threshold) {
        totalServiceFee += toNumber(roundDown(
          divide(multiply(afterNetworkFee, batch.fee_config.fee_percent), 100)
        ));
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
        <p className="text-red-600">{t('common_no_consolidation_data_available')}</p>
        <Button onClick={onBack} color="gray" className="mt-4">
          {t('common_back')}
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
      <h2 className="text-lg font-bold">{t('consolidate_review_review_consolidation')}</h2>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      {/* Progress indicator for multi-batch processing */}
      {isProcessing && currentBatch > 0 && numBatches > 1 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="font-semibold text-blue-900 mb-2">{t('consolidate_review_processing_batches')}</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('consolidate_review_current_batch')}</span>
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
                    <span>{t('consolidate_review_batch', [String(result.batchNumber)])}</span>
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
            <h4 className="font-semibold text-blue-900 mb-2">{t('consolidate_review_batch_consolidation')}</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div className="flex justify-between">
                <span>{t('common_total_batches')}</span>
                <span className="font-medium">{numBatches}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('consolidate_review_utxos_per_batch')}</span>
                <span className="font-medium">{t('consolidate_review_up_to', [String(consolidationData.summary.max_batch_utxos)])}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('consolidate_review_total_utxos')}</span>
                <span className="font-medium">{totalUtxos}</span>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2 italic">
              {t('consolidate_review_all_batches_will_be_signed', [String(numBatches)])}
            </p>
          </div>
        )}

        {/* From Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">{t('common_from')}</span>
          <div className="text-gray-900 break-all bg-gray-50 p-2 rounded">
            {formatAddress(params.source, true)}
          </div>
        </div>

        {/* Destination Address */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">{t('common_to')}</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {formatAddress(params.destination, true)}
          </div>
        </div>

        {/* Consolidation Summary */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">{t('consolidate_review_consolidating')}</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {t('consolidate_review_btc_utxos', [String(formatAmount({
              value: totalBtc,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })), String(" "), String(totalUtxos)])}
          </div>
        </div>

        {/* Fee Rate */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">{t('consolidate_review_fee_rate')}</span>
          <div className="text-gray-900 bg-gray-50 p-2 rounded">
            {t('common_sat_vb', [String(params.feeRateSatPerVByte)])}
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="space-y-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h4 className="font-semibold text-yellow-900">
            {numBatches > 1 ? t('consolidate_review_fee_breakdown_batches_total', [String(numBatches)]) : t('consolidate_review_fee_breakdown')}
          </h4>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">{t('consolidate_review_network_fee')}</span>
            <span className="text-gray-900">
              ~{formatAmount({
                value: fromSatoshis(fees.totalNetworkFee),
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
              })}{" "}
              BTC
            </span>
          </div>
          
          {fees.totalServiceFee > 0 && feeConfig && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">{t('consolidate_review_service_fee', [String(feeConfig.fee_percent)])}</span>
              <span className="text-gray-900">
                ~{formatAmount({
                  value: fromSatoshis(fees.totalServiceFee),
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })}{" "}
                BTC
              </span>
            </div>
          )}
          
          <div className="flex justify-between text-sm font-semibold border-t pt-2">
            <span className="text-gray-700">{t('consolidate_review_total_fees')}</span>
            <span className="text-yellow-900">
              ~{formatAmount({
                value: fromSatoshis(add(fees.totalNetworkFee, fees.totalServiceFee)),
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
              })}{" "}
              BTC
            </span>
          </div>

          {fees.totalServiceFee === 0 && feeConfig && (
            <p className="text-xs text-green-700 italic">
              {t('consolidate_review_service_fee_waived_amount_below')}
            </p>
          )}
        </div>

        {/* Net Total */}
        <div className="space-y-1">
          <span className="font-semibold text-gray-700">{t('consolidate_review_you_will_receive')}</span>
          <div className="text-green-700 font-medium bg-green-50 p-2 rounded">
            ~{formatAmount({
              value: fromSatoshis(fees.totalOutput),
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })}{" "}
            BTC
          </div>
        </div>
      </div>

      <div className="flex space-x-4">
        <Button onClick={onBack} color="gray">
          {t('common_back')}
        </Button>
        <Button onClick={handleSignClick} color="blue" fullWidth disabled={isSigning || isProcessing}>
          {isProcessing
            ? t('consolidate_review_processing_batch_of', [String(currentBatch), String(numBatches)])
            : isSigning
              ? t('consolidate_review_signing_broadcasting')
              : numBatches > 1 ? t('consolidate_review_sign_broadcast_transactions', [String(numBatches)]) : t('consolidate_review_sign_broadcast_transaction')}
        </Button>
      </div>
    </div>
  );
};
