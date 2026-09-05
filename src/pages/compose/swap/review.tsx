import { useState } from "react";
import { getDieselMintReviewFields } from "@/components/domain/tx/diesel-mint-review-fields";
import { FaExchangeAlt } from "@/components/icons";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatPriceRatio } from "@/core/format";

/**
 * Props for the ReviewSwap component.
 */
interface ReviewSwapProps {
  apiResponse: any; // Same order compose response shape as ReviewOrder
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for swap transactions.
 *
 * A swap composes a regular DEX order, but the labels reflect swap semantics:
 * the order's get_quantity is the MINIMUM received (quote minus slippage), not
 * the expected fill, and the implied ratio is the worst acceptable price.
 * @param {ReviewSwapProps} props - Component props
 * @returns {ReactElement} Review UI for swap transaction
 */
export function ReviewSwap({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewSwapProps) {
  const { result } = apiResponse;
  const [isPriceFlipped, setIsPriceFlipped] = useState(false);

  // Use asset_longname if available, otherwise use asset name
  const giveAssetDisplay = result.params.give_asset_info?.asset_longname || result.params.give_asset;
  const getAssetDisplay = result.params.get_asset_info?.asset_longname || result.params.get_asset;

  // Use normalized values from verbose API response (already formatted correctly for divisibility)
  const giveQuantityDisplay = result.params.give_quantity_normalized ?? result.params.give_quantity;
  const getQuantityDisplay = result.params.get_quantity_normalized ?? result.params.get_quantity;

  const customFields = [
    {
      label: "You Send",
      value: `${giveQuantityDisplay} ${giveAssetDisplay}`,
    },
    {
      label: "Minimum Received",
      value: `${getQuantityDisplay} ${getAssetDisplay}`,
    },
    {
      label: "Minimum Price",
      value: formatPriceRatio(
        giveQuantityDisplay,
        getQuantityDisplay,
        giveAssetDisplay,
        getAssetDisplay,
        isPriceFlipped
      ),
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
    // Swaps compose with expiration 1: fill what the price allows on
    // confirmation, refund the rest a block later.
    { label: "Fills", value: "Immediately, or cancels next block" },
    ...getDieselMintReviewFields(result.diesel_mint),
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
