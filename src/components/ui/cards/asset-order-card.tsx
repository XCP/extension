import { type ReactElement, type KeyboardEvent, type MouseEvent } from "react";
import { FaCopy, FaCheck } from "@/components/icons";
import { formatAmount, formatAddress } from "@/utils/format";
import type { Order, OrderDetails } from "@/utils/blockchain/counterparty/api";

interface AssetOrderCardProps {
  order: Order | OrderDetails;
  /** Price per unit in quote asset (pre-calculated by parent) */
  formattedPrice: string;
  /** Base asset quantity remaining */
  remainingAmount: number;
  /** Whether this is a buy order (true) or sell order (false) - affects price color */
  isBuy: boolean;
  /** Number of blocks until order expires (optional) */
  expiresInBlocks?: number;
  /** Cumulative order book depth percentage (0-100) for visualization */
  depthPercent?: number;
  onClick?: () => void;
  onCopyAddress?: (address: string) => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * AssetOrderCard displays an order on an asset-specific trading pair page.
 * No icon/name since context is known. Shows price, remaining amount, and address.
 * Mirrors AssetDispenserCard layout.
 */
export function AssetOrderCard({
  order,
  formattedPrice,
  remainingAmount,
  isBuy,
  expiresInBlocks,
  depthPercent,
  onClick,
  onCopyAddress,
  isCopied = false,
  className = "",
}: AssetOrderCardProps): ReactElement {
  // Format remaining amount - use 8 decimals for fractional, 0 for whole
  const safeRemaining = remainingAmount || 0;
  const remainingFormatted = safeRemaining % 1 === 0
    ? formatAmount({ value: safeRemaining, maximumFractionDigits: 0 })
    : formatAmount({ value: safeRemaining, minimumFractionDigits: 8, maximumFractionDigits: 8 });

  // Source is only available on OrderDetails
  const source = (order as OrderDetails).source;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  const handleCopyClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (source) {
      onCopyAddress?.(source);
    }
  };

  return (
    <div
      className={`relative bg-white rounded-lg shadow-sm p-3 overflow-hidden ${onClick ? "hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Order book depth visualization bar - buys from right, sells from left */}
      {depthPercent !== undefined && depthPercent > 0 && (
        <div
          className={`absolute inset-y-0 ${isBuy ? "right-0 bg-green-500" : "left-0 bg-red-500"} opacity-10`}
          style={{ width: `${Math.min(depthPercent, 100)}%` }}
          aria-hidden="true"
        />
      )}
      <div className="relative flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${isBuy ? "text-green-600" : "text-red-600"}`}>
            {formattedPrice}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {remainingFormatted} remaining
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          {expiresInBlocks !== undefined && (
            <div className={`text-xs ${expiresInBlocks <= 10 ? "text-orange-500" : "text-gray-400"}`}>
              Expires in {expiresInBlocks} block{expiresInBlocks !== 1 ? "s" : ""}
            </div>
          )}
          {source && (
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <span className="text-xs text-gray-400 truncate">
                {formatAddress(source, true)}
              </span>
              {onCopyAddress && (
                <button
                  onClick={handleCopyClick}
                  className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isCopied
                      ? "text-green-600"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                  aria-label="Copy address"
                >
                  {isCopied ? (
                    <FaCheck className="size-3" aria-hidden="true" />
                  ) : (
                    <FaCopy className="size-3" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
