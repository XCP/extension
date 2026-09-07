import { Description, Field, Input, Label } from "@headlessui/react";
import { type ChangeEvent, type ReactElement, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { estimateVsize } from "@/core/bitcoin/feeEstimation";
import { selectUtxosForTransaction } from "@/core/counterparty/utxoSelection";
import { formatAmount } from "@/core/format";
import { divide, fromSatoshis, multiply, roundDown, roundUp, toBigNumber, toNumber } from "@/core/numeric";
import { isDustAmount } from "@/core/validation/amount";

import { t } from '@/i18n';

/** An error whose message is copy written for the user and safe to show as-is. Anything else
 *  (a node failure, a bug) is replaced by a generic message so internals never leak. */
class UserFacingError extends Error {}

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
  isDivisible?: boolean; // Whether the asset is divisible (default: true for BTC-like decimals)
  labelRight?: ReactNode; // Optional content aligned right of the label
  labelSrOnly?: boolean; // Hide label visually (still accessible to screen readers)
  placeholder?: string; // Override default placeholder text
  extraOutputCount?: number; // Additional outputs to account for in fee estimation (e.g., more_outputs)
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
  feeRate,
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
  isDivisible = true,
  labelRight,
  labelSrOnly = false,
  placeholder: placeholderOverride,
  extraOutputCount = 0,
}: AmountWithMaxInputProps): ReactElement {
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Block decimal input for non-divisible assets
    if (!isDivisible && val.includes('.')) return;
    // Limit to 8 decimal places for divisible assets
    if (isDivisible && val.includes('.') && val.split('.')[1]!.length > 8) return;
    onChange(val);
    setError(null);
  };

  const handleMaxButtonClick = async () => {
    if (!sourceAddress?.address || disabled) return;

    if (asset !== "BTC") {
      // maxAmount is the whole balance as a decimal string; splitting it as a double would hand
      // the user a figure their balance cannot cover, or leave a remainder behind.
      const maxNum = toBigNumber(maxAmount);
      if (!maxNum.isNaN()) {
        // Use appropriate decimal places based on divisibility
        // maximumFractionDigits controls precision, minimumFractionDigits=0 avoids trailing zeros
        // useGrouping: false prevents commas in the value (e.g., "1000000" not "1,000,000")
        const decimals = isDivisible ? 8 : 0;
        const perDestination = formatAmount({
          value: divide(maxNum, destinationCount),
          maximumFractionDigits: decimals,
          minimumFractionDigits: 0,
          useGrouping: false
        });
        onChange(perDestination);
      }
      return;
    }

    if (feeRate === null || feeRate === undefined) {
      setError(t('common_fee_rates_are_still_loading'));
      return;
    }

    setIsLoading(true);
    try {
      setError(null);

      // Select UTXOs that are safe to spend (excludes those with Counterparty assets)
      const { utxos, totalValue, excludedWithAssets } = await selectUtxosForTransaction(
        sourceAddress.address,
        { allowUnconfirmed: true }
      );

      if (utxos.length === 0) {
        throw new UserFacingError(excludedWithAssets > 0
          ? t('common_no_spendable_balance_utxos_have', [String(excludedWithAssets)])
          : t('common_no_available_balance'));
      }

      if (totalValue <= 0) {
        throw new UserFacingError(t('common_no_available_balance'));
      }

      // Estimate vsize based on spendable UTXO count and address type
      // Add 1 for change output, plus any extra outputs (e.g., more_outputs adds to the transaction)
      const estimatedVbytes = estimateVsize(utxos.length, destinationCount + 1 + extraOutputCount, sourceAddress.address);

      // Add overhead for Counterparty OP_RETURN output (~30 vbytes for protocol message)
      // This accounts for the encoded send data that the Counterparty API adds
      const OP_RETURN_OVERHEAD = 30;
      const totalVbytes = estimatedVbytes + OP_RETURN_OVERHEAD;

      const estimatedFee = toNumber(roundUp(multiply(totalVbytes, feeRate)));

      const candidate = totalValue - estimatedFee;

      if (candidate <= 0) {
        throw new UserFacingError(t('balance_amount_with_max_input_insufficient_balance_to_cover_transaction'));
      }

      const amountPerDestination = toNumber(roundDown(divide(candidate, destinationCount)));
      if (isDustAmount(amountPerDestination)) {
        throw new UserFacingError(t('balance_amount_with_max_input_amount_per_destination_after_fee'));
      }
      const finalAmount = fromSatoshis(amountPerDestination.toString());
      onChange(finalAmount);
    } catch (err: unknown) {
      if (err instanceof UserFacingError) {
        setError(err.message);
      } else {
        setError(t('balance_amount_with_max_input_failed_to_calculate_maximum_amount'));
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
      setError(t('balance_amount_with_max_input_source_address_is_required_to'));
      return;
    }

    await handleMaxButtonClick();
  };

  return (
    <Field>
      <Label htmlFor={name} className={`text-sm font-medium text-gray-700 ${labelSrOnly ? 'sr-only' : ''} ${labelRight ? 'flex justify-between items-center' : ''}`}>
        <span>{label} <span className="text-red-500">*</span></span>
        {labelRight}
      </Label>
      <div className="mt-1 relative z-0 rounded-md">
        <Input
          type="text"
          name={name}
          id={name}
          value={value}
          onChange={handleInputChange}
          autoComplete="off"
          className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 pr-16 outline-none focus-visible:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed ${
            hasError
              ? "border-red-500 focus:border-red-500 focus-visible:ring-red-500"
              : "border-gray-300 focus:border-blue-500 focus-visible:ring-blue-500"
          }`}
          placeholder={placeholderOverride ?? (isDivisible ? "0.00000000" : "0")}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <Button
          variant="input"
          onClick={handleMaxClick}
          disabled={isLoading || disabled || (disableMaxButton && !onMaxClick)}
          aria-label={isLoading ? t('balance_amount_with_max_input_calculating_maximum_amount') : t('balance_amount_with_max_input_use_maximum_available_amount')}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 px-2 py-1 text-sm"
        >
          {t('common_max')}
        </Button>
      </div>
      {showHelpText && (
        <Description id={`${name}-description`} className="mt-2 text-sm text-gray-500">
          {description || (destinationCount > 1
            ? t('balance_amount_with_max_input_enter_the_amount_of_you', [String(asset)])
            : t('balance_amount_with_max_input_enter_the_amount_of_you_2', [String(asset)]))}
        </Description>
      )}
    </Field>
  );
}
