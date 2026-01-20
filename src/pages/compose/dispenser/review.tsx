import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";

/**
 * Props for the ReviewDispenser component.
 */
interface ReviewDispenserProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
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

  // Use normalized values from verbose API response
  const escrowQuantity = result.params.escrow_quantity_normalized;
  const giveQuantity = result.params.give_quantity_normalized;

  const customFields = [
    {
      label: "Escrow Total",
      value: `${escrowQuantity} ${asset}`,
    },
    {
      label: "Give Amount",
      value: `${giveQuantity} ${asset}`,
    },
    {
      label: "Per Dispense",
      value: `${formatAmount({
        value: fromSatoshis(result.params.mainchainrate, true),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
    {
      label: "Bitcoin Total",
      value: `${formatAmount({
        value: (Number(result.params.escrow_quantity) / Number(result.params.give_quantity)) *
               fromSatoshis(result.params.mainchainrate, true),
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
