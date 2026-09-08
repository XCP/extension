import { FaLock, FaLockOpen } from "@/components/icons";
import { ReviewScreen } from "@/components/screens/review-screen";

import { t } from '@/i18n';

/**
 * Props for the ReviewIssuance component.
 */
interface ReviewIssuanceProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for asset issuance transactions.
 * @param {ReviewIssuanceProps} props - Component props
 * @returns {ReactElement} Review UI for issuance transaction
 */
export function ReviewIssuance({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewIssuanceProps) {
  const { result } = apiResponse;

  const isTruthy = (value: any): boolean => {
    if (value === "false") return false;
    return ["true", "1", 1, true].includes(value);
  };

  const isLocked = isTruthy(result.params.lock);

  // Use normalized quantity from verbose API response (handles divisibility correctly)
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
