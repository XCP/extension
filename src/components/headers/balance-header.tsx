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

export const BalanceHeader: React.FC<BalanceHeaderProps> = ({
  balance,
  className = "",
}) => {
  const formattedBalance = balance.quantity_normalized
    ? formatAmount({
        value: Number(balance.quantity_normalized),
        minimumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
        maximumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
        useGrouping: true,
      })
    : "0";

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={`https://app.xcp.io/img/icon/${balance.asset}`}
        alt={balance.asset}
        className="w-12 h-12 mr-4"
      />
      <div>
        <h2 className="text-xl font-bold break-all">
          {balance.asset_info?.asset_longname || balance.asset}
        </h2>
        <p className="text-sm text-gray-600">Available: {formattedBalance}</p>
      </div>
    </div>
  );
};
