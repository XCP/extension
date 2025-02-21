import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

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
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewIssuanceTransferOwnership({
  apiResponse,
  onSign,
  onBack,
}: ReviewIssuanceTransferOwnershipProps) {
  const { error, setError } = useComposer();
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
