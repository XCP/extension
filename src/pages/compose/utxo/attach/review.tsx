import { ReviewScreen, type TransactionReviewProps } from "@/components/screens/review-screen";
import type { ComposeParams } from "@/core/counterparty/compose";

import { t } from '@/i18n';

type ReviewUtxoAttachProps = TransactionReviewProps<Pick<ComposeParams, 'asset' | 'destination_vout' | 'quantity' | 'quantity_normalized'>>;

export function ReviewUtxoAttach({ 
  apiResponse, 
  onSign, 
  onBack,
  error,
  isSigning
}: ReviewUtxoAttachProps) {
  // Handle case where apiResponse is null/undefined (e.g., after an error)
  if (!apiResponse || !apiResponse.result) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{t('attach_review_unable_to_review_transaction_please')}</p>
        </div>
        <button type="button"
          onClick={onBack}
          className="mt-4 w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {t('common_back')}
        </button>
      </div>
    );
  }
  
  const { result } = apiResponse;

  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset || t('common_not_available') },
    {
      label: t('common_quantity'),
      value: result.params.quantity && result.params.asset ?
        `${quantityDisplay} ${result.params.asset}` : t('common_not_available'),
    },
    ...(result.params.destination_vout !== undefined && result.params.destination_vout !== null ?
      [{ label: t('attach_review_destination_output'), value: String(result.params.destination_vout) }] : []),
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
