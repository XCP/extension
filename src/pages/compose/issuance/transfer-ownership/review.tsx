import { ReviewScreen } from "@/components/screens/review-screen";
import { t } from '@/i18n';
import type { IssuanceReviewProps } from "@/pages/compose/issuance/review-types";

export function ReviewIssuanceTransferOwnership({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: IssuanceReviewProps): React.ReactElement {
  const { result } = apiResponse;

  const customFields = [
    { label: t('transfer_ownership_review_to'), value: result.params.transfer_destination },
    { label: t('common_asset'), value: result.params.asset },
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
