import { ReviewScreen } from "@/components/screens/review-screen";

import { t } from '@/i18n';

/**
 * Props for the ReviewIssuanceLockSupply component.
 */
interface ReviewIssuanceLockSupplyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Displays a review screen for asset supply locking transactions.
 * @param {ReviewIssuanceLockSupplyProps} props - Component props
 * @returns {ReactElement} Review UI for supply locking transaction
 */
export function ReviewIssuanceLockSupply({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewIssuanceLockSupplyProps) {
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
