import type { ReactElement } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import type { Pool, PoolPosition } from "@/core/counterparty/api";
import { getCanonicalPoolAssets } from "@/core/counterparty/pool";
import { formatAmount } from "@/core/format";

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
    "quantity" in pool ? ((pool.quantity_normalized ?? pool.quantity) as string | number) : null;

  return (
    <button type="button"
      className={`block w-full text-left bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Overlapping pair icons: solid white backing keeps transparent icon art
            from bleeding through, hairline ring keeps each circle crisp, and the
            front icon carries a white halo to separate it from the back one.
            The wrappers need an explicit size-8 and flex: AssetIcon is inline-block, so without
            them the wrapper inherited a line box a few pixels taller than 32px and rounded-full on
            a non-square box drew an oval. */}
        <div className="relative h-8 w-[52px] flex-shrink-0">
          <div className="absolute left-0 top-0 size-8 flex rounded-full bg-white ring-1 ring-gray-200 overflow-hidden">
            <AssetIcon asset={assetA} size="md" />
          </div>
          <div className="absolute left-5 top-0 size-8 flex rounded-full bg-white ring-1 ring-gray-200 overflow-hidden shadow-[0_0_0_2px_white]">
            <AssetIcon asset={assetB} size="md" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-blue-600 text-sm truncate">
            {assetA} / {assetB}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span className="truncate">
              {reserveA > 0 && reserveB > 0 ? (
                <>
                  1 {assetB} ={" "}
                  {formatAmount({
                    value: reserveA / reserveB,
                    maximumFractionDigits: reserveA / reserveB >= 1 ? 2 : 8,
                  })}{" "}
                  {assetA}
                </>
              ) : (
                "No liquidity"
              )}
            </span>
            {quantity !== null && (
              <span className="flex-shrink-0 ml-2">
                {formatAmount({ value: quantity, maximumFractionDigits: 2 })} LP
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
