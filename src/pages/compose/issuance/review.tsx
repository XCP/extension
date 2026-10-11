import { FaLock, FaLockOpen } from "@/components/icons";
import { ReviewScreen } from "@/components/screens/review-screen";
import { t } from '@/i18n';
import type { IssuanceReviewProps } from "@/pages/compose/issuance/review-types";

export function ReviewIssuance({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: IssuanceReviewProps) {
  const { result } = apiResponse;

  const isTruthy = (value: unknown): boolean => {
    if (value === "false") return false;
    return (["true", "1", 1, true] as readonly unknown[]).includes(value);
  };

  const isLocked = isTruthy(result.params.lock);

  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    {
      label: t('issuance_review_issuance'),
      value: quantityDisplay,
      rightElement: isLocked ? (
        <FaLock className="size-3 text-gray-500" aria-label={t('issuance_review_supply_locked')} />
      ) : (
        <FaLockOpen className="size-3 text-gray-500" aria-label={t('issuance_review_supply_unlocked')} />
      ),
    },
    ...(result.params.description ? [{ label: t('common_description'), value: result.params.description }] : []),
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
