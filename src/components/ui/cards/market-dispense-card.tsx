import { type ReactElement } from "react";
import { FaCopy } from "@/components/icons";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount, formatTxid } from "@/utils/format";
import type { Dispense } from "@/utils/blockchain/counterparty/api";

interface MarketDispenseCardProps {
  dispense: Dispense;
  onCopyTx?: (txHash: string) => void;
  onAssetClick?: () => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * MarketDispenseCard displays a completed dispense transaction.
 * Shows asset, quantity, BTC amount, and copyable tx hash.
 */
export function MarketDispenseCard({
  dispense,
  onCopyTx,
  onAssetClick,
  isCopied = false,
  className = "",
}: MarketDispenseCardProps): ReactElement {
  return (
    <div className={`bg-white rounded-lg shadow-sm p-3 ${className}`}>
      <div className="flex items-center gap-3">
        <AssetIcon asset={dispense.asset} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {formatAmount({ value: Number(dispense.dispense_quantity_normalized), maximumFractionDigits: 4 })}{" "}
            {onAssetClick ? (
              <button
                onClick={onAssetClick}
                className="text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                {dispense.asset}
              </button>
            ) : (
              <span className="text-gray-900">{dispense.asset}</span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            for {formatAmount({ value: dispense.btc_amount, maximumFractionDigits: 0 })} sats
          </div>
        </div>
        {onCopyTx && (
          <button
            onClick={() => onCopyTx(dispense.tx_hash)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label="Copy transaction hash"
          >
            {formatTxid(dispense.tx_hash)}
            <FaCopy className={`size-3 ${isCopied ? "text-green-500" : ""}`} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
