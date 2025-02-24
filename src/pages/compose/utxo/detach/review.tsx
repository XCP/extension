import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewUtxoDetachProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewUtxoDetach({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
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
      setError={setError}
    />
  );
}
