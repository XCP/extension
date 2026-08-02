import { type KeyboardEvent, type ReactElement } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount } from "@/utils/format";
import { getCanonicalPoolAssets } from "@/utils/blockchain/counterparty/pool";
import type { Pool, PoolPosition } from "@/utils/blockchain/counterparty/api";

interface PoolCardProps {
  pool: Pool | PoolPosition;
  onClick: () => void;
  className?: string;
}

/**
 * PoolCard displays a liquidity pool or address LP position.
 * Layout mirrors MarketDispenserCard: Icons | Pair + reserves | LP balance
 */
export function PoolCard({
  pool,
  onClick,
  className = "",
}: PoolCardProps): ReactElement {
  // Show icons and reserves in the same canonical order as the pair title
  const [assetA, assetB] = getCanonicalPoolAssets(pool.asset_a, pool.asset_b);
  const swapped = assetA !== pool.asset_a;
  const reserveA = Number(
    swapped
      ? (pool.reserve_b_normalized ?? pool.reserve_b)
      : (pool.reserve_a_normalized ?? pool.reserve_a),
  );
  const reserveB = Number(
    swapped
      ? (pool.reserve_a_normalized ?? pool.reserve_a)
      : (pool.reserve_b_normalized ?? pool.reserve_b),
  );
  const quantity =
    "quantity" in pool ? Number(pool.quantity_normalized ?? pool.quantity) : null;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-3">
        <div className="relative h-8 w-12 flex-shrink-0">
          <div className="absolute left-0 top-0">
            <AssetIcon asset={assetA} size="md" />
          </div>
          <div className="absolute left-4 top-0 rounded-full ring-2 ring-white">
            <AssetIcon asset={assetB} size="md" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-blue-600 text-sm truncate">
            {assetA} / {assetB}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span className="truncate">
              {formatAmount({ value: reserveA, maximumFractionDigits: 2 })} {assetA}
              {" / "}
              {formatAmount({ value: reserveB, maximumFractionDigits: 2 })} {assetB}
            </span>
            {quantity !== null && (
              <span className="flex-shrink-0 ml-2">
                {formatAmount({ value: quantity, maximumFractionDigits: 2 })} LP
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
