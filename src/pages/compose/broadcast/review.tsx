import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";

interface ReviewBroadcastProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewBroadcast({ apiResponse, onSign, onBack }: ReviewBroadcastProps) {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const customFields = [
    { label: "Message", value: result.params.text },
    ...(result.params.value !== "0" && result.params.value !== 0
      ? [{ label: "Value", value: result.params.value }]
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
