import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewFairminter component.
 */
interface ReviewFairminterProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for fairminter creation transactions.
 * @param {ReviewFairminterProps} props - Component props
 * @returns {ReactElement} Review UI for fairminter transaction
 */
export function ReviewFairminter({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewFairminterProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "Asset", value: result.params.asset },
    { label: "Lot Price", value: result.params.lot_price },
    { label: "Lot Size", value: result.params.lot_size },
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
      isSigning={isSigning}
    />
  );
}
