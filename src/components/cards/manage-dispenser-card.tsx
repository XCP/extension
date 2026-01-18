import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { FaExternalLinkAlt } from "@/components/icons";
import { AssetIcon } from "@/components/asset-icon";
import { Button } from "@/components/button";
import { formatAmount } from "@/utils/format";
import type { Dispenser } from "@/utils/blockchain/counterparty/api";

interface ManageDispenserCardProps {
  dispenser: Dispenser;
  className?: string;
}

/**
 * ManageDispenserCard displays a user's own dispenser with close action.
 */
export function ManageDispenserCard({
  dispenser,
  className = "",
}: ManageDispenserCardProps): ReactElement {
  const navigate = useNavigate();
  const isOpen = dispenser.status === 0;

  return (
    <div className={`bg-white rounded-lg shadow-sm p-3 ${className}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <AssetIcon asset={dispenser.asset} size="sm" />
          <div>
            <div className="font-medium text-gray-900">
              {dispenser.asset_info?.asset_longname || dispenser.asset}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatAmount({ value: Number(dispenser.give_remaining_normalized), maximumFractionDigits: 4 })} remaining
            </div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          isOpen ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}>
          {isOpen ? "Open" : "Closed"}
        </span>
      </div>
      <div className="flex gap-2">
        {isOpen && (
          <Button
            color="gray"
            onClick={() => navigate(`/compose/dispenser/close/${dispenser.source}/${dispenser.asset}`)}
            fullWidth
          >
            Close
          </Button>
        )}
        <button
          onClick={() => window.open(`https://www.xcp.io/tx/${dispenser.tx_hash}`, "_blank")}
          className="px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="View on XCP.io"
        >
          <FaExternalLinkAlt className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
