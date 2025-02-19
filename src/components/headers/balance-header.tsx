import React from "react";
import { formatAmount } from "@/utils/format";

interface TokenBalance {
  asset: string;
  asset_info?: {
    asset_longname: string | null;
    description?: string;
    issuer?: string;
    divisible?: boolean;
    locked?: boolean;
    supply?: string | number;
  };
  quantity_normalized?: string;
}

interface BalanceHeaderProps {
  balance: TokenBalance;
  className?: string;
}

export const BalanceHeader = ({ balance, className = "" }: BalanceHeaderProps) => {
  const formattedBalance = balance.quantity_normalized
    ? formatAmount({
        value: Number(balance.quantity_normalized),
        minimumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
        maximumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
        useGrouping: true,
      })
    : "0";

  const displayName = balance.asset_info?.asset_longname || balance.asset;
  const textSizeClass = !balance.asset_info?.asset_longname && balance.asset.startsWith('A') ? "text-lg" :
                       displayName.length > 21 ? "text-sm" : 
                       displayName.length > 18 ? "text-base" : 
                       displayName.length > 12 ? "text-lg" : "text-xl";

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={`https://app.xcp.io/img/icon/${balance.asset}`}
        alt={balance.asset}
        className="w-12 h-12 mr-4"
      />
      <div>
        <h2 className={`${textSizeClass} font-bold break-all`}>
          {displayName}
        </h2>
        <p className="text-sm text-gray-600">Available: {formattedBalance}</p>
      </div>
    </div>
  );
};
