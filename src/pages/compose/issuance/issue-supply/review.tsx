import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/core/format";
import { toBigNumber } from "@/core/numeric";

import { t } from '@/i18n';

interface ReviewIssuanceIssueSupplyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewIssuanceIssueSupply({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewIssuanceIssueSupplyProps) {
  const { result } = apiResponse;

  // Use normalized values from verbose API response (handles divisibility correctly)
  const currentSupply = result.params.asset_info?.supply_normalized ?? "0";
  const issuedQuantity = result.params.quantity_normalized ?? result.params.quantity;

  // Calculate new total supply from normalized values
  const newTotalSupply = formatAmount({
    // Both are supplies, and a supply is what overflows a double first.
    value: toBigNumber(currentSupply).plus(toBigNumber(issuedQuantity)),
    minimumFractionDigits: 0,
  });

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    { label: t('issue_supply_review_current_supply'), value: currentSupply },
    { label: t('issue_supply_review_after_issuance'), value: newTotalSupply },
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
