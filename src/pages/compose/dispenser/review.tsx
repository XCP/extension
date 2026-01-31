import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { useSettings } from "@/contexts/settings-context";

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
  const { settings } = useSettings();
  const { btc: btcPrice } = useMarketPrices(settings.fiat);

  // Use normalized values from verbose API response
  const escrowQuantity = result.params.escrow_quantity_normalized;
  const giveQuantity = result.params.give_quantity_normalized;

  // Calculate BTC values for USD display
  const perDispenseBtc = fromSatoshis(result.params.mainchainrate, true);
  const bitcoinTotalBtc = (Number(result.params.escrow_quantity) / Number(result.params.give_quantity)) *
                          fromSatoshis(result.params.mainchainrate, true);

  // Format USD values
  const perDispenseUsd = btcPrice !== null
    ? `$${formatAmount({ value: perDispenseBtc * btcPrice, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;
  const bitcoinTotalUsd = btcPrice !== null
    ? `$${formatAmount({ value: bitcoinTotalBtc * btcPrice, minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  const customFields = [
    {
      label: "Escrow Amount",
      value: `${escrowQuantity} ${asset}`,
    },
    {
      label: "Amount per Dispense",
      value: `${giveQuantity} ${asset}`,
    },
    {
      label: "Per Dispense",
      value: `${formatAmount({
        value: perDispenseBtc,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
      rightElement: perDispenseUsd ? <span className="text-gray-500">{perDispenseUsd}</span> : undefined,
    },
    {
      label: "Bitcoin Total",
      value: `${formatAmount({
        value: bitcoinTotalBtc,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
      rightElement: bitcoinTotalUsd ? <span className="text-gray-500">{bitcoinTotalUsd}</span> : undefined,
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
