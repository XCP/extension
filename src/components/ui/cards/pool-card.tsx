import { type KeyboardEvent, type ReactElement } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import type { Pool, PoolPosition } from "@/utils/blockchain/counterparty/api";

interface PoolCardProps {
  pool: Pool | PoolPosition;
  onClick: () => void;
  className?: string;
}

/**
 * PoolCard displays a liquidity pool or address LP position.
 */
export function PoolCard({
  pool,
  onClick,
  className = "",
}: PoolCardProps): ReactElement {
  const pair = getCanonicalPoolPair(pool.asset_a, pool.asset_b);
  const reserveA = pool.reserve_a_normalized ?? pool.reserve_a;
  const reserveB = pool.reserve_b_normalized ?? pool.reserve_b;
  const quantity = "quantity_normalized" in pool ? (pool.quantity_normalized ?? pool.quantity) : null;

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
        <div className="relative flex h-9 w-12 flex-shrink-0 items-center">
          <AssetIcon asset={pool.asset_a} size="sm" className="absolute left-0" />
          <AssetIcon asset={pool.asset_b} size="sm" className="absolute left-5 ring-2 ring-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-blue-600 text-sm truncate">{pair}</div>
          <div className="text-xs text-gray-500 truncate">
            {quantity ? `${quantity} ${pool.lp_asset}` : pool.lp_asset}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {reserveA} {pool.asset_a} / {reserveB} {pool.asset_b}
          </div>
        </div>
      </div>
    </div>
  );
}
