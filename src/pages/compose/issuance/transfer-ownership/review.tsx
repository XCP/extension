import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewIssuanceTransferOwnershipProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewIssuanceTransferOwnership({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewIssuanceTransferOwnershipProps): React.ReactElement {
  const { result } = apiResponse;

  const customFields = [
    { label: "To", value: result.params.transfer_destination },
    { label: "Asset", value: result.params.asset },
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
