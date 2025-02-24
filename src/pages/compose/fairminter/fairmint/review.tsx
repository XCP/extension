import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewFairmintProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewFairmint({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewFairmintProps) {
  const { result } = apiResponse;

  const formatQuantity = (quantity: number) =>
    formatAmount({
      value: quantity,
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    });

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Quantity", value: formatQuantity(Number(result.params.quantity)) },
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
