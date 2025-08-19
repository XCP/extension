import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
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

  const formatAssetAmount = (value: string | number): string => {
    const numericValue = isDivisible ? Number(value) / 1e8 : Number(value);
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
  const issuedQuantity = formatAssetAmount(result.params.quantity);
  const newTotalSupply = result.params.asset_info.supply
    ? formatAssetAmount(
        toBigNumber(result.params.asset_info.supply).plus(result.params.quantity).toString()
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
