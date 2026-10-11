import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";

import { t } from '@/i18n';

type ReviewDividendProps = TransactionReviewProps<Pick<ComposeParams, 'asset' | 'dividend_asset' | 'quantity_per_unit_normalized'>>;

export function ReviewDividend({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewDividendProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    {
      label: t('common_dividend'),
      value: `${result.params.quantity_per_unit_normalized} ${result.params.dividend_asset}`,
    },
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
