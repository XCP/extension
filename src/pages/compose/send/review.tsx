import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";

interface ReviewSendProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewSend({ apiResponse, onSign, onBack }: ReviewSendProps) {
  const { error, setError } = useComposer();
  const { result } = apiResponse;

  const formatQuantity = (quantity: number, isDivisible: boolean) =>
    isDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      :quantity.toString();

  const customFields = [
    { label: "To", value: result.params.destination },
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
