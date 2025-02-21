import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposer } from "@/contexts/composer-context";
import { formatAmount } from "@/utils/format";

interface ReviewDispenserProps {
  apiResponse: any;
  onSign: () => Promise<void>;
  onBack: () => void;
  asset: string;
}

export function ReviewDispenser({ apiResponse, onSign, onBack, asset }: ReviewDispenserProps) {
  const { error, setError } = useComposer();
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
      label: "Dispenser Escrow",
      value: `${formatQuantity(Number(result.params.escrow_quantity))} ${asset}`,
    },
    {
      label: "Dispense Amount",
      value: `${formatQuantity(Number(result.params.give_quantity))} ${asset}`,
    },
    {
      label: "BTC Per Dispense",
      value: `${formatAmount({
        value: Number(result.params.mainchainrate) / 1e8,
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
