import { ReviewScreen } from "@/components/screens/review-screen";
import { t } from '@/i18n';
import type { IssuanceReviewProps } from "@/pages/compose/issuance/review-types";

export function ReviewIssuanceLockSupply({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: IssuanceReviewProps) {
  const { result } = apiResponse;

  // Use normalized supply from verbose API response (handles divisibility correctly)
  const currentSupply = result.params.asset_info?.supply_normalized ?? "0";

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    { label: t('lock_supply_review_supply_to_lock'), value: currentSupply },
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
