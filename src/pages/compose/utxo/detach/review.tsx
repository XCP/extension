import { ReviewScreen } from "@/components/screens/review-screen";

import { t } from '@/i18n';
import { spentUtxoAssetsText, useSpentUtxoAssets } from "@/pages/compose/utxo/spent-utxo-assets";

/**
 * Props for the ReviewUtxoDetach component.
 */
interface ReviewUtxoDetachProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for UTXO detach transactions.
 * @param {ReviewUtxoDetachProps} props - Component props
 * @returns {ReactElement} Review UI for UTXO detach transaction
 */
export function ReviewUtxoDetach({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewUtxoDetachProps) {
  const { result } = apiResponse;
  // A detach message carries only its destination; what comes back is whatever the spent UTXO
  // holds, which the approval screen lists as "Detached" and this page now does too.
  const detached = useSpentUtxoAssets(result.rawtransaction);

  const customFields = [
    { label: t('tx_action_detached'), value: spentUtxoAssetsText(detached) },
    { label: t('detach_review_source_utxo'), value: result.params.sourceUtxo || result.params.utxo || t('common_not_available') },
    ...(result.params.destination ? [{ label: t('common_destination'), value: result.params.destination }] : []),
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
