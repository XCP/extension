import { useState } from "react";
import { FaExchangeAlt } from "@/components/icons";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatPriceRatio } from "@/utils/format";

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

  // Use asset_longname if available, otherwise use asset name
  const giveAssetDisplay = result.params.give_asset_info?.asset_longname || result.params.give_asset;
  const getAssetDisplay = result.params.get_asset_info?.asset_longname || result.params.get_asset;

  // Use normalized values from verbose API response (already formatted correctly for divisibility)
  const giveQuantityDisplay = result.params.give_quantity_normalized ?? result.params.give_quantity;
  const getQuantityDisplay = result.params.get_quantity_normalized ?? result.params.get_quantity;

  const getPriceDisplay = () => {
    return formatPriceRatio(
      result.params.give_quantity,
      result.params.get_quantity,
      giveAssetDisplay,
      getAssetDisplay,
      isPriceFlipped
    );
  };

  const customFields = [
    {
      label: "Give",
      value: `${giveQuantityDisplay} ${giveAssetDisplay}`,
    },
    {
      label: "Get",
      value: `${getQuantityDisplay} ${getAssetDisplay}`,
    },
    {
      label: "Price",
      value: getPriceDisplay(),
      rightElement: (
        <button
          type="button"
          onClick={() => setIsPriceFlipped(!isPriceFlipped)}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Flip price ratio"
        >
          <FaExchangeAlt className="size-4 text-gray-600" aria-hidden="true" />
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
