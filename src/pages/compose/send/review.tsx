import { ReviewScreen } from "@/components/screens/review-screen";
import type { ReactElement, ReactNode } from "react";

/**
 * Props for the ReviewSend component.
 */
interface ReviewSendProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

/**
 * Displays a review screen for sending transactions.
 * Handles both single sends and MPMA (multi-send) transactions.
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
  let customFields: Array<{ label: string; value: string | number | ReactNode; rightElement?: ReactNode }> = [];

  if (isMPMA) {
    // MPMA transaction - show expandable list of sends
    // Use normalized quantities from verbose API response
    const assetDestQuantListNormalized = result.params.asset_dest_quant_list_normalized || [];
    const assetDestQuantList = result.params.asset_dest_quant_list || [];

    // Build transaction list for display using normalized values
    const transactions = assetDestQuantListNormalized.map((item: any[], index: number) => {
      const [asset, destination, quantity] = item;
      const memo = result.params.memos?.[index];
      return {
        asset,
        destination,
        quantity,
        memo
      };
    });

    // Calculate total from normalized values
    const totalQuantity = assetDestQuantListNormalized.reduce(
      (sum: number, item: any[]) => sum + Number(item[2]), 0
    );
    const asset = assetDestQuantList[0]?.[0] || '';

    // Show expanded list as custom field
    customFields.push({
      label: `Sends (${transactions.length})`,
      value: "",
      rightElement: (
        <div className="space-y-2 max-h-48 overflow-y-auto mt-2 w-full">
          {transactions.map((tx: any, idx: number) => (
            <div key={idx} className="text-xs border-b border-gray-200 pb-1">
              <div className="font-medium">
                {tx.quantity} {tx.asset}
              </div>
              <div className="text-gray-600 truncate" title={tx.destination}>
                → {tx.destination}
              </div>
              {tx.memo && (
                <div className="text-gray-500 truncate">
                  Memo: {tx.memo}
                </div>
              )}
            </div>
          ))}
        </div>
      )
    });

    // Total amount
    customFields.push({
      label: "Total",
      value: `${totalQuantity} ${asset}`,
    });
  } else {
    // Single send transaction - use normalized quantity from verbose API
    const quantityDisplay = result.params.quantity_normalized ?? result.params.quantity;
    customFields = [
      {
        label: "Amount",
        value: `${quantityDisplay} ${result.params.asset}`,
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
