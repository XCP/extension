import type { ReactElement } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import type { ApiResponse } from "@/core/counterparty/compose";

import { t } from '@/i18n';

/**
 * Props for the ReviewDispenserClose component.
 */
interface ReviewDispenserCloseProps {
  apiResponse: ApiResponse;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Review screen for dispenser close transactions.
 */
export function ReviewDispenserClose({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewDispenserCloseProps): ReactElement {
  const { result } = apiResponse;

  // Use type assertion for the specific dispenser close params
  const params = result.params as {
    asset: string;
    open_address?: string;
    give_remaining_normalized?: string;
  };

  const customFields = [
    { label: t('common_asset'), value: params.asset },
    ...(params.open_address ? [{ label: t('common_dispenser'), value: params.open_address }] : []),
    ...(params.give_remaining_normalized ? [{ label: t('close_review_escrow_returned'), value: `${params.give_remaining_normalized} ${params.asset}` }] : []),
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
