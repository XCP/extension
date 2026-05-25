import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PoolHeader } from "@/components/ui/headers/pool-header";
import { ActionList } from "@/components/ui/lists/action-list";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { usePool } from "@/hooks/usePool";
import { getCanonicalPoolAssets, getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import type { ReactElement } from "react";

export default function PoolPage(): ReactElement {
  const { assetA, assetB } = useParams<{ assetA: string; assetB: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const decodedAssetA = assetA ? decodeURIComponent(assetA) : undefined;
  const decodedAssetB = assetB ? decodeURIComponent(assetB) : undefined;
  const { data: pool, isLoading, error } = usePool(decodedAssetA, decodedAssetB);
  const pair = decodedAssetA && decodedAssetB
    ? getCanonicalPoolPair(decodedAssetA, decodedAssetB)
    : "Pool";

  useEffect(() => {
    setHeaderProps({
      title: "Pool",
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (!decodedAssetA || !decodedAssetB) {
    return <div className="p-4 text-center text-gray-600">Pool pair not found</div>;
  }

  if (isLoading) {
    return <Spinner message="Loading pool..." className="min-h-[240px]" />;
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorAlert message={error.message} />
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="p-4 space-y-4" role="main" aria-label={pair}>
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase text-gray-500">Pool</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{pair}</div>
          <p className="mt-2 text-sm text-gray-600">
            This pool has not been created yet.
          </p>
          <Button
            type="button"
            fullWidth
            className="mt-4"
            onClick={() => navigate(`/compose/pool/deposit/${encodeURIComponent(decodedAssetA)}/${encodeURIComponent(decodedAssetB)}`)}
          >
            Enter Pool
          </Button>
        </div>
      </div>
    );
  }

  const [firstReserveAsset, secondReserveAsset] = getCanonicalPoolAssets(pool.asset_a, pool.asset_b);
  const reserveByAsset = {
    [pool.asset_a]: pool.reserve_a_normalized ?? pool.reserve_a,
    [pool.asset_b]: pool.reserve_b_normalized ?? pool.reserve_b,
  };

  return (
    <div className="p-4 space-y-6" role="main" aria-label={pair}>
      <section className="space-y-5">
        <PoolHeader pool={pool} className="mt-1 mb-5" />

        <div className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <div className="text-xs font-medium uppercase text-gray-500">LP Asset</div>
            <div className="mt-1 break-all text-sm font-semibold text-gray-900">{pool.lp_asset}</div>
          </div>
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
        </div>

        <Button
          fullWidth
          onClick={() => navigate(`/compose/pool/deposit/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`)}
        >
          Deposit
        </Button>
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
