import React from 'react';

export interface AssetInfo {
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  divisible: boolean;
  locked: boolean;
  supply?: string | number;
}

interface AssetHeaderProps {
  assetInfo: AssetInfo;
  className?: string;
}

export const AssetHeader = ({
  assetInfo,
  className = '',
}: AssetHeaderProps) => {
  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={`https://app.xcp.io/img/icon/${assetInfo.asset}`}
        alt={assetInfo.asset}
        className="w-12 h-12 mr-4"
      />
      <div>
        <h2 className="text-xl font-bold break-all">
          {assetInfo.asset_longname || assetInfo.asset}
        </h2>
        <p className="text-gray-600 text-sm">
            Supply: {formatAmount({
              value: Number(assetInfo.supply_normalized),
              minimumFractionDigits: assetInfo.divisible ? 8 : 0,
              maximumFractionDigits: assetInfo.divisible ? 8 : 0,
              useGrouping: true,
            })}
          </p>
      </div>
    </div>
  );
};
