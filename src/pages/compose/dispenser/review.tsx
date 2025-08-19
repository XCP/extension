import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

/**
 * Props for the ReviewDispenser component.
 */
interface ReviewDispenserProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
  asset: string;
}

/**
 * Displays a review screen for dispenser creation transactions.
 * @param {ReviewDispenserProps} props - Component props
 * @returns {ReactElement} Review UI for dispenser transaction
 */
export function ReviewDispenser({ 
  apiResponse, 
  onSign, 
  onBack, 
  error,
  isSigning,
  asset 
}: ReviewDispenserProps) {
  const { result } = apiResponse;
  const assetDivisible = result.params.extra?.assetDivisible ?? true;

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
      label: "Escrow Total",
      value: `${formatQuantity(Number(result.params.escrow_quantity))} ${asset}`,
    },
    {
      label: "Give Amount",
      value: `${formatQuantity(Number(result.params.give_quantity))} ${asset}`,
    },
    {
      label: "Per Dispense",
      value: `${formatAmount({
        value: Number(result.params.mainchainrate) / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
    {
      label: "Bitcoin Total",
      value: `${formatAmount({
        value: (Number(result.params.escrow_quantity) / Number(result.params.give_quantity)) * 
               (Number(result.params.mainchainrate) / 1e8),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
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
