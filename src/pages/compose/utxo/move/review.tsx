import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewUtxoMoveProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewUtxoMove({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewUtxoMoveProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "UTXO", value: result.params.utxo },
    { label: "Destination", value: result.params.destination },
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
