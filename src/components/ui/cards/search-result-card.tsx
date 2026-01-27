import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "@/components/domain/asset/asset-icon";

/**
 * Props interface for the SearchResultCard component
 */
interface SearchResultCardProps {
  /** The asset symbol to display */
  symbol: string;
  /** Optional custom click handler - if not provided, defaults to navigation */
  onClick?: (symbol: string) => void;
  /** Navigation path type - determines default navigation behavior */
  navigationType?: "balance" | "asset";
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * SearchResultCard Component
 * 
 * A simplified card component for displaying search results in asset and balance lists.
 * Shows only the asset icon and symbol for quick scanning of search results.
 * 
 * @param props - The component props
 * @returns A ReactElement representing the search result card
 * 
 * @example
 * ```tsx
 * // For balance search results
 * <SearchResultCard 
 *   symbol="XCP"
 *   navigationType="balance"
 * />
 * 
 * // For asset search results
 * <SearchResultCard 
 *   symbol="PEPECASH"
 *   navigationType="asset"
 * />
 * 
 * // With custom click handler
 * <SearchResultCard 
 *   symbol="RARE"
 *   onClick={(symbol) => console.log(symbol)}
 * />
 * ```
 */
export function SearchResultCard({
  symbol,
  onClick,
  navigationType = "asset",
  className = ""
}: SearchResultCardProps): ReactElement {
  const navigate = useNavigate();
  
  // Handle card click - use custom handler or default navigation
  const handleClick = () => {
    if (onClick) {
      onClick(symbol);
    } else {
      // Navigate based on the navigation type
      const path = navigationType === "balance"
        ? `/assets/${symbol}/balance`
        : `/assets/${symbol}`;
      navigate(path);
    }
  };
  
  return (
    <div
      className={`relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`View ${symbol}`}
    >
      {/* Asset Icon */}
      <AssetIcon asset={symbol} size="lg" className="flex-shrink-0" />
      
      {/* Asset Symbol */}
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm text-gray-900">{symbol}</div>
      </div>
    </div>
  );
}

