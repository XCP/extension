import { Description, Field, Label } from '@headlessui/react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { formatAmount, formatForInput } from '@/core/format';
import { divide, isValidPositiveNumber, toBigNumber } from "@/core/numeric";

interface PriceWithSuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  tradingPairData: { last_trade_price: string | null; name: string } | null;
  showHelpText?: boolean;
  label?: string;
  name?: string;
  priceDescription?: string;
  className?: string;
  showPairFlip?: boolean;
  isPairFlipped?: boolean;
  setIsPairFlipped?: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  hideTradingPairInfo?: boolean;
}

/**
 * PriceWithSuggestInput provides price entry with suggested price buttons.
 *
 * @param props - The component props
 * @returns A ReactElement representing the price input with suggestions
 */
export function PriceWithSuggestInput({
  value,
  onChange,
  tradingPairData,
  showHelpText = false,
  label = 'Price',
  name = 'price',
  priceDescription,
  className,
  showPairFlip = false,
  isPairFlipped = false,
  setIsPairFlipped,
  disabled = false,
  hideTradingPairInfo = false,
}: PriceWithSuggestInputProps): ReactElement {
  const flipPairName = (pairName: string) => {
    const [baseAsset, quoteAsset] = pairName.split('/');
    return `${quoteAsset}/${baseAsset}`;
  };

  const displayedPairName = showPairFlip && tradingPairData?.name
    ? isPairFlipped
      ? flipPairName(tradingPairData.name)
      : tradingPairData.name
    : '';

  const handlePairFlip = () => {
    if (showPairFlip && setIsPairFlipped) {
      setIsPairFlipped(prev => !prev);

      if (isValidPositiveNumber(value)) {
        // A reciprocal is a generated price: explicitly round it to the supported precision.
        onChange(formatForInput(divide(1, value).decimalPlaces(8, 1), 8));
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value);
  const invalidDraft = value !== '' && !isValidPositiveNumber(value);
  const handleSuggestClick = () => {
    const suggested = tradingPairData?.last_trade_price;
    if (!suggested || !isValidPositiveNumber(suggested)) return;
    onChange(formatForInput(toBigNumber(suggested), 8));
  };

  return (
    <Field className={className}>
      <Label htmlFor={name} className="text-sm font-medium text-gray-700 flex justify-between items-center">
        <span className="flex items-center">
          {label} <span className="text-red-500">*</span>
        </span>
        {showPairFlip && displayedPairName && (
          <button
            type="button"
            className="text-xs text-blue-500 font-normal cursor-pointer hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            onClick={handlePairFlip}
            aria-label={`Flip trading pair to ${isPairFlipped ? tradingPairData?.name : flipPairName(tradingPairData?.name || '')}`}
          >
            {displayedPairName}
          </button>
        )}
      </Label>
      <div className="relative z-0">
        <input
          type="text"
          id={name}
          name={name}
          value={value}
          onChange={handleInputChange}
          inputMode="decimal"
          pattern={'([0-9]+(\\.[0-9]{1,8})?|\\.[0-9]{1,8})'}
          aria-invalid={invalidDraft || undefined}
          aria-describedby={invalidDraft ? `${name}-draft-error` : undefined}
          className={`mt-1 block w-full p-2.5 rounded-md border border-gray-300 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 pr-16 ${
            disabled ? "bg-gray-100 cursor-not-allowed" : "bg-gray-50"
          }`}
          required
          placeholder="0.00000000"
          disabled={disabled}
        />
        {tradingPairData?.last_trade_price && !disabled && (
          <Button
            variant="input"
            onClick={handleSuggestClick}
            aria-label="Use suggested price from last trade"
          >
            Min
          </Button>
        )}
      </div>
      {invalidDraft && <p id={`${name}-draft-error`} role="alert" className="mt-2 text-sm text-red-600">Use digits and a decimal point, with at most 8 decimal places. Do not use grouping separators.</p>}
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {priceDescription}
          {!hideTradingPairInfo && tradingPairData?.last_trade_price && (
            <span className="ml-1">
              Last trade: {formatAmount({
                value: showPairFlip && isPairFlipped
                  ? divide(1, tradingPairData.last_trade_price)
                  : tradingPairData.last_trade_price,
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
                useGrouping: true
              })}
            </span>
          )}
        </Description>
      )}
    </Field>
  );
}
