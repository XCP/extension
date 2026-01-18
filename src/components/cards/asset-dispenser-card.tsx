import { type ReactElement, type KeyboardEvent, type MouseEvent } from "react";
import { FaCopy, FaCheck } from "@/components/icons";
import { formatAmount, formatAddress } from "@/utils/format";
import { isNumericAsset } from "@/utils/validation/asset";
import type { DispenserDetails } from "@/utils/blockchain/counterparty/api";

interface AssetDispenserCardProps {
  dispenser: DispenserDetails;
  formattedPrice: string;
  onClick?: () => void;
  onCopyAddress?: (address: string) => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * AssetDispenserCard displays a dispenser on an asset-specific page.
 * Shows price, remaining supply, dispense amount, and address.
 */
export function AssetDispenserCard({
  dispenser,
  formattedPrice,
  onClick,
  onCopyAddress,
  isCopied = false,
  className = "",
}: AssetDispenserCardProps): ReactElement {
  const remaining = Number(dispenser.give_remaining_normalized);
  const perDispense = Number(dispenser.give_quantity_normalized);

  // Use 8 decimals for fractional amounts, 0 for whole numbers
  const formatAssetAmount = (value: number) => value % 1 === 0
    ? formatAmount({ value, maximumFractionDigits: 0 })
    : formatAmount({ value, minimumFractionDigits: 8, maximumFractionDigits: 8 });

  const remainingFormatted = formatAssetAmount(remaining);
  const perDispenseFormatted = formatAssetAmount(perDispense);

  // Show asset name for regular named assets, hide for numeric/subassets
  const isSubasset = Boolean(dispenser.asset_info?.asset_longname);
  const isNumeric = isNumericAsset(dispenser.asset);
  const showAssetName = !isSubasset && !isNumeric;
  const assetSuffix = showAssetName ? ` ${dispenser.asset}` : "";

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  const handleCopyClick = (e: MouseEvent) => {
    e.stopPropagation();
    onCopyAddress?.(dispenser.source);
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 ${onClick ? "hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-green-600">
            {formattedPrice}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {remainingFormatted} remaining
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <div className="text-xs text-gray-700">
            for {perDispenseFormatted}{assetSuffix}
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className="text-xs text-gray-400 truncate">
              {formatAddress(dispenser.source, true)}
            </span>
            {onCopyAddress && (
              <button
                onClick={handleCopyClick}
                className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isCopied
                    ? "text-green-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Copy address"
              >
                {isCopied ? (
                  <FaCheck className="size-3" aria-hidden="true" />
                ) : (
                  <FaCopy className="size-3" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
