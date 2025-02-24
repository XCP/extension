import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewSendMpmaProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function ReviewSendMpma({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  setError 
}: ReviewSendMpmaProps) {
  const { result } = apiResponse;

  const formatQuantity = (quantity: number, isDivisible: boolean) =>
    isDivisible
      ? formatAmount({
          value: quantity / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();

  const assets = Object.entries(result.params.asset_quantities).map(([asset, quantity]) => ({
    asset,
    quantity: Number(quantity),
    isDivisible: result.params.asset_info[asset]?.divisible ?? true,
  }));

  const customFields = [
    { label: "To", value: result.params.destination },
    {
      label: "Assets",
      value: assets
        .map((a) => `${formatQuantity(a.quantity, a.isDivisible)} ${a.asset}`)
        .join(", "),
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
