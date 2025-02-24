import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewBTCPayProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewBTCPay({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewBTCPayProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Order Match ID", value: result.params.order_match_id },
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
