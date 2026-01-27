import { useState, type ChangeEvent, type ReactElement } from "react";
import { Field, Input, Label, Description } from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { isValidBitcoinAddress } from "@/utils/validation/bitcoin";
import { composeSend } from "@/utils/blockchain/counterparty/compose";
import { formatAmount } from "@/utils/format";
import {
  toSatoshis,
  fromSatoshis,
  subtractSatoshis,
  divideSatoshis,
  isLessThanOrEqualToSatoshis
} from "@/utils/numeric";
import { isDustAmount } from "@/utils/validation/amount";

// Known safe error messages that can be shown to users
// These are intentionally user-friendly and don't leak internal details
const KNOWN_SAFE_ERRORS = [
  "No available balance.",
  "Insufficient balance to cover transaction fee.",
  "Amount per destination after fee is below dust limit.",
];

interface AmountWithMaxInputProps {
  asset: string;
  availableBalance: string;
  value: string;
  onChange: (value: string) => void;
  sat_per_vbyte: number;
  setError: (message: string | null) => void;
  showHelpText?: boolean;
  sourceAddress: { address: string } | null;
  maxAmount: string;
  label: string;
  name: string;
  description?: string;
  disabled?: boolean;
  destinationCount?: number;
  destination?: string;
  memo?: string;
  disableMaxButton?: boolean;
  onMaxClick?: () => void;
  hasError?: boolean;
  autoFocus?: boolean;
}

/**
 * AmountWithMaxInput provides amount entry with a Max button that calculates
 * the maximum sendable amount accounting for fees.
 *
 * @param props - The component props
 * @returns A ReactElement representing the amount input with max button
 */
export function AmountWithMaxInput({
  asset,
  availableBalance,
  value,
  onChange,
  sat_per_vbyte,
  setError,
  showHelpText = false,
  sourceAddress,
  maxAmount,
  label,
  name,
  description,
  disabled = false,
  destinationCount = 1,
  destination,
  memo = "",
  disableMaxButton = false,
  onMaxClick,
  hasError = false,
  autoFocus = false,
}: AmountWithMaxInputProps): ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setError(null);
  };
  
  const handleMaxButtonClick = async () => {
    if (!sourceAddress || disabled) return;
    const sourceAddr = sourceAddress.address;

    if (asset !== "BTC") {
      const maxNum = Number(maxAmount);
      if (!isNaN(maxNum)) {
        const perDestination = formatAmount({
          value: maxNum / destinationCount,
          maximumFractionDigits: 8,
          minimumFractionDigits: 8
        });
        onChange(perDestination);
      }
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      const estimationDestination =
        destination && isValidBitcoinAddress(destination)
          ? destination
          : sourceAddr;
      const availableSats = toSatoshis(availableBalance); // Integer string
      if (isLessThanOrEqualToSatoshis(availableSats, "0")) {
        throw new Error("No available balance.");
      }

      let candidate: string | undefined;

      try {
        const composeResult = await composeSend({
          sourceAddress: sourceAddr,
          destination: estimationDestination,
          asset: "BTC",
          quantity: Number(availableSats), // Convert to number for API
          memo,
          sat_per_vbyte,
          memo_is_hex: false,
        });
        candidate = subtractSatoshis(availableSats, composeResult.result.btc_fee);
      } catch (e: any) {
        const errorMsg = e.response?.data?.error || e.message || "";
        const regex = /Insufficient funds for the target amount:\s*(\d+)\s*<\s*(\d+)/;
        const match = regex.exec(errorMsg);
        if (match) {
          const balanceParsed = match[1];
          const targetNeeded = match[2];
          candidate = subtractSatoshis(balanceParsed, subtractSatoshis(targetNeeded, balanceParsed));
        } else {
          throw e;
        }
      }

      if (!candidate || isLessThanOrEqualToSatoshis(candidate, "0")) {
        throw new Error("Insufficient balance to cover transaction fee.");
      }

      const amountPerDestination = divideSatoshis(candidate, destinationCount);
      const amountPerDestSatoshis = parseInt(amountPerDestination);
      if (isDustAmount(amountPerDestSatoshis)) {
        throw new Error("Amount per destination after fee is below dust limit.");
      }
      const finalAmount = fromSatoshis(amountPerDestination); // Returns BTC string
      onChange(finalAmount);
    } catch (err: unknown) {
      console.error("Failed to calculate max amount:", err);
      // Only show known safe error messages to users to prevent leaking internal details
      if (err instanceof Error && KNOWN_SAFE_ERRORS.includes(err.message)) {
        setError(err.message);
      } else {
        setError("Failed to calculate maximum amount. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMaxClick = async () => {
    if (onMaxClick) {
      onMaxClick();
      return;
    }

    if (!sourceAddress?.address) {
      setError("Source address is required to calculate max amount");
      return;
    }

    // For BTC, use the more complex calculation that accounts for fees
    if (asset === "BTC") {
      await handleMaxButtonClick();
      return;
    }

    try {
      let maxNum = parseFloat(maxAmount || availableBalance);
      
      // If we have multiple destinations, divide the max amount
      if (destinationCount && destinationCount > 1) {
        const perDestination = formatAmount({
          value: maxNum / destinationCount,
          maximumFractionDigits: 8,
          minimumFractionDigits: 8
        });
        onChange(perDestination);
      } else {
        onChange(maxAmount || availableBalance);
      }
    } catch (error) {
      console.error("Error calculating max amount:", error);
      setError("Error calculating max amount");
    }
  };

  return (
    <Field>
      <Label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </Label>
      <div className="mt-1 relative rounded-md">
        <Input
          type="text"
          name={name}
          id={name}
          value={value}
          onChange={handleInputChange}
          autoComplete="off"
          className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 pr-16 focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed ${
            hasError 
              ? "border-red-500 focus:border-red-500 focus:ring-red-500" 
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          }`}
          placeholder="0.00000000"
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <Button
          variant="input"
          onClick={handleMaxClick}
          disabled={isLoading || disabled || (disableMaxButton && !onMaxClick)}
          aria-label={isLoading ? "Calculating maximum amount…" : "Use maximum available amount"}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 px-2 py-1 text-sm"
        >
          Max
        </Button>
      </div>
      {showHelpText && (
        <Description id={`${name}-description`} className="mt-2 text-sm text-gray-500">
          {description || `Enter the amount of ${asset} you want to send${destinationCount > 1 ? " (per destination)" : ""}.`}
        </Description>
      )}
    </Field>
  );
}
