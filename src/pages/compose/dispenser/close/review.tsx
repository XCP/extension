import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewDispenserClose component.
 */
interface ReviewDispenserCloseProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for dispenser close transactions.
 * @param {ReviewDispenserCloseProps} props - Component props
 * @returns {ReactElement} Review UI for dispenser close transaction
 */
export function ReviewDispenserClose({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
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
      isSigning={isSigning}
    />
  );
}
