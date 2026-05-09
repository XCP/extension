import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useLpAssetPool } from "@/hooks/useLpAssetPool";

import type { ReactElement } from "react";

export default function PoolPositionPage(): ReactElement {
  const { lpAsset } = useParams<{ lpAsset: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const asset = lpAsset ? decodeURIComponent(lpAsset) : undefined;
  const { data: pool, isLoading } = useLpAssetPool(asset);

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
    return <div className="p-4 text-center text-gray-600">Pool position not found</div>;
  }

  const pair = `${pool.asset_a} / ${pool.asset_b}`;

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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button fullWidth disabled title="Pool deposit compose UI is not available yet">
            Deposit
          </Button>
          <Button fullWidth disabled title="Pool withdrawal compose UI is not available yet">
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
