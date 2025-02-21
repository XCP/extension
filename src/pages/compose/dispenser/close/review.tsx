import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewDispenserCloseProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewDispenserClose({ apiResponse, onSign, onBack }: ReviewDispenserCloseProps) {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
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
