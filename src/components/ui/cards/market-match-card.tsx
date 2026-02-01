import { type ReactElement } from "react";
import { FaCopy, FaCheck } from "@/components/icons";
import { formatAmount, formatTimeAgo } from "@/utils/format";
import { getTradingPair, getMatchPricePerUnit } from "@/utils/trading-pair";
import type { OrderMatch } from "@/utils/blockchain/counterparty/api";

interface MarketMatchCardProps {
  match: OrderMatch;
  /** Base asset for price calculation context (optional - will derive if not provided) */
  baseAsset?: string;
  onCopyTx?: (txHash: string) => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * MarketMatchCard displays a completed order match.
 * Layout mirrors AssetDispenseCard: Left=quantity+total, Right=price+tx+time
 */
export function MarketMatchCard({
  match,
  baseAsset: baseAssetProp,
  onCopyTx,
  isCopied = false,
  className = "",
}: MarketMatchCardProps): ReactElement {
  // Determine canonical trading pair
  const [derivedBase, derivedQuote] = getTradingPair(match.forward_asset, match.backward_asset);
  const baseAsset = baseAssetProp || derivedBase;
  const quoteAsset = baseAssetProp ? (match.forward_asset === baseAsset ? match.backward_asset : match.forward_asset) : derivedQuote;

  // Calculate quantities based on base/quote
  // If forward_asset === baseAsset, someone was selling base (a sell)
  // If backward_asset === baseAsset, someone was buying base (a buy)
  const isForwardBase = match.forward_asset === baseAsset;
  const isBuy = !isForwardBase; // Buy when backward_asset is the base
  const baseQuantity = isForwardBase
    ? Number(match.forward_quantity_normalized)
    : Number(match.backward_quantity_normalized);
  const quoteQuantity = isForwardBase
    ? Number(match.backward_quantity_normalized)
    : Number(match.forward_quantity_normalized);

  // Calculate price per unit
  const pricePerUnit = getMatchPricePerUnit(match, baseAsset);

  // Format quantities
  const baseFormatted = baseQuantity % 1 === 0
    ? formatAmount({ value: baseQuantity, maximumFractionDigits: 0 })
    : formatAmount({ value: baseQuantity, maximumFractionDigits: 8 });

  const quoteFormatted = formatAmount({ value: quoteQuantity, maximumFractionDigits: 8 });

  return (
    <div className={`bg-white rounded-lg shadow-sm p-3 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">
            {baseFormatted} {baseAsset}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {quoteFormatted} {quoteAsset}
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <div className={`text-xs font-medium ${isBuy ? "text-green-600" : "text-red-600"}`}>
            {isBuy ? "Buy" : "Sell"} @ {formatAmount({ value: pricePerUnit, maximumFractionDigits: 8 })} {quoteAsset}
          </div>
          <div className="flex items-center justify-end gap-2 mt-0.5">
            {onCopyTx && (
              <button
                onClick={(e) => { e.stopPropagation(); onCopyTx(match.tx0_hash); }}
                className={`flex items-center gap-1 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                  isCopied
                    ? "text-green-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                aria-label="Copy transaction hash"
              >
                TX
                {isCopied ? (
                  <FaCheck className="size-3" aria-hidden="true" />
                ) : (
                  <FaCopy className="size-3" aria-hidden="true" />
                )}
              </button>
            )}
            {match.block_time && (
              <span className="text-xs text-gray-400">
                {formatTimeAgo(match.block_time, true)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
