import { type ReactElement, type KeyboardEvent } from "react";

interface OrderBookLevelCardProps {
  /** Formatted price string (e.g., "0.00300000" or "$1.50") */
  formattedPrice: string;
  /** Formatted amount string */
  formattedAmount: string;
  /** Formatted total string (price × amount) */
  formattedTotal: string;
  /** Hover tooltip text */
  hoverTitle: string;
  /** Whether this is a buy level (true) or sell level (false) - affects colors */
  isBuy: boolean;
  /** Cumulative order book depth percentage (0-100) for visualization */
  depthPercent: number;
  onClick?: () => void;
  className?: string;
}

/**
 * OrderBookLevelCard displays an aggregated price level in the order book.
 * Multiple orders at the same price are combined into one row.
 */
export function OrderBookLevelCard({
  formattedPrice,
  formattedAmount,
  formattedTotal,
  hoverTitle,
  isBuy,
  depthPercent,
  onClick,
  className = "",
}: OrderBookLevelCardProps): ReactElement {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`relative bg-white rounded-lg shadow-sm p-2 overflow-hidden ${onClick ? "hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={hoverTitle}
    >
      {/* Order book depth visualization bar - buys from right, sells from left */}
      {depthPercent > 0 && (
        <div
          className={`absolute inset-y-0 ${isBuy ? "right-0 bg-green-500" : "left-0 bg-red-500"} opacity-10`}
          style={{ width: `${Math.min(depthPercent, 100)}%` }}
          aria-hidden="true"
        />
      )}
      {/* Three-column layout: Price | Amount | Total */}
      <div className="relative flex items-center text-xs">
        <div className={`flex-1 font-medium ${isBuy ? "text-green-600" : "text-red-600"}`}>
          {formattedPrice}
        </div>
        <div className="flex-1 text-gray-700">
          {formattedAmount}
        </div>
        <div className="flex-1 text-right text-gray-500">
          {formattedTotal}
        </div>
      </div>
    </div>
  );
}
