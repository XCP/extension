import { sweepIncludes } from "@/components/domain/tx/tx-action-info";
import { ReviewScreen } from "@/components/screens/review-screen";
import { parseMoreOutputs } from "@/core/format";

import { t } from '@/i18n';

/**
 * Props for the ReviewSweep component.
 */
interface ReviewSweepProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for sweep transactions.
 * @param {ReviewSweepProps} props - Component props
 * @returns {ReactElement} Review UI for sweep transaction
 */
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
