import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewCancelProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewCancel({ apiResponse, onSign, onBack }: ReviewCancelProps) {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    { label: "Offer Hash", value: result.params.offer_hash },
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
