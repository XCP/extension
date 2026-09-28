import { ReviewScreen } from "@/components/screens/review-screen";
import { readCancelledOrder } from "@/core/counterparty/protocolContext";
import { useReviewLookup } from "@/hooks/useReviewLookup";

import { t } from '@/i18n';

/**
 * Props for the ReviewCancel component.
 */
interface ReviewCancelProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for order cancellation transactions.
 * @param {ReviewCancelProps} props - Component props
 * @returns {ReactElement} Review UI for order cancellation transaction
 */
export function ReviewCancel({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewCancelProps) {
  const { result } = apiResponse;
  // The verified request's hash: the bytes were checked to carry exactly this one.
  const offerHash: string | undefined = result.params.offer_hash;
  // A cancel names its order by hash alone. The terms are read from the ledger the way the
  // approval screen reads them (`readCancelledOrder`), so both say which trade is being withdrawn.
  const order = useReviewLookup(offerHash, () => readCancelledOrder(offerHash!));

  const terms = order.status === 'loading'
    ? t('common_loading')
    : order.status === 'ready' && order.value
      ? t('tx_action_give_for', [order.value.giveQuantity, order.value.giveAsset, order.value.getQuantity, order.value.getAsset])
      : t('cancel_review_order_unavailable');

  const customFields = [
    { label: t('tx_action_order'), value: terms },
    { label: t('common_order_hash'), value: offerHash },
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
