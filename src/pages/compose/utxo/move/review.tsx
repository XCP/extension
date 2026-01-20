import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewUtxoMove component.
 */
interface ReviewUtxoMoveProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for UTXO move transactions.
 * @param {ReviewUtxoMoveProps} props - Component props
 * @returns {ReactElement} Review UI for UTXO move transaction
 */
export function ReviewUtxoMove({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewUtxoMoveProps) {
  const { result } = apiResponse;

  // For UTXO transactions, the source is the UTXO (shown in From field already)
  // So we don't need to duplicate it here
  const customFields = [
    { label: "Destination", value: result.params.destination || "N/A" },
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
