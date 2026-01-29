import { useState, type ChangeEvent, type ReactElement } from "react";
import { Field, Input, Label, Description } from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { isDustAmount } from "@/utils/validation/amount";
import { selectUtxosForTransaction } from "@/utils/blockchain/counterparty/utxo-selection";
import { estimateVsize } from "@/utils/blockchain/bitcoin/fee-estimation";

// Known safe error messages that can be shown to users
// These are intentionally user-friendly and don't leak internal details
const KNOWN_SAFE_ERRORS = [
  "No available balance.",
  "Insufficient balance to cover transaction fee.",
  "Amount per destination after fee is below dust limit.",
];

// Pattern for dynamic error messages about excluded UTXOs
const EXCLUDED_UTXOS_PATTERN = /^No spendable balance\. \d+ UTXOs have attached assets\.$/;

interface AmountWithMaxInputProps {
  asset: string;
  availableBalance: string;
  value: string;
  onChange: (value: string) => void;
  feeRate?: number | null; // Only required for BTC (used in max calculation)
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
  feeRate = 0.1,
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
    if (!sourceAddress?.address || disabled) return;

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

    setIsLoading(true);
    try {
      setError(null);

      // Select UTXOs that are safe to spend (excludes those with Counterparty assets)
      const { utxos, totalValue, excludedWithAssets, excludedValue } = await selectUtxosForTransaction(
        sourceAddress.address,
        { allowUnconfirmed: true }
      );

      if (utxos.length === 0) {
        const message = excludedWithAssets > 0
          ? `No spendable balance. ${excludedWithAssets} UTXOs have attached assets.`
          : "No available balance.";
        throw new Error(message);
      }

      if (totalValue <= 0) {
        throw new Error("No available balance.");
      }

      // Estimate vsize based on spendable UTXO count and address type
      const estimatedVbytes = estimateVsize(utxos.length, destinationCount, sourceAddress.address);
      const effectiveFeeRate = feeRate ?? 0.1;
      const estimatedFee = Math.ceil(estimatedVbytes * effectiveFeeRate);

      const candidate = totalValue - estimatedFee;

      if (candidate <= 0) {
        throw new Error("Insufficient balance to cover transaction fee.");
      }

      const amountPerDestination = Math.floor(candidate / destinationCount);
      if (isDustAmount(amountPerDestination)) {
        throw new Error("Amount per destination after fee is below dust limit.");
      }
      const finalAmount = fromSatoshis(amountPerDestination.toString());
      onChange(finalAmount);
    } catch (err: unknown) {
      if (err instanceof Error) {
        // Check if it's a known safe error message
        if (KNOWN_SAFE_ERRORS.includes(err.message) || EXCLUDED_UTXOS_PATTERN.test(err.message)) {
          setError(err.message);
        } else {
          setError("Failed to calculate maximum amount. Please try again.");
        }
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

    await handleMaxButtonClick();
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
