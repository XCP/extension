import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { PoolHeader } from "@/components/ui/headers/pool-header";
import { ActionList } from "@/components/ui/lists/action-list";
import type { Pool, PoolPosition } from "@/core/counterparty/api";
import { getCanonicalPoolAssets, getCanonicalPoolPair } from "@/core/counterparty/pool";
import { divide, formatDecimal, isGreaterThan, multiply, toBigNumber } from "@/core/numeric";
import { useAssetInfo } from "@/hooks/useAssetInfo";

interface PoolOverviewProps {
  pool: Pool;
  /** The viewer's LP position in this pool, when they hold the LP asset */
  position?: PoolPosition | null;
}

/**
 * Shared pool page body: pair header, reserves, implied price, and — when the
 * viewer holds the LP asset — their pool share, underlying value, and Withdraw.
 * Rendered by both the LP-asset route (from a balance) and the pair route
 * (from the market), so the two entry points show one consistent page.
 */
export function PoolOverview({ pool, position }: PoolOverviewProps): ReactElement {
  const navigate = useNavigate();
  const pair = getCanonicalPoolPair(pool.asset_a, pool.asset_b);
  const [firstReserveAsset, secondReserveAsset] = getCanonicalPoolAssets(pool.asset_a, pool.asset_b);
  const { data: lpAssetInfo } = useAssetInfo(position ? pool.lp_asset : "");

  const reserveByAsset = {
    [pool.asset_a]: pool.reserve_a_normalized ?? pool.reserve_a,
    [pool.asset_b]: pool.reserve_b_normalized ?? pool.reserve_b,
  };
  const firstReserve = toBigNumber(reserveByAsset[firstReserveAsset]);
  const secondReserve = toBigNumber(reserveByAsset[secondReserveAsset]);
  const hasLiquidity = isGreaterThan(firstReserve, 0) && isGreaterThan(secondReserve, 0);
  const priceOfFirst = hasLiquidity ? formatDecimal(divide(secondReserve, firstReserve)) : null;
  const priceOfSecond = hasLiquidity ? formatDecimal(divide(firstReserve, secondReserve)) : null;

  const lpBalanceValue = position ? toBigNumber(position.quantity_normalized ?? position.quantity) : null;
  const lpSupply = toBigNumber(lpAssetInfo?.supply_normalized);
  const poolShare = lpBalanceValue && isGreaterThan(lpSupply, 0) ? divide(lpBalanceValue, lpSupply) : null;
  const poolSharePercent = poolShare ? formatDecimal(multiply(poolShare, 100), 4) : null;
  const underlyingA = poolShare
    ? formatDecimal(multiply(poolShare, toBigNumber(reserveByAsset[pool.asset_a])))
    : null;
  const underlyingB = poolShare
    ? formatDecimal(multiply(poolShare, toBigNumber(reserveByAsset[pool.asset_b])))
    : null;

  return (
    <section className="p-4 space-y-6" aria-label={pair}>
      <section className="space-y-5">
        <PoolHeader pool={pool} className="mt-1 mb-5" />

        <div className="rounded border border-gray-200 bg-white">
          {priceOfFirst && priceOfSecond && (
            <div className="border-b border-gray-200 p-4">
              <div className="text-xs font-medium uppercase text-gray-500">Price</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                1 {firstReserveAsset} = {priceOfFirst} {secondReserveAsset}
              </div>
              <div className="text-sm font-semibold text-gray-900">
                1 {secondReserveAsset} = {priceOfSecond} {firstReserveAsset}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            <div className="p-4">
              <div className="text-xs font-medium uppercase text-gray-500">Reserve {firstReserveAsset}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {reserveByAsset[firstReserveAsset]}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-medium uppercase text-gray-500">Reserve {secondReserveAsset}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {reserveByAsset[secondReserveAsset]}
              </div>
            </div>
          </div>
          {poolSharePercent && underlyingA && underlyingB && (
            <div className="grid grid-cols-2 divide-x divide-gray-200 border-t border-gray-200">
              <div className="p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Pool share</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{poolSharePercent}%</div>
              </div>
              <div className="p-4">
                <div className="text-xs font-medium uppercase text-gray-500">Underlying</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {underlyingA} {pool.asset_a}
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {underlyingB} {pool.asset_b}
                </div>
              </div>
            </div>
          )}
        </div>

        {position ? (
          <div className="grid grid-cols-2 gap-3">
            <Button
              fullWidth
              onClick={() => navigate(`/compose/pool/deposit/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`)}
            >
              Deposit
            </Button>
            <Button
              fullWidth
              onClick={() => navigate(`/compose/pool/withdraw/${encodeURIComponent(pool.lp_asset)}`)}
            >
              Withdraw
            </Button>
          </div>
        ) : (
          <Button
            fullWidth
            onClick={() => navigate(`/compose/pool/deposit/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`)}
          >
            Deposit
          </Button>
        )}
      </section>

      <ActionList
        sections={[
          {
            items: [
              {
                id: "pool-swap",
                title: "Pool Swap",
                description: "Swap instantly at the quoted price",
                onClick: () => navigate(`/compose/swap/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`),
              },
              {
                id: "dex-order",
                title: "DEX Order",
                description: "Set your own price on the order book",
                onClick: () => navigate(`/compose/order/${encodeURIComponent(pool.asset_a)}`),
              },
            ],
          },
        ]}
      />
    </section>
  );
}
