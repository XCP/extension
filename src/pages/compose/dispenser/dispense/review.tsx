import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewDispense component.
 */
interface ReviewDispenseProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for dispense transactions.
 * @param {ReviewDispenseProps} props - Component props
 * @returns {ReactElement} Review UI for dispense transaction
 */
export function ReviewDispense({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning,
}: ReviewDispenseProps) {
  const { result } = apiResponse || {};
  
  // Calculate BTC amount from the API response using formatAmount utility
  const btcAmount = result?.params?.quantity 
    ? `${formatAmount({
        value: Number(result.params.quantity) / 1e8,
        maximumFractionDigits: 8,
        minimumFractionDigits: 8
      })} BTC`
    : "Amount not available";

  const customFields = [
    { label: "Amount", value: btcAmount },
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
