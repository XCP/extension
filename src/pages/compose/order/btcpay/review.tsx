import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import { useComposerOptional } from "@/contexts/composer-context-object";
import type { ComposeParams } from "@/core/counterparty/compose";

import { t } from '@/i18n';

type ReviewBTCPayProps = TransactionReviewProps<Pick<ComposeParams, 'order_match_id'>>;

export function ReviewBTCPay({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewBTCPayProps) {
  const { result } = apiResponse;
  // Which order match is being settled is the whole content of a BTCPay, and it is the one field
  // the transaction itself states. Reading it from the decoded message rather than from the
  // response's echo means a composer that settled a different match cannot display as the one
  // that was asked for (see `unpack/verify.ts`). BTCPay has no local packer, so this echo was unverified.
  const decoded = useComposerOptional()?.state.decodedMessage?.data as
    | { orderMatchId?: string }
    | undefined;

  const customFields = [
    { label: t('common_order_match_id'), value: decoded?.orderMatchId ?? result.params.order_match_id },
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
