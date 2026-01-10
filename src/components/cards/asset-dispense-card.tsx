import { type ReactElement } from "react";
import { FaCopy, FaCheck } from "@/components/icons";
import { formatAmount, formatTimeAgo } from "@/utils/format";
import type { Dispense } from "@/utils/blockchain/counterparty/api";

const SATS_PER_BTC = 100_000_000;

interface AssetDispenseCardProps {
  dispense: Dispense;
  asset: string;
  formattedPricePerUnit: string;
  onCopyTx?: (txHash: string) => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * AssetDispenseCard displays a completed dispense transaction.
 * Shows quantity received, total BTC paid, price per unit, and timestamp.
 */
export function AssetDispenseCard({
  dispense,
  asset,
  formattedPricePerUnit,
  onCopyTx,
  isCopied = false,
  className = "",
}: AssetDispenseCardProps): ReactElement {
  const quantity = Number(dispense.dispense_quantity_normalized);
  const btcTotal = dispense.btc_amount / SATS_PER_BTC;

  // Format quantity - use 8 decimals for fractional, 0 for whole numbers
  const quantityFormatted = quantity % 1 === 0
    ? formatAmount({ value: quantity, maximumFractionDigits: 0 })
    : formatAmount({ value: quantity, minimumFractionDigits: 8, maximumFractionDigits: 8 });

  // Format BTC total - always 8 decimals
  const btcFormatted = formatAmount({
    value: btcTotal,
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });

  return (
    <div className={`bg-white rounded-lg shadow-sm p-3 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">
            {quantityFormatted} {asset}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {btcFormatted} BTC
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <div className="text-xs text-green-600 font-medium">
            @ {formattedPricePerUnit}
          </div>
          <div className="flex items-center justify-end gap-2 mt-0.5">
            {onCopyTx && (
              <button
                onClick={() => onCopyTx(dispense.tx_hash)}
                className={`flex items-center gap-1 text-xs cursor-pointer ${
                  isCopied
                    ? "text-green-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Copy transaction hash"
              >
                TX
                {isCopied ? (
                  <FaCheck className="w-3 h-3" />
                ) : (
                  <FaCopy className="w-3 h-3" />
                )}
              </button>
            )}
            <span className="text-xs text-gray-400">
              {formatTimeAgo(dispense.block_time, true)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
