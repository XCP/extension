import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { UtxoMenu } from "@/components/ui/menus/utxo-menu";
import type { UtxoBalance } from "@/utils/blockchain/counterparty/api";
import { formatAmount, formatAsset, formatTxid } from "@/utils/format";

interface UtxoCardProps {
  token: UtxoBalance;
}

export function UtxoCard({ token }: UtxoCardProps): ReactElement {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/assets/utxos/${token.utxo}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const isDivisible = token.asset_info?.divisible ?? false;

  return (
    <div
      className="relative flex items-center p-4 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <AssetIcon asset={token.asset} size="lg" className="flex-shrink-0" />

      <div className="ml-3 flex-grow min-w-0">
        <div className="font-medium text-sm text-gray-900">
          {formatAsset(token.asset, { assetInfo: token.asset_info, shorten: true })}
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-gray-500">
            {formatAmount({
              value: Number(token.quantity_normalized),
              minimumFractionDigits: isDivisible ? 8 : 0,
              maximumFractionDigits: isDivisible ? 8 : 0,
              useGrouping: true,
            })}
          </span>
          <span className="text-xs text-gray-400 font-mono ml-2">
            {formatTxid(token.utxo)}
          </span>
        </div>
      </div>

      <div className="absolute top-2 right-2">
        <UtxoMenu utxo={token.utxo} />
      </div>
    </div>
  );
}
