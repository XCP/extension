import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewDispenserCloseProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewDispenserClose({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewDispenserCloseProps) {
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
