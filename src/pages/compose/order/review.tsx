import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { useState } from "react";
import { FaExchangeAlt } from "react-icons/fa";

/**
 * Props for the ReviewOrder component.
 */
interface ReviewOrderProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for order transactions.
 * @param {ReviewOrderProps} props - Component props
 * @returns {ReactElement} Review UI for order transaction
 */
export function ReviewOrder({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewOrderProps) {
  const { result } = apiResponse;
  const [isPriceFlipped, setIsPriceFlipped] = useState(false);

  const priceRatio = Number(result.params.get_quantity) / Number(result.params.give_quantity);
  
  const getPriceDisplay = () => {
    if (isPriceFlipped) {
      return `1 ${result.params.get_asset} = ${formatAmount({
        value: 1 / priceRatio,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.give_asset}`;
    }
    return `1 ${result.params.give_asset} = ${formatAmount({
      value: priceRatio,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    })} ${result.params.get_asset}`;
  };

  const customFields = [
    {
      label: "Give",
      value: `${formatAmount({
        value: fromSatoshis(result.params.give_quantity, true),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.give_asset}`,
    },
    {
      label: "Get",
      value: `${formatAmount({
        value: fromSatoshis(result.params.get_quantity, true),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.get_asset}`,
    },
    {
      label: "Price",
      value: getPriceDisplay(),
      rightElement: (
        <button
          type="button"
          onClick={() => setIsPriceFlipped(!isPriceFlipped)}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
          aria-label="Flip price ratio"
        >
          <FaExchangeAlt className="w-4 h-4 text-gray-600" />
        </button>
      ),
    },
    ...(result.params.expiration !== 8064
      ? [{ label: "Expiration", value: `${result.params.expiration} blocks` }]
      : []),
    ...(result.params.fee_required && Number(result.params.fee_required) > 0
      ? [{ label: "Fee Required", value: `${result.params.fee_required} satoshis` }]
      : []),
  ];

  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      customFields={customFields}
      error={error}
      isSigning={isSigning}
    />
  );
}
