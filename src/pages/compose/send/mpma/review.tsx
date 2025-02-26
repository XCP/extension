import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewSendMpma component.
 */
interface ReviewSendMpmaProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for multi-asset send transactions.
 * @param {ReviewSendMpmaProps} props - Component props
 * @returns {ReactElement} Review UI for multi-asset send transaction
 */
export function ReviewSendMpma({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
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
      isSigning={isSigning}
    />
  );
}
