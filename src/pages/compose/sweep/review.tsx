import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewSweepProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewSweep({ apiResponse, onSign, onBack }: ReviewSweepProps) {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    { label: "Destination", value: result.params.destination },
    ...(result.params.memo ? [{ label: "Memo", value: result.params.memo }] : []),
    ...(result.params.flag !== undefined
      ? [{ label: "Flag", value: result.params.flag.toString() }]
      : []),
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
