import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";
import { toBigNumber } from "@/utils/numeric";

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
  const isDivisible = result.params.asset_info.divisible;


  const currentSupply = result.params.asset_info.supply
    ? formatAssetQuantity(result.params.asset_info.supply, isDivisible)
    : "0";
  const issuedQuantity = formatAssetQuantity(result.params.quantity, isDivisible);
  const newTotalSupply = result.params.asset_info.supply
    ? formatAssetQuantity(
        toBigNumber(result.params.asset_info.supply).plus(result.params.quantity).toString(),
        isDivisible
      )
    : issuedQuantity;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Current Supply", value: currentSupply },
    { label: "After Issuance", value: newTotalSupply },
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
