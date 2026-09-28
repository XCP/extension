import { ReviewScreen } from "@/components/screens/review-screen";
import { t } from '@/i18n';
import { spentUtxoAssetsText, useSpentUtxoAssets } from "@/pages/compose/utxo/spent-utxo-assets";

/**
 * Props for the ReviewUtxoMove component.
 */
interface ReviewUtxoMoveProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Displays a review screen for UTXO move transactions.
 */
export function ReviewUtxoMove({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewUtxoMoveProps) {
  const { result } = apiResponse;
  // A move carries no message: everything attached to the UTXOs it spends goes to the destination,
  // so the assets on those inputs are what this transaction moves.
  const moving = useSpentUtxoAssets(result.rawtransaction);

  const customFields = [
    { label: t('utxo_move_review_assets_moving'), value: spentUtxoAssetsText(moving) },
    { label: t('tx_action_from_utxo'), value: result.params.sourceUtxo || t('common_not_available') },
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
