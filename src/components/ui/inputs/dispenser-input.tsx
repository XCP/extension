import { useEffect, useState, type ReactElement } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { DispenserList, type DispenserOption } from "@/components/ui/lists/dispenser-list";
import { fetchAddressDispensers } from "@/utils/blockchain/counterparty/api";
import type { DispenseOptions } from "@/utils/blockchain/counterparty/compose";
import { isValidBitcoinAddress } from "@/utils/validation/bitcoin";

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

/**
 * DispenserInput provides an address input with automatic dispenser discovery.
 *
 * @param props - The component props
 * @returns A ReactElement representing the dispenser input with selection list
 */
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
}: DispenserInputProps): ReactElement {
  const [dispenserOptions, setDispenserOptions] = useState<DispenserOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check if current value is a valid address
  const isValidAddress = value ? isValidBitcoinAddress(value) : false;
  const showInvalidBorder = value && !isValidAddress;

  // Fetch dispenser details only when we have a valid address
  useEffect(() => {
    // Clear state when address is invalid or empty
    if (!isValidAddress) {
      setDispenserOptions([]);
      setError(null);
      if (onError) onError(null);
      setIsLoading(false);
      if (onLoadingChange) onLoadingChange(false);
      return;
    }

    // Valid address - proceed with fetching
    const fetchDispensers = async () => {
      setIsLoading(true);
      if (onLoadingChange) onLoadingChange(true);
      setError(null);
      if (onError) onError(null);
      setDispenserOptions([]);

      try {
        const response = await fetchAddressDispensers(value, {
          status: "open",
          verbose: true
        });

        if (!response.result || response.result.length === 0) {
          const errorMsg = "No open dispenser found at this address.";
          setError(errorMsg);
          if (onError) onError(errorMsg);
          return;
        }

        // Process and normalize dispensers
        const processedDispensers = (response.result as any[])
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
  }, [value, isValidAddress, onError, onLoadingChange]);

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
          className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 focus:ring-2 ${
            showInvalidBorder ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          }`}
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