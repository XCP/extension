import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewUtxoAttachProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewUtxoAttach({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
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
      setError={setError}
    />
  );
}
