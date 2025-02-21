import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";

interface ReviewDestroyProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
}

export function ReviewDestroy({ apiResponse, onSign, onBack }: ReviewDestroyProps) {
  const { error, setError } = useComposer();
  const { result } = apiResponse;
  const asset = result.params.asset;
  const assetDivisible = result.params.asset_info?.divisible ?? true;

  const formatQuantity = (quantity: number) =>
    assetDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();

  const customFields = [
    {
      label: "Amount",
      value: `${formatQuantity(Number(result.params.quantity))} ${asset}`,
    },
    ...(result.params.tag ? [{ label: "Memo", value: result.params.tag }] : []),
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
