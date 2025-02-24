import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";

interface ReviewDispenserProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  setError: (error: string | null) => void;
  asset: string;
}

export function ReviewDispenser({ 
  apiResponse, 
  onSign, 
  onBack, 
  error,
  setError,
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
      setError={setError}
    />
  );
}
