import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewCancel component.
 */
interface ReviewCancelProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for order cancellation transactions.
 * @param {ReviewCancelProps} props - Component props
 * @returns {ReactElement} Review UI for order cancellation transaction
 */
export function ReviewCancel({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewCancelProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Order Hash", value: result.params.offer_hash },
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
