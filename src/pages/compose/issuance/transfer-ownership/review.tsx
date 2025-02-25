import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewIssuanceTransferOwnershipProps {
  apiResponse: {
    result: {
      params: {
        source: string;
        transfer_destination: string;
        asset: string;
      };
      btc_fee: number;
    };
  };
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewIssuanceTransferOwnership({
  apiResponse,
  onSign,
  onBack,
  error,
  setError
}: ReviewIssuanceTransferOwnershipProps) {
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
      setError={setError}
    />
  );
}
