import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context-object";
import { useSettings } from "@/contexts/settings-context";
import type { ComposeParams } from "@/core/counterparty/compose";
import { formatAmount, formatAsset, formatFiatEstimate } from "@/core/format";
import { divide, fromSatoshis, multiply, toBigNumber } from "@/core/numeric";
import { useMarketPrices } from "@/hooks/useMarketPrices";

import { t } from '@/i18n';

type ReviewDispenserProps = TransactionReviewProps<Pick<ComposeParams, 'asset' | 'asset_longname' | 'escrow_quantity' | 'escrow_quantity_normalized' | 'give_quantity' | 'give_quantity_normalized' | 'mainchainrate'>> & { asset: string };

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

  // Prefer the decoded asset and price; divisibility comes from the independent asset read.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { asset?: string; mainchainrate?: bigint; escrowQuantity?: bigint; giveQuantity?: bigint }
    | undefined;

  // Asset label from the transaction, else the signed params, else the route prop (empty on the
  // in-form asset-select path).
  const displayAsset = formatAsset(decoded?.asset ?? result.params.asset ?? asset, {
    assetInfo: { asset_longname: result.params.asset_longname ?? null },
  });

  const escrowQuantity = result.params.escrow_quantity_normalized;
  const giveQuantity = result.params.give_quantity_normalized;

  const mainchainrate = decoded?.mainchainrate ?? result.params.mainchainrate;
  const escrowForRatio = toBigNumber(
    decoded?.escrowQuantity?.toString() ?? result.params.escrow_quantity
  );
  const giveForRatio = toBigNumber(
    decoded?.giveQuantity?.toString() ?? result.params.give_quantity
  );

  const perDispenseBtc = toBigNumber(fromSatoshis(mainchainrate?.toString() ?? 0));
  // A dispenser giving nothing has no total to quote, rather than a total of zero.
  const dispenseCount = giveForRatio.isGreaterThan(0)
    ? divide(escrowForRatio, giveForRatio)
    : null;
  const bitcoinTotalBtc = dispenseCount === null ? null : multiply(dispenseCount, perDispenseBtc);

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
