import { type ReactElement } from 'react';
import { Field, Label, Description } from '@headlessui/react';
import { formatAmount } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { isValidPositiveNumber } from '@/utils/numeric';

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
  disabled = false
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

      if (value) {
        const priceValue = parseFloat(value);
        if (!isNaN(priceValue) && priceValue !== 0) {
          const invertedPrice = formatAmount({
            value: 1 / priceValue,
            maximumFractionDigits: 8,
            minimumFractionDigits: 8
          });
          onChange(invertedPrice);
        }
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitizedValue = e.target.value.replace(/[^\d.]/g, '');
    
    const parts = sanitizedValue.split('.');
    const cleanedValue = parts.length > 2 
      ? `${parts[0]}.${parts.slice(1).join('')}`
      : sanitizedValue;

    if (cleanedValue === '' || isValidPositiveNumber(cleanedValue, { allowZero: true, maxDecimals: 8 })) {
      onChange(cleanedValue);
    }
  };

  const handleSuggestClick = () => {
    if (!tradingPairData?.last_trade_price) return;

    const suggestedPrice = Number(tradingPairData.last_trade_price);
    if (!isNaN(suggestedPrice)) {
      onChange(formatAmount({
        value: suggestedPrice,
        maximumFractionDigits: 8,
        minimumFractionDigits: 8
      }));
    }
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
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {priceDescription}
          {tradingPairData?.last_trade_price && (
            <span className="ml-1">
              Last trade: {formatAmount({
                value: showPairFlip && isPairFlipped
                  ? 1 / Number(tradingPairData.last_trade_price)
                  : Number(tradingPairData.last_trade_price),
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
