import { type ReactElement } from "react";
import { formatAmount } from "@/utils/format";
import { divide, roundDown, toNumber } from "@/utils/numeric";
import type { Dispenser } from "@/utils/blockchain/counterparty/api";

/**
 * Extended dispenser option interface for selection
 */
export interface DispenserOption {
  dispenser: Dispenser & {
    give_quantity: number;
    give_quantity_normalized: string;
    satoshirate: number;
  };
  satoshirate: number;
  btcAmount: number;
  index: number;
}

/**
 * Props interface for the DispenserCard component
 */
interface DispenserCardProps {
  /** The dispenser option data */
  option: DispenserOption;
  /** Whether this dispenser is selected */
  isSelected: boolean;
  /** Handler for selecting this dispenser */
  onSelect: () => void;
  /** Whether the card is disabled */
  disabled?: boolean;
}

/**
 * Calculate remaining dispenses for a dispenser
 */
function calculateRemainingDispenses(dispenser: DispenserOption['dispenser']): number {
  return toNumber(
    roundDown(
      divide(dispenser.give_remaining_normalized, dispenser.give_quantity_normalized)
    )
  );
}

/**
 * DispenserCard Component
 * 
 * A specialized card component for displaying dispenser options
 * with radio selection functionality.
 * 
 * Features:
 * - Displays dispenser asset information
 * - Shows BTC price and remaining dispenses
 * - Radio button selection
 * - Visual feedback for selected state
 * 
 * @param props - The component props
 * @returns A ReactElement representing the dispenser card
 * 
 * @example
 * ```tsx
 * <DispenserCard
 *   option={dispenserOption}
 *   isSelected={selectedIndex === 0}
 *   onSelect={() => setSelectedIndex(0)}
 *   disabled={false}
 * />
 * ```
 */
export function DispenserCard({ 
  option, 
  isSelected, 
  onSelect, 
  disabled = false 
}: DispenserCardProps): ReactElement {
  const remainingDispenses = calculateRemainingDispenses(option.dispenser);

  return (
    <label
      htmlFor={`dispenser-${option.index}`}
      className={`
        relative flex items-start gap-3 bg-gray-50 p-4 rounded-md border border-gray-300 cursor-pointer
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${isSelected ? "ring-2 ring-blue-500" : ""}
      `}
    >
      <input
        type="radio"
        id={`dispenser-${option.index}`}
        name="selectedDispenserIndex"
        value={option.index}
        checked={isSelected}
        onChange={onSelect}
        className="form-radio text-blue-600 absolute right-5 top-5"
        disabled={disabled}
        aria-label={`Select dispenser for ${option.dispenser.asset}`}
      />
      
      <div className="w-full">
        <div className="flex items-start gap-3">
          <img
            src={`https://app.xcp.io/img/icon/${option.dispenser.asset}`}
            alt={option.dispenser.asset}
            className="w-10 h-10 flex-shrink-0 rounded-full"
            onError={(e) => {
              // Fallback for missing icons
              const target = e.target as HTMLImageElement;
              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='14'%3E%3F%3C/text%3E%3C/svg%3E";
            }}
          />
          
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900">
              {option.dispenser.asset_info?.asset_longname ?? option.dispenser.asset}
            </div>
            <div className="text-sm text-gray-600">
              {formatAmount({
                value: option.btcAmount,
                maximumFractionDigits: 8,
                minimumFractionDigits: 8
              })} BTC
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-2">
          <div className="flex gap-2 text-xs text-gray-600">
            <span>
              {formatAmount({
                value: Number(option.dispenser.give_quantity_normalized),
                minimumFractionDigits: 0,
                maximumFractionDigits: 8,
              })} Per Dispense
            </span>
            <span>
              {remainingDispenses} Remaining
            </span>
          </div>
          <span className="text-xs text-green-600">Open</span>
        </div>
      </div>
    </label>
  );
}

export default DispenserCard;