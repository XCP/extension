import { type ReactElement } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount } from "@/utils/format";
import { getCanonicalPoolPair } from "@/utils/blockchain/counterparty/pool";
import type { Pool, PoolPosition } from "@/utils/blockchain/counterparty/api";

interface PoolHeaderProps {
  pool: Pool | PoolPosition;
  className?: string;
}

export function PoolHeader({ pool, className = "" }: PoolHeaderProps): ReactElement {
  const pair = getCanonicalPoolPair(pool.asset_a, pool.asset_b);
  const quantity = "quantity_normalized" in pool ? pool.quantity_normalized : undefined;
  const balance = quantity
    ? formatAmount({
        value: Number(quantity),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
        useGrouping: true,
      })
    : null;

  return (
    <div className={`flex items-center ${className}`}>
      <AssetIcon asset={pool.lp_asset} size="lg" className="mr-4" />
      <div className="min-w-0">
        <h2 className="text-xl font-bold break-words">{pair}</h2>
        <p className="text-sm text-gray-600">
          {balance ? `Balance: ${balance}` : `LP Asset: ${pool.lp_asset}`}
        </p>
      </div>
    </div>
  );
}
