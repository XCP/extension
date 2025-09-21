import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewUtxoDetach component.
 */
interface ReviewUtxoDetachProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for UTXO detach transactions.
 * @param {ReviewUtxoDetachProps} props - Component props
 * @returns {ReactElement} Review UI for UTXO detach transaction
 */
export function ReviewUtxoDetach({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewUtxoDetachProps) {
  const { result } = apiResponse;


  const customFields = [
    { label: "Source UTXO", value: result.params.sourceUtxo || result.params.utxo || "N/A" },
    ...(result.params.destination ? [{ label: "Destination", value: result.params.destination }] : []),
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
