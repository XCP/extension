import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";

import { t } from '@/i18n';

type ReviewAddressOptionsProps = TransactionReviewProps<Pick<ComposeParams, 'options' | 'text'>>;

const ADDRESS_OPTION_REQUIRE_MEMO = 1;

const formatOptionsText = (text: string | number | undefined) => {
  if (!text) return "None";
  if (typeof text === "number") {
    return text === ADDRESS_OPTION_REQUIRE_MEMO ? t('address_options_review_require_memo') : String(text);
  }
  const match = text.match(/options (\d+)/);
  if (match) {
    const value = parseInt(match[1]!, 10);
    return value === ADDRESS_OPTION_REQUIRE_MEMO ? t('address_options_review_require_memo') : String(value);
  }
  return String(text);
};

export function ReviewAddressOptions({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning 
}: ReviewAddressOptionsProps) {
  const { result } = apiResponse;

  const customFields = [
    {
      label: t('common_options'),
      value: formatOptionsText(result.params.options || result.params.text),
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
