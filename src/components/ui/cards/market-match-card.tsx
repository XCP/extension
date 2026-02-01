import { type ReactElement } from "react";
import { FaCopy, FaExchangeAlt } from "@/components/icons";
import { formatAmount, formatTxid } from "@/utils/format";
import type { OrderMatch } from "@/utils/blockchain/counterparty/api";

interface MarketMatchCardProps {
  match: OrderMatch;
  onCopyTx?: (txHash: string) => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * MarketMatchCard displays a completed order match.
 * Shows assets exchanged, quantities, status, and copyable tx hash.
 */
export function MarketMatchCard({
  match,
  onCopyTx,
  isCopied = false,
  className = "",
}: MarketMatchCardProps): ReactElement {
  return (
    <div className={`bg-white rounded-lg shadow-sm p-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <FaExchangeAlt className="text-green-600 size-3" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium text-gray-900">
              {formatAmount({ value: Number(match.forward_quantity_normalized), maximumFractionDigits: 4 })} {match.forward_asset}
            </span>
            <span className="text-gray-400">↔</span>
            <span className="text-gray-600">
              {formatAmount({ value: Number(match.backward_quantity_normalized), maximumFractionDigits: 4 })} {match.backward_asset}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-1">{match.status}</div>
        </div>
        {onCopyTx && (
          <button
            onClick={(e) => { e.stopPropagation(); onCopyTx(match.tx0_hash); }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-mono flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label="Copy transaction hash"
          >
            {formatTxid(match.tx0_hash)}
            <FaCopy className={`size-3 ${isCopied ? "text-green-500" : ""}`} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
