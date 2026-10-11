import { useState } from "react";
import { FaExchangeAlt } from "@/components/icons";
import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";
import { formatAmount, formatPriceRatio } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";
import { DEFAULT_ORDER_EXPIRATION } from "@/core/settings";

import { t } from '@/i18n';

const formatExpiration = (expiration: unknown) => {
  const blocks = Number(expiration ?? DEFAULT_ORDER_EXPIRATION);
  return blocks === 0
    ? t('common_never_expires')
    : t('order_review_expiration_blocks', [formatAmount({ value: blocks, maximumFractionDigits: 0 })]);
};

type ReviewOrderProps = TransactionReviewProps<Pick<ComposeParams, 'expiration' | 'fee_required' | 'get_asset' | 'get_asset_info' | 'get_quantity' | 'get_quantity_normalized' | 'give_asset' | 'give_asset_info' | 'give_quantity' | 'give_quantity_normalized'>>;

export function ReviewOrder({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewOrderProps) {
  const { result } = apiResponse;
  const [isPriceFlipped, setIsPriceFlipped] = useState(false);

  const giveAssetDisplay = result.params.give_asset_info?.asset_longname || result.params.give_asset;
  const getAssetDisplay = result.params.get_asset_info?.asset_longname || result.params.get_asset;

  const giveQuantityDisplay = result.params.give_quantity_normalized ?? result.params.give_quantity;
  const getQuantityDisplay = result.params.get_quantity_normalized ?? result.params.get_quantity;

  const getPriceDisplay = () => {
    // Use normalized quantities for correct price calculation
    // Raw quantities are in satoshi-like units for divisible assets
    if (giveQuantityDisplay === undefined || getQuantityDisplay === undefined || !giveAssetDisplay || !getAssetDisplay) return t('common_not_available');
    return formatPriceRatio(
      giveQuantityDisplay,
      getQuantityDisplay,
      giveAssetDisplay,
      getAssetDisplay,
      isPriceFlipped
    );
  };

  const customFields = [
    {
      label: t('common_give'),
      value: `${giveQuantityDisplay} ${giveAssetDisplay}`,
    },
    {
      label: t('common_get'),
      value: `${getQuantityDisplay} ${getAssetDisplay}`,
    },
    {
      label: t('common_price'),
      value: getPriceDisplay(),
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
    { label: t('common_expiration'), value: formatExpiration(result.params.expiration) },
    ...(result.params.fee_required && isGreaterThan(result.params.fee_required, 0)
      ? [{ label: t('common_fee_required'), value: `${result.params.fee_required} satoshis` }]
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
