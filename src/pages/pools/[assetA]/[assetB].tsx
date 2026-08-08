import type { ReactElement } from "react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { getPoolDisplayPair } from "@/core/counterparty/pool";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";
import { usePool } from "@/hooks/usePool";
import { PoolOverview } from "@/pages/pools/pool-overview";

export default function PoolPage(): ReactElement {
  const { assetA, assetB } = useParams<{ assetA: string; assetB: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const decodedAssetA = assetA ? decodeURIComponent(assetA) : undefined;
  const decodedAssetB = assetB ? decodeURIComponent(assetB) : undefined;
  const { data: pool, isLoading, error } = usePool(decodedAssetA, decodedAssetB);
  // The viewer's LP position, if they hold this pool's LP asset — shows
  // pool share, underlying, and Withdraw on the shared overview.
  const { data: position } = useLpAssetPool(pool?.lp_asset);
  const pair = decodedAssetA && decodedAssetB
    ? getPoolDisplayPair(decodedAssetA, decodedAssetB)
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
      <section className="p-4 space-y-4" aria-label={pair}>
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
      </section>
    );
  }

  return <PoolOverview pool={pool} position={position} />;
}
