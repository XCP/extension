import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewSendProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewSend({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewSendProps) {
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
    {
      label: "Amount",
      value: `${formatQuantity(Number(result.params.quantity), result.params.asset_info.divisible)} ${result.params.asset}`,
    },
    ...(result.params.memo ? [{ label: "Memo", value: result.params.memo }] : []),
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
