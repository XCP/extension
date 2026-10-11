import { sweepIncludes } from "@/components/domain/tx/tx-action-info";
import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";
import { parseMoreOutputs } from "@/core/format";

import { t } from '@/i18n';

type ReviewSweepProps = TransactionReviewProps<Pick<ComposeParams, 'destination' | 'flags' | 'memo' | 'more_outputs'>>;

export function ReviewSweep({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewSweepProps) {
  const { result } = apiResponse;
  const moreOutput = parseMoreOutputs(result.params.more_outputs);
  // The field is `flags` (form, verified params, Core). Reading `flag` left this row out, so a sweep
  // that hands over asset ownership showed only its destination.
  const includes = sweepIncludes(result.params.flags);

  const customFields = [
    { label: t('common_destination'), value: result.params.destination },
    ...(includes ? [{ label: t('tx_action_includes'), value: includes }] : []),
    ...(moreOutput
      ? [{ label: t('sweep_review_additional_btc_output'), value: t('sweep_review_btc_to', [String(moreOutput.btc), String(moreOutput.destination)]) }]
      : []),
    ...(result.params.memo ? [{ label: t('common_memo'), value: result.params.memo }] : []),
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
