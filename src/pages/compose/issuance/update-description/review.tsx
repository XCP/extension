import { ReviewScreen } from "@/components/screens/review-screen";

import { t } from '@/i18n';

interface ReviewIssuanceUpdateDescriptionProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewIssuanceUpdateDescription({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewIssuanceUpdateDescriptionProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    { label: t('common_description'), value: result.params.description },
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
