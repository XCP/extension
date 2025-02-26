import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewUtxoAttach component.
 */
interface ReviewUtxoAttachProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for UTXO attach transactions.
 * @param {ReviewUtxoAttachProps} props - Component props
 * @returns {ReactElement} Review UI for UTXO attach transaction
 */
export function ReviewUtxoAttach({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewUtxoAttachProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: "UTXO Transaction ID", value: result.params.txid },
    { label: "UTXO Output Index", value: result.params.vout.toString() },
    { label: "Asset", value: result.params.asset },
    {
      label: "Quantity",
      value: `${formatAmount({
        value: Number(result.params.quantity) / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${result.params.asset}`,
    },
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
