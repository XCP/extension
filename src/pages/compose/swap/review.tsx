import { useState } from "react";
import { FaExchangeAlt } from "@/components/icons";
import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";
import { formatPriceRatio } from "@/core/format";

import { t } from '@/i18n';

type ReviewSwapProps = TransactionReviewProps<Pick<ComposeParams, 'get_asset' | 'get_asset_info' | 'get_quantity' | 'get_quantity_normalized' | 'give_asset' | 'give_asset_info' | 'give_quantity' | 'give_quantity_normalized'>>;

export function ReviewSwap({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewSwapProps) {
  const { result } = apiResponse;
  const [isPriceFlipped, setIsPriceFlipped] = useState(false);

  const giveAssetDisplay = result.params.give_asset_info?.asset_longname || result.params.give_asset;
  const getAssetDisplay = result.params.get_asset_info?.asset_longname || result.params.get_asset;

  const giveQuantityDisplay = result.params.give_quantity_normalized ?? result.params.give_quantity;
  const getQuantityDisplay = result.params.get_quantity_normalized ?? result.params.get_quantity;

  const customFields = [
    {
      label: t('common_you_send'),
      value: `${giveQuantityDisplay} ${giveAssetDisplay}`,
    },
    {
      label: t('swap_review_minimum_received'),
      value: `${getQuantityDisplay} ${getAssetDisplay}`,
    },
    {
      label: t('swap_review_minimum_price'),
      value: giveQuantityDisplay === undefined || getQuantityDisplay === undefined || !giveAssetDisplay || !getAssetDisplay ? t('common_not_available') : formatPriceRatio(
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
          aria-label={t('common_flip_price_ratio')}
        >
          <FaExchangeAlt className="size-4 text-gray-600" aria-hidden="true" />
        </button>
      ),
    },
    // Swaps compose with expiration 1: fill what the price allows on
    // confirmation, refund the rest a block later.
    { label: t('swap_review_fills'), value: t('swap_review_immediately_or_cancels_next_block') },
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
