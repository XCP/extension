import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewFairmint component.
 */
interface ReviewFairmintProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for fairmint transactions.
 * @param {ReviewFairmintProps} props - Component props
 * @returns {ReactElement} Review UI for fairmint transaction
 */
export function ReviewFairmint({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
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
      isSigning={isSigning}
    />
  );
}
