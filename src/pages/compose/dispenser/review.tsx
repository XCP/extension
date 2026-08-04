import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context-object";
import { formatAmount, formatAsset } from "@/utils/format";
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

  // A dispenser has no local packer, so its params were an unverified echo. The asset and the
  // BTC price per dispense are stated by the transaction itself, so they are read from the decoded
  // message: a composer that opened a dispenser on a different asset, or at a different price,
  // cannot then display the requested one (ADR-019). Quantities keep using the response's
  // normalized strings, since converting the decoded base units needs the asset's divisibility —
  // a ledger fact rather than a property of this transaction.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { asset?: string; mainchainrate?: bigint; escrowQuantity?: bigint; giveQuantity?: bigint }
    | undefined;

  // Asset label from the transaction, else the signed params, else the route prop (empty on the
  // in-form asset-select path).
  const displayAsset = formatAsset(decoded?.asset ?? result.params.asset ?? asset, {
    assetInfo: { asset_longname: result.params.asset_longname ?? null },
  });

  // Use normalized values from verbose API response
  const escrowQuantity = result.params.escrow_quantity_normalized;
  const giveQuantity = result.params.give_quantity_normalized;

  // Calculate BTC values for USD display
  const mainchainrate = decoded?.mainchainrate !== undefined
    ? Number(decoded.mainchainrate)
    : result.params.mainchainrate;
  const escrowForRatio = decoded?.escrowQuantity !== undefined
    ? Number(decoded.escrowQuantity)
    : Number(result.params.escrow_quantity);
  const giveForRatio = decoded?.giveQuantity !== undefined
    ? Number(decoded.giveQuantity)
    : Number(result.params.give_quantity);

  const perDispenseBtc = fromSatoshis(mainchainrate, true);
  const bitcoinTotalBtc = (escrowForRatio / giveForRatio) * fromSatoshis(mainchainrate, true);

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
      value: `${escrowQuantity} ${displayAsset}`,
    },
    {
      label: "Amount per Dispense",
      value: `${giveQuantity} ${displayAsset}`,
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
