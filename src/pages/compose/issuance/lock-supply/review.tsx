import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";

/**
 * Props for the ReviewIssuanceLockSupply component.
 */
interface ReviewIssuanceLockSupplyProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
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
  const isDivisible = result.params.asset_info.divisible;


  const currentSupply = result.params.asset_info.supply
    ? formatAssetQuantity(result.params.asset_info.supply, isDivisible)
    : "0";

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
