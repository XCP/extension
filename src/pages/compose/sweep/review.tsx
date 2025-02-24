import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewSweepProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewSweep({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewSweepProps) {
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
