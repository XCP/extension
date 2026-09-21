import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { PendingStatus } from "@/components/domain/balance/pending-status";
import { UtxoMenu } from "@/components/domain/utxo/utxo-menu";
import type { UtxoBalance } from "@/core/counterparty/api";
import { formatAmount, formatAsset, formatTxid } from "@/core/format";

interface UtxoCardProps {
  token: UtxoBalance;
  /**
   * What the mempool is doing to this UTXO, e.g. "Detaching". Takes the place of the transaction
   * id rather than crowding in beside it: while a UTXO is being moved or detached, what is
   * happening to it is the more useful of the two, and the id is one tap away on the card itself.
   */
  pendingStatus?: string;
}

export function UtxoCard({ token, pendingStatus }: UtxoCardProps): ReactElement {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/assets/utxos/${token.utxo}`);
  };

  const isDivisible = token.asset_info?.divisible ?? false;

  return (
    // The card is a container, not a control: the menu is its own button, and a
    // button cannot contain another one. Opening the utxo is the button here.
    <div className="relative bg-white rounded-lg shadow-sm">
      <button
        type="button"
        className="flex w-full items-center p-4 text-left rounded-lg cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={handleClick}
      >
        <AssetIcon asset={token.asset} size="lg" className="flex-shrink-0" />

        <div className="ml-3 flex-grow min-w-0">
          <div className="font-medium text-sm text-gray-900">
            {formatAsset(token.asset, { assetInfo: token.asset_info, shorten: true })}
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-500">
              {formatAmount({
                value: token.quantity_normalized,
                minimumFractionDigits: isDivisible ? 8 : 0,
                maximumFractionDigits: isDivisible ? 8 : 0,
                useGrouping: true,
              })}
            </span>
            {pendingStatus ? (
              <PendingStatus label={pendingStatus} className="ml-2" />
            ) : (
              <span className="text-xs text-gray-400 font-mono ml-2">
                {formatTxid(token.utxo)}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="absolute top-2 right-2">
        <UtxoMenu utxo={token.utxo} />
      </div>
    </div>
  );
}
