import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";

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

  const formatAssetAmount = (value: string | number): string => {
    const numericValue = isDivisible ? fromSatoshis(value, true) : Number(value);
    return formatAmount({
      value: numericValue,
      minimumFractionDigits: isDivisible ? 8 : 0,
      maximumFractionDigits: isDivisible ? 8 : 0,
      useGrouping: true,
    });
  };

  const currentSupply = result.params.asset_info.supply
    ? formatAssetAmount(result.params.asset_info.supply)
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
