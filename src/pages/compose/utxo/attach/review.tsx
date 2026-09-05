import { ReviewScreen } from "@/components/screens/review-screen";

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
          <p className="text-red-700">Unable to review transaction. Please go back and try again.</p>
        </div>
        <button type="button"
          onClick={onBack}
          className="mt-4 w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Back
        </button>
      </div>
    );
  }
  
  const { result } = apiResponse;

  // Use normalized quantity from verbose API response (handles divisibility correctly)
  const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;

  const customFields = [
    { label: "Asset", value: result.params.asset || "N/A" },
    {
      label: "Quantity",
      value: result.params.quantity && result.params.asset ?
        `${quantityDisplay} ${result.params.asset}` : "N/A",
    },
    ...(result.params.destination_vout !== undefined && result.params.destination_vout !== null ?
      [{ label: "Destination Output", value: String(result.params.destination_vout) }] : []),
    ...(result.diesel_mint ? [{
      label: "DIESEL mint",
      value: "Included",
      rightElement: (
        <span className="text-right text-gray-500">
          +{result.diesel_mint.marginal_vbytes} vB
          {' '}(~{result.diesel_mint.estimated_marginal_fee_sats} sat at
          {' '}{result.diesel_mint.fee_rate_sat_vbyte} sat/vB)
          <br />
          {result.diesel_mint.utxo_sats} sat protected wallet return; remains yours
          {result.diesel_mint.rolled_utxo ? <><br />Existing DIESEL rolled forward</> : null}
          {result.diesel_mint.pending_chain_position ? (
            <><br />Unconfirmed chain {result.diesel_mint.pending_chain_position}/25</>
          ) : null}
        </span>
      ),
    }] : []),
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
