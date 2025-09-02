import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";

interface ReviewIssuanceResetSupplyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewIssuanceResetSupply({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewIssuanceResetSupplyProps) {
  const { result } = apiResponse;
  const isDivisible = result.params.asset_info.divisible;


  const currentSupply = result.params.asset_info.supply
    ? formatAssetQuantity(result.params.asset_info.supply, isDivisible)
    : "0";

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Current Supply", value: currentSupply },
    { label: "Action", value: "Reset Supply" },
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
