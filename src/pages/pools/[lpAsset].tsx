import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PoolHeader } from "@/components/ui/headers/pool-header";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";
import { getCanonicalPoolAssets, getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import { divide, formatDecimal, isGreaterThan, multiply, toBigNumber } from "@/utils/numeric";

import type { ReactElement } from "react";

export default function PoolPositionPage(): ReactElement {
  const { lpAsset } = useParams<{ lpAsset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const asset = lpAsset ? decodeURIComponent(lpAsset) : undefined;
  const { data: pool, isLoading, error } = useLpAssetPool(asset);
  const { data: lpAssetInfo } = useAssetInfo(pool?.lp_asset || "");

  useEffect(() => {
    setHeaderProps({
      title: "Pool",
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (isLoading) {
    return <Spinner message="Loading pool position..." />;
  }

  if (!pool) {
    if (error) {
      return (
        <div className="p-4">
          <ErrorAlert message={error.message} />
        </div>
      );
    }
    return <div className="p-4 text-center text-gray-600">Pool position not found</div>;
  }

  const pair = getCanonicalPoolPair(pool.asset_a, pool.asset_b);
  const [firstReserveAsset, secondReserveAsset] = getCanonicalPoolAssets(pool.asset_a, pool.asset_b);
  const reserveByAsset = {
    [pool.asset_a]: pool.reserve_a_normalized ?? pool.reserve_a,
    [pool.asset_b]: pool.reserve_b_normalized ?? pool.reserve_b,
  };
  const lpBalanceValue = toBigNumber(pool.quantity_normalized ?? pool.quantity);
  const lpSupply = toBigNumber(lpAssetInfo?.supply_normalized);
  const poolShare = isGreaterThan(lpSupply, 0) ? divide(lpBalanceValue, lpSupply) : null;
  const poolSharePercent = poolShare ? formatDecimal(multiply(poolShare, 100), 4) : null;
  const underlyingA = poolShare
    ? formatDecimal(multiply(poolShare, pool.reserve_a_normalized ?? pool.reserve_a))
    : null;
  const underlyingB = poolShare
    ? formatDecimal(multiply(poolShare, pool.reserve_b_normalized ?? pool.reserve_b))
    : null;

  return (
    <div className="p-4 space-y-6" role="main" aria-label={pair}>
      <section className="space-y-5">
        <div>
          <PoolHeader pool={pool} className="mt-1 mb-5" />
        </div>

        <div className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <div className="text-xs font-medium uppercase text-gray-500">LP Asset</div>
            <div className="mt-1 break-all text-sm font-semibold text-gray-900">{pool.lp_asset}</div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
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
      </section>

      <ActionList
        sections={[
          {
            items: [
              {
                id: "trade-a",
                title: `Trade ${pool.asset_a}`,
                description: `Open DEX order flow for ${pool.asset_a}`,
                onClick: () => navigate(`/compose/order/${encodeURIComponent(pool.asset_a)}`),
              },
              {
                id: "trade-b",
                title: `Trade ${pool.asset_b}`,
                description: `Open DEX order flow for ${pool.asset_b}`,
                onClick: () => navigate(`/compose/order/${encodeURIComponent(pool.asset_b)}`),
              },
            ],
          },
        ]}
      />
    </div>
  );
}
