import { useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { getAttachEstimateXcpFee } from "@/utils/blockchain/counterparty/compose";

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
        <button
          onClick={onBack}
          className="mt-4 w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Back
        </button>
      </div>
    );
  }
  
  const { result } = apiResponse;
  const [xcpFeeEstimate, setXcpFeeEstimate] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);

  // Fetch XCP fee estimate on mount
  useEffect(() => {
    const fetchFeeEstimate = async () => {
      try {
        const sourceAddress = result.params.source;
        if (sourceAddress) {
          const fee = await getAttachEstimateXcpFee(sourceAddress);
          setXcpFeeEstimate(fee);
        }
      } catch (err) {
        console.error("Failed to fetch XCP fee estimate:", err);
      } finally {
        setFeeLoading(false);
      }
    };

    fetchFeeEstimate();
  }, [result.params.source]);

  const customFields = [
    { label: "Asset", value: result.params.asset || "N/A" },
    {
      label: "Quantity",
      value: result.params.quantity && result.params.asset ? 
        `${formatAssetQuantity(result.params.quantity, true)} ${result.params.asset}` : "N/A",
    },
    {
      label: "XCP Fee",
      value: feeLoading 
        ? "Loading…" 
        : xcpFeeEstimate !== null 
          ? `${formatAmount({
              value: fromSatoshis(xcpFeeEstimate, true),
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })} XCP`
          : "Unable to estimate",
    },
    ...(result.params.destination_vout !== undefined && result.params.destination_vout !== null ? 
      [{ label: "Destination Output", value: String(result.params.destination_vout) }] : []),
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
