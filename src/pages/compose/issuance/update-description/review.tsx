import { ReviewScreen } from "@/components/screens/review-screen";
import { t } from '@/i18n';
import type { IssuanceReviewProps } from "@/pages/compose/issuance/review-types";

export function ReviewIssuanceUpdateDescription({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: IssuanceReviewProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    { label: t('common_description'), value: result.params.description },
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
