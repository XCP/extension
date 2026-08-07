import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import type { DispenserDetails } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { fromSatoshis } from "@/core/numeric";

interface ManageDispenserCardProps {
  dispenser: DispenserDetails;
  className?: string;
}

/**
 * ManageDispenserCard displays a user's own dispenser with close action.
 * Compact layout: Icon | Name + remaining | Close button
 */
export function ManageDispenserCard({
  dispenser,
  className = "",
}: ManageDispenserCardProps): ReactElement {
  const navigate = useNavigate();
  const isOpen = dispenser.status === 0;
  const assetName = dispenser.asset_info?.asset_longname || dispenser.asset;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/compose/dispenser/close/${dispenser.asset}`);
  };

  const handleRefill = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to create dispenser with same params for refill
    // Convert satoshirate to BTC (divide by 100,000,000)
    const btcPrice = fromSatoshis(dispenser.satoshirate);
    const params = new URLSearchParams({
      refill: "true",
      mainchainrate: btcPrice,
      give_quantity: dispenser.give_quantity_normalized.toString(),
    });
    navigate(`/compose/dispenser/${dispenser.asset}?${params.toString()}`);
  };

  const handleClick = () => {
    navigate(`/market/dispensers/${dispenser.asset}`);
  };

  return (
    // Opening the dispenser is a button, not the whole card: Refill and Close sit
    // inside, and a card-level key handler swallowed Enter before they could act.
    <div
      className={`bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow ${className}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          className="flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <AssetIcon asset={dispenser.asset} size="md" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm truncate">
              {assetName}
            </div>
            <div className="text-xs text-gray-500">
              {formatAmount({ value: dispenser.give_remaining_normalized, maximumFractionDigits: 2 })} remaining
            </div>
          </div>
        </button>
        {isOpen ? (
          <div className="flex gap-2">
            <button type="button"
              onClick={handleRefill}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Refill
            </button>
            <button type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Close
            </button>
          </div>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
            Closed
          </span>
        )}
      </div>
    </div>
  );
}
