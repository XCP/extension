import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import zeldIcon from '@/assets/zeld.svg';
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { ZELD_DISPLAY_NAME, ZELD_WALLET_ASSET } from '@/core/zeld/api';

import { t } from '@/i18n';

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
  /** Loading or unavailable balance text; never substitutes a zero for an unknown amount. */
  status?: string;
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
  className = "",
  status,
}: SearchResultCardProps): ReactElement {
  const navigate = useNavigate();
  const isZeld = symbol === ZELD_WALLET_ASSET;
  const displayName = isZeld ? ZELD_DISPLAY_NAME : symbol;
  const protocol = isZeld ? 'ZeldHash' : symbol === 'ZELD' ? 'Counterparty' : null;
  
  // Handle card click - use custom handler or default navigation
  const handleClick = () => {
    if (onClick) {
      onClick(symbol);
    } else if (isZeld) {
      void navigate('/zeld');
    } else {
      // Navigate based on the navigation type
      const path = navigationType === "balance"
        ? `/assets/${symbol}/balance`
        : `/assets/${symbol}`;
      void navigate(path);
    }
  };
  
  return (
    <button type="button"
      className={`w-full text-left relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={handleClick}
      aria-label={t('asset_search_result_card_view', [protocol ? `${displayName} (${protocol})` : displayName])}
    >
      {/* Asset Icon */}
      <AssetIcon asset={displayName} imageSrc={isZeld ? zeldIcon : undefined} size="lg" className="flex-shrink-0" />
      
      {/* Asset Symbol */}
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm text-gray-900">{displayName}</div>
        {protocol && <div className="text-xs text-gray-500">{protocol}</div>}
        {status && <div role="status" className="text-xs text-gray-500">{status}</div>}
      </div>
    </button>
  );
}

