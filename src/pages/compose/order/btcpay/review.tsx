import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewBTCPay component.
 */
interface ReviewBTCPayProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for BTC payment transactions.
 * @param {ReviewBTCPayProps} props - Component props
 * @returns {ReactElement} Review UI for BTC payment transaction
 */
export function ReviewBTCPay({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
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
      isSigning={isSigning}
    />
  );
}
