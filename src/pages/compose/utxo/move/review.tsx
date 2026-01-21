import { ReviewScreen } from "@/components/screens/review-screen";

/**
 * Props for the ReviewUtxoMove component.
 */
interface ReviewUtxoMoveProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Displays a review screen for UTXO move transactions.
 */
export function ReviewUtxoMove({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewUtxoMoveProps) {
  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      error={error}
      isSigning={isSigning}
    />
  );
}
