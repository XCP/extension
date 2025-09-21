import { type ReactElement } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty/api";
import { formatTimeAgo, formatDate } from "@/utils/format";

/**
 * Props interface for the TransactionCard component
 */
interface TransactionCardProps {
  /** The transaction data to display */
  transaction: Transaction;
  /** Click handler for the card */
  onClick?: () => void;
  /** Whether to show full transaction hash or truncated version */
  showFullHash?: boolean;
  /** Optional custom CSS classes */
  className?: string;
  /** Optional aria-label for accessibility */
  ariaLabel?: string;
}

/**
 * TransactionCard Component
 * 
 * A reusable card component for displaying blockchain transaction information.
 * Shows transaction type, status, confirmation state, and timestamp.
 * 
 * Features:
 * - Visual distinction for pending/unconfirmed transactions
 * - Formatted transaction type display
 * - Time ago display with full date on hover
 * - Transaction hash with optional truncation
 * - Accessible keyboard navigation
 * 
 * @param props - The component props
 * @returns A ReactElement representing the transaction card
 * 
 * @example
 * ```tsx
 * <TransactionCard 
 *   transaction={tx}
 *   onClick={() => navigate(`/transaction/${tx.tx_hash}`)}
 *   showFullHash={false}
 * />
 * ```
 */
export function TransactionCard({
  transaction,
  onClick,
  showFullHash = false,
  className = "",
  ariaLabel
}: TransactionCardProps): ReactElement {
  const isPending = transaction.confirmed === false;
  
  // Format the message type for display
  const formatMessageType = (type: string): string => {
    return type.toUpperCase().replace(/_/g, " ");
  };

  // Truncate transaction hash if needed
  const formatTxHash = (hash: string): string => {
    if (showFullHash) return hash;
    if (hash.length <= 20) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`block transition-shadow ${
        onClick ? "hover:shadow-lg cursor-pointer" : ""
      } ${isPending ? "opacity-75" : ""} ${className}`}
      role={onClick ? "button" : "article"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel || `Transaction ${transaction.tx_hash}`}
    >
      <div className={`rounded-lg shadow p-4 space-y-2 ${
        isPending 
          ? "bg-yellow-50 border-2 border-yellow-200" 
          : "bg-white"
      }`}>
        {/* Header Row */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Transaction Type */}
            <div className="text-sm font-medium text-gray-900">
              {formatMessageType(transaction.unpacked_data.message_type)}
            </div>
            
            {/* Pending Badge */}
            {isPending && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                Pending
              </span>
            )}
          </div>
          
          {/* Timestamp */}
          <div 
            className="text-xs text-gray-500" 
            title={isPending ? "Unconfirmed" : formatDate(transaction.block_time)}
          >
            {isPending ? "Mempool" : formatTimeAgo(transaction.block_time)}
          </div>
        </div>
        
        {/* Transaction Hash Row */}
        <div className="text-xs text-gray-400 break-all flex items-center gap-1">
          <span>TX: {formatTxHash(transaction.tx_hash)}</span>
          {isPending && (
            <span className="text-yellow-600 ml-2">(0 confirmations)</span>
          )}
        </div>
        
        {/* Additional Details (if needed in future) */}
        {transaction.source && transaction.destination && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <span className="text-gray-400">From:</span>
              <span className="font-mono">{transaction.source.slice(0, 8)}...</span>
            </div>
            {transaction.destination !== transaction.source && (
              <div className="flex items-center gap-1">
                <span className="text-gray-400">To:</span>
                <span className="font-mono">{transaction.destination.slice(0, 8)}...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

