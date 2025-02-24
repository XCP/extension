import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewBroadcastProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewBroadcast({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewBroadcastProps) {
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
