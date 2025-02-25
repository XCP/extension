import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewIssuanceUpdateDescriptionProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewIssuanceUpdateDescription({
  apiResponse,
  onSign,
  onBack,
  error,
  setError
}: ReviewIssuanceUpdateDescriptionProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Description", value: result.params.description },
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
