import React, { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

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
  
  // Generate the asset icon URL from xcp.io
  const imageUrl = `https://app.xcp.io/img/icon/${symbol}`;
  
  // Handle card click - use custom handler or default navigation
  const handleClick = () => {
    if (onClick) {
      onClick(symbol);
    } else {
      // Navigate based on the navigation type
      const path = navigationType === "balance" 
        ? `/balance/${symbol}` 
        : `/asset/${symbol}`;
      navigate(path);
    }
  };
  
  return (
    <div
      className={`relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 ${className}`}
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
      <div className="w-12 h-12 flex-shrink-0">
        <img 
          src={imageUrl} 
          alt={symbol}
          className="w-full h-full object-cover rounded-full"
          onError={(e) => {
            // Fallback for missing icons
            const target = e.target as HTMLImageElement;
            target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='14'%3E%3F%3C/text%3E%3C/svg%3E";
          }}
        />
      </div>
      
      {/* Asset Symbol */}
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm text-gray-900">{symbol}</div>
      </div>
    </div>
  );
}

export default SearchResultCard;