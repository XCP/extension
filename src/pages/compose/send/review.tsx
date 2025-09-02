import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAssetQuantity } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Props for the ReviewSend component.
 */
interface ReviewSendProps {
  apiResponse: any; // Consider typing this more strictly based on your API response shape
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean; // Passed from useActionState in Composer
}

/**
 * Displays a review screen for sending transactions.
 * @param {ReviewSendProps} props - Component props
 * @returns {ReactElement} Review UI for send transaction
 */
export function ReviewSend({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewSendProps): ReactElement {
  const { result } = apiResponse;
  const isMPMA = result.name === 'mpma';

  // Build custom fields based on transaction type
  let customFields: Array<{ label: string; value: string | number }> = [];
  
  if (isMPMA) {
    // MPMA transaction - extract details from asset_dest_quant_list
    const assetDestQuantList = result.params.asset_dest_quant_list || [];
    const destinations = assetDestQuantList.map((item: any[]) => item[1]);
    const quantity = assetDestQuantList[0]?.[2] || 0;
    const asset = assetDestQuantList[0]?.[0] || '';
    const isDivisible = result.params.asset_info?.divisible || false;
    const totalQuantity = Number(quantity) * destinations.length;
    
    // Show destinations
    customFields.push({
      label: "Destinations",
      value: `${destinations.length} addresses`
    });
    
    // Amount per address
    customFields.push({
      label: "Amount per address",
      value: `${formatAssetQuantity(Number(quantity), isDivisible)} ${asset}`,
    });
    
    // Total amount
    customFields.push({
      label: "Total",
      value: `${formatAssetQuantity(totalQuantity, isDivisible)} ${asset}`,
    });
    
    // Memo if present
    if (result.params.memos && result.params.memos.length > 0) {
      customFields.push({ label: "Memo", value: String(result.params.memos[0]) });
    }
  } else {
    // Single send transaction
    customFields = [
      {
        label: "Amount",
        value: `${formatAssetQuantity(Number(result.params.quantity), result.params.asset_info.divisible)} ${result.params.asset}`,
      },
      ...(result.params.memo ? [{ label: "Memo", value: String(result.params.memo) }] : []),
    ];
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
