import { ReviewScreen } from "@/components/screens/review-screen";

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
  const newTotalSupply = (
    Number(currentSupply) + Number(issuedQuantity)
  ).toString();

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
