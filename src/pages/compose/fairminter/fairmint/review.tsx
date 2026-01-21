import { ReviewScreen } from "@/components/screens/review-screen";

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

  // Use normalized quantity from verbose API response (handles divisibility correctly)
  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Quantity", value: quantityDisplay },
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
