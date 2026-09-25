import { ReviewScreen } from "@/components/screens/review-screen";

import { t } from '@/i18n';

/**
 * Props for the ReviewUtxoAttach component.
 */
interface ReviewUtxoAttachProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for UTXO attach transactions.
 * @param {ReviewUtxoAttachProps} props - Component props
 * @returns {ReactElement} Review UI for UTXO attach transaction
 */
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

  // Use normalized quantity from verbose API response (handles divisibility correctly)
  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const customFields = [
    { label: t('common_asset'), value: result.params.asset || "N/A" },
    {
      label: t('common_quantity'),
      value: result.params.quantity && result.params.asset ?
        `${quantityDisplay} ${result.params.asset}` : "N/A",
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
