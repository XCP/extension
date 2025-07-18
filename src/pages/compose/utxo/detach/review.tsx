import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

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

  const formatQuantity = (quantity: number, isDivisible: boolean) =>
    isDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();

  const customFields = [
    { label: "UTXO", value: result.params.utxo },
    {
      label: "Asset",
      value: `${formatQuantity(Number(result.params.quantity), result.params.asset_info?.divisible ?? true)} ${result.params.asset}`,
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
