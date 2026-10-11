import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import { useSettings } from "@/contexts/settings-context";
import type { ComposeParams } from "@/core/counterparty/compose";

import { t } from '@/i18n';

type ReviewBroadcastProps = TransactionReviewProps<Pick<ComposeParams, 'fee_fraction' | 'text' | 'value'>>;

export function ReviewBroadcast({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewBroadcastProps) {
  const { result } = apiResponse;
  const { settings } = useSettings();
  const showAdvancedOptions = settings?.enableAdvancedBroadcasts ?? false;

  const customFields: Array<{ label: string; value: string | number | undefined }> = [
    { label: t('common_message'), value: result.params.text },
  ];

  if (showAdvancedOptions) {
    customFields.push({ label: t('common_value'), value: result.params.value });
    customFields.push({ label: t('common_fee_fraction'), value: result.params.fee_fraction });
  }

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
