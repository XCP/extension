import { composedMessageFields } from "@/components/domain/tx/tx-action-info";
import { ReviewScreen } from "@/components/screens/review-screen";
import { readAssetSupply } from "@/core/counterparty/protocolContext";
import { useReviewLookup } from "@/hooks/useReviewLookup";

import { t } from '@/i18n';

interface ReviewDestroyProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewDestroy({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning
}: ReviewDestroyProps) {
  const { result } = apiResponse;
  const asset = result.params.asset;

  // Use normalized quantity from verbose API response (handles divisibility correctly)
  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  // An amount destroyed has no scale without the supply it comes out of. The supply is read the way
  // the approval screen reads it, and the rows are the approval's own (supply before and after, and
  // the share destroyed), computed from the verified quantity at the verified divisibility.
  const supply = useReviewLookup(asset, () => readAssetSupply(asset));
  const supplyFields = supply.status === 'ready' && supply.value
    ? composedMessageFields('destroy', { asset, quantity: result.params.quantity },
      { assetSupply: supply.value }, { asset_info: result.params.asset_info })
      .filter((field) => field.value)
      .map((field) => ({ label: field.label, value: field.value }))
    : [{
      label: t('tx_action_supply_before'),
      value: supply.status === 'loading' ? t('common_loading') : t('destroy_review_supply_unavailable'),
    }];

  const customFields = [
    {
      label: t('common_amount'),
      value: `${quantityDisplay} ${asset}`,
    },
    ...supplyFields,
    ...(result.params.tag ? [{ label: t('common_memo'), value: result.params.tag }] : []),
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
