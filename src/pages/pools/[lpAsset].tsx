import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";
import { formatDecimal, toBigNumber } from "@/utils/numeric";

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

  const pair = `${pool.asset_a} / ${pool.asset_b}`;
  const lpBalance = toBigNumber(pool.quantity_normalized ?? pool.quantity);
  const lpSupply = toBigNumber(lpAssetInfo?.supply_normalized);
  const poolShare = lpSupply.isGreaterThan(0) ? lpBalance.div(lpSupply) : null;
  const poolSharePercent = poolShare ? formatDecimal(poolShare.times(100), 4) : null;
  const underlyingA = poolShare
    ? formatDecimal(poolShare.times(toBigNumber(pool.reserve_a_normalized ?? pool.reserve_a)))
    : null;
  const underlyingB = poolShare
    ? formatDecimal(poolShare.times(toBigNumber(pool.reserve_b_normalized ?? pool.reserve_b)))
    : null;

  return (
    <div className="p-4 space-y-6" role="main" aria-labelledby="pool-title">
      <section className="space-y-4">
        <div>
          <h1 id="pool-title" className="text-xl font-semibold text-gray-900">{pair}</h1>
          <p className="mt-1 text-sm text-gray-500">{pool.lp_asset}</p>
        </div>

        <div className="rounded border border-gray-200 bg-white">
          <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
            <div className="p-4">
              <div className="text-xs font-medium uppercase text-gray-500">Reserve {pool.asset_a}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {pool.reserve_a_normalized ?? pool.reserve_a}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-medium uppercase text-gray-500">Reserve {pool.asset_b}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {pool.reserve_b_normalized ?? pool.reserve_b}
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-medium uppercase text-gray-500">Your LP balance</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {pool.quantity_normalized ?? pool.quantity}
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
