"use client";

import { useEffect, useState } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { DispenserList, type DispenserOption } from "@/components/lists/dispenser-list";
import { 
  fetchAddressDispensers,
  type DispenseOptions 
} from "@/utils/blockchain/counterparty";

// ============================================================================
// Types
// ============================================================================

interface DispenserInputProps {
  value: string; // The dispenser address
  onChange: (address: string) => void;
  selectedIndex: number | null;
  onSelectionChange: (index: number | null, option: DispenserOption | null) => void;
  initialFormData?: DispenseOptions | null;
  disabled?: boolean;
  showHelpText?: boolean;
  required?: boolean;
  onError?: (error: string | null) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

// ============================================================================
// Constants
// ============================================================================

const SATOSHIS_PER_BTC = 1e8;

// ============================================================================
// Main Component
// ============================================================================

export function DispenserInput({
  value,
  onChange,
  selectedIndex,
  onSelectionChange,
  initialFormData,
  disabled = false,
  showHelpText = false,
  required = true,
  onError,
  onLoadingChange,
}: DispenserInputProps) {
  const [dispenserOptions, setDispenserOptions] = useState<DispenserOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch dispenser details when address changes
  useEffect(() => {
    const fetchDispensers = async () => {
      if (!value.trim()) {
        setDispenserOptions([]);
        setError(null);
        if (onError) onError(null);
        return;
      }

      setIsLoading(true);
      if (onLoadingChange) onLoadingChange(true);
      setError(null);
      if (onError) onError(null);
      setDispenserOptions([]);

      try {
        const { dispensers } = await fetchAddressDispensers(value, { 
          status: "open", 
          verbose: true 
        });

        if (!dispensers || dispensers.length === 0) {
          const errorMsg = "No open dispenser found at this address.";
          setError(errorMsg);
          if (onError) onError(errorMsg);
          return;
        }

        // Process and normalize dispensers
        const processedDispensers = (dispensers as any[])
          .map(dispenser => {
            const isDivisible = dispenser.asset_info?.divisible ?? false;
            const divisor = isDivisible ? SATOSHIS_PER_BTC : 1;
            return {
              ...dispenser,
              give_remaining_normalized: (dispenser.give_remaining / divisor).toString(),
              give_quantity_normalized: (dispenser.give_quantity / divisor).toString(),
            };
          })
          .sort((a, b) => {
            // Sort by price first, then by asset name
            if (a.satoshirate !== b.satoshirate) {
              return a.satoshirate - b.satoshirate;
            }
            return a.asset.localeCompare(b.asset);
          });

        // Create options
        const options = processedDispensers.map((dispenser, index) => ({
          dispenser,
          satoshirate: dispenser.satoshirate,
          btcAmount: dispenser.satoshirate / SATOSHIS_PER_BTC,
          index
        }));

        setDispenserOptions(options);
      } catch (err) {
        console.error("Error fetching dispenser details:", err);
        const errorMsg = "Error fetching dispenser details.";
        setError(errorMsg);
        if (onError) onError(errorMsg);
      } finally {
        setIsLoading(false);
        if (onLoadingChange) onLoadingChange(false);
      }
    };

    fetchDispensers();
  }, [value, onError, onLoadingChange]);

  // Auto-select first dispenser when options change
  useEffect(() => {
    if (dispenserOptions.length > 0) {
      if (selectedIndex === null) {
        onSelectionChange(0, dispenserOptions[0]);
      } else if (selectedIndex >= dispenserOptions.length) {
        onSelectionChange(0, dispenserOptions[0]);
      }
    } else if (dispenserOptions.length === 0) {
      onSelectionChange(null, null);
    }
  }, [dispenserOptions, selectedIndex, onSelectionChange]);

  return (
    <>
      {/* Dispenser Address Input */}
      <Field>
        <Label 
          htmlFor="dispenserAddress" 
          className="block text-sm font-medium text-gray-700"
        >
          Dispenser Address {required && <span className="text-red-500">*</span>}
        </Label>
        <Input
          id="dispenserAddress"
          name="dispenserAddress"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full p-2 rounded-md border"
          required={required}
          disabled={disabled || isLoading}
        />
        {showHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            Enter the dispenser address to send BTC to.
          </Description>
        )}
      </Field>

      {/* Dispenser List */}
      <DispenserList
        dispensers={dispenserOptions}
        selectedIndex={selectedIndex}
        onSelect={onSelectionChange}
        disabled={disabled}
        isLoading={isLoading}
        error={error}
      />

      {/* Hidden inputs for form data */}
      {selectedIndex !== null && dispenserOptions[selectedIndex] && (
        <>
          <input
            type="hidden"
            name="satoshirate"
            value={dispenserOptions[selectedIndex].satoshirate}
          />
          <input
            type="hidden"
            name="selectedDispenserIndex"
            value={selectedIndex}
          />
          <input type="hidden" name="dispenser" value={value} />
        </>
      )}
    </>
  );
}

// Re-export the type for convenience
export type { DispenserOption };