import { ReviewScreen } from "@/components/screens/review-screen";

import { t } from '@/i18n';

interface ReviewLockDescriptionProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewLockDescription({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewLockDescriptionProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    {
      label: t('lock_description_review_action'),
      value: t('common_lock_description'),
      className: "text-red-600 font-medium"
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