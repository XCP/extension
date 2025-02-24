import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewCancelProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewCancel({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewCancelProps) {
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
