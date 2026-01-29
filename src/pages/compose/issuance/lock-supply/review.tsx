import { ReviewScreen } from "@/components/screens/review-screen";

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
    { label: "Asset", value: result.params.asset },
    { label: "Supply to Lock", value: currentSupply },
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
