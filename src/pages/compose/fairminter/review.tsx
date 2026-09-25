import { ReviewScreen } from "@/components/screens/review-screen";
import { isGreaterThan } from "@/core/numeric";

import { t } from '@/i18n';

/**
 * Props for the ReviewFairminter component.
 */
interface ReviewFairminterProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for fairminter creation transactions.
 * @param {ReviewFairminterProps} props - Component props
 * @returns {ReactElement} Review UI for fairminter transaction
 */
export function ReviewFairminter({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewFairminterProps) {
  const { result } = apiResponse;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset },
    { label: t('fairminter_review_lot_price'), value: result.params.lot_price },
    { label: t('fairminter_review_lot_size'), value: result.params.lot_size },
    ...(Number(result.params.max_mint_per_address_normalized ?? 0) > 0
      ? [{ label: t('common_mint_per_address'), value: result.params.max_mint_per_address_normalized }]
      : []),
    { label: t('common_hard_cap'), value: result.params.hard_cap },
    // The three fields that make a pooled launch what it is were composed but never shown here,
    // so the pool terms were signed from a screen that did not mention them. The soft cap decides
    // whether anything is credited at all, and the window decides when.
    ...(isGreaterThan(result.params.pool_quantity_normalized ?? 0, 0)
      ? [
          { label: t('fairminter_review_pool_reserve'), value: String(result.params.pool_quantity_normalized) },
          ...(result.params.lp_asset
            ? [{ label: t('common_lp_asset'), value: String(result.params.lp_asset) }]
            : []),
        ]
      : []),
    ...(isGreaterThan(result.params.soft_cap ?? 0, 0)
      ? [{ label: t('common_soft_cap'), value: String(result.params.soft_cap) }]
      : []),
    ...(Number(result.params.start_block ?? 0) > 0
      ? [
          {
            label: t('fairminter_review_sale_window'),
            value: `${result.params.start_block} → ${result.params.soft_cap_deadline_block ?? "—"}`,
          },
        ]
      : []),
    ...(result.params.description ? [{ label: t('common_description'), value: result.params.description }] : []),
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
