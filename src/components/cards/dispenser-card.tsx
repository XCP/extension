"use client";

import React from "react";
import { formatAmount } from "@/utils/format";
import { 
  divide, 
  roundDown, 
  toNumber 
} from "@/utils/numeric";
import type { ReactElement } from "react";

// ============================================================================
// Types
// ============================================================================

interface DispenserDetails {
  asset: string;
  tx_hash: string;
  status: number;
  give_remaining: number;
  give_remaining_normalized: string;
  give_quantity: number;
  give_quantity_normalized: string;
  satoshirate: number;
  asset_info?: {
    asset_longname: string | null;
    description: string;
    issuer: string | null;
    divisible: boolean;
    locked: boolean;
  };
}

export interface DispenserOption {
  dispenser: DispenserDetails;
  satoshirate: number;
  btcAmount: number;
  index: number;
}

interface DispenserCardProps {
  option: DispenserOption;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate remaining dispenses for a dispenser
 */
function calculateRemainingDispenses(dispenser: DispenserDetails): number {
  return toNumber(
    roundDown(
      divide(dispenser.give_remaining_normalized, dispenser.give_quantity_normalized)
    )
  );
}

// ============================================================================
// Main Component
// ============================================================================

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
      />
      
      <div className="w-full">
        <div className="flex items-start gap-3">
          <img
            src={`https://app.xcp.io/img/icon/${option.dispenser.asset}`}
            alt={option.dispenser.asset}
            className="w-10 h-10 flex-shrink-0"
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