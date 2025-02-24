import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewFairminterProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewFairminter({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewFairminterProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Price", value: result.params.price },
    { label: "Quantity by Price", value: result.params.quantity_by_price },
    { label: "Hard Cap", value: result.params.hard_cap },
    ...(result.params.description ? [{ label: "Description", value: result.params.description }] : []),
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
