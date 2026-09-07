import { ReviewScreen } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context-object";
import { useSettings } from "@/contexts/settings-context";
import { formatAmount, formatAsset, formatFiatEstimate } from "@/core/format";
import { divide, fromSatoshis, multiply, toBigNumber } from "@/core/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";

import { t } from '@/i18n';

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

  // Calculate BTC values for fiat estimate
  const mainchainrate = decoded?.mainchainrate ?? result.params.mainchainrate;
  const escrowForRatio = toBigNumber(
    decoded?.escrowQuantity ?? result.params.escrow_quantity
  );
  const giveForRatio = toBigNumber(
    decoded?.giveQuantity ?? result.params.give_quantity
  );

  const perDispenseBtc = toBigNumber(fromSatoshis(mainchainrate));
  // A dispenser giving nothing has no total to quote, rather than a total of zero.
  const dispenseCount = giveForRatio.isGreaterThan(0)
    ? divide(escrowForRatio, giveForRatio)
    : null;
  const bitcoinTotalBtc = dispenseCount === null ? null : multiply(dispenseCount, perDispenseBtc);

  // Format current fiat estimates
  const perDispenseFiat = btcPrice !== null
    ? formatFiatEstimate(multiply(perDispenseBtc, btcPrice), settings.fiat)
    : null;
  const bitcoinTotalFiat = btcPrice !== null && bitcoinTotalBtc !== null
    ? formatFiatEstimate(multiply(bitcoinTotalBtc, btcPrice), settings.fiat)
    : null;

  const customFields = [
    {
      label: t('common_escrow_amount'),
      value: `${escrowQuantity} ${displayAsset}`,
    },
    {
      label: t('common_amount_per_dispense'),
      value: `${giveQuantity} ${displayAsset}`,
    },
    {
      label: t('dispenser_review_per_dispense'),
      value: `${formatAmount({
        value: perDispenseBtc,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
      rightElement: perDispenseFiat ? <span className="text-gray-500">{perDispenseFiat}</span> : undefined,
    },
    {
      label: t('dispenser_review_bitcoin_total'),
      value: `${formatAmount({
        value: bitcoinTotalBtc,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
      rightElement: bitcoinTotalFiat ? <span className="text-gray-500">{bitcoinTotalFiat}</span> : undefined,
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
