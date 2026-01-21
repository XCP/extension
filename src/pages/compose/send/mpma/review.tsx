import { type ReactElement } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";

interface ReviewMPMAProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

export function ReviewMPMA({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewMPMAProps): ReactElement {
  const { result } = apiResponse;

  // Use asset_dest_quant_list from API response - try normalized first, fall back to regular
  // The verbose API returns asset_dest_quant_list with [asset, destination, quantity] tuples
  const assetDestQuantList = result.params.asset_dest_quant_list_normalized ||
                             result.params.asset_dest_quant_list || [];

  // Group by transaction for display
  const transactions = assetDestQuantList.map((item: any[], index: number) => {
    const [asset, destination, quantity] = item;
    const memo = result.params.memos?.[index];

    return {
      asset,
      destination,
      quantity,
      memo
    };
  });
  
  // Build custom fields showing detailed breakdown
  const customFields: Array<{ label: string; value: string | number; rightElement?: React.ReactNode }> = [
    {
      label: "Send",
      value: "",
      rightElement: (
        <div className="space-y-2 max-h-48 overflow-y-auto mt-2 w-full">
          {transactions.map((tx: any, idx: number) => (
            <div key={idx} className="text-xs border-b pb-1">
              <div className="font-mono">
                Send #{idx + 1}: {tx.quantity} {tx.asset}
              </div>
              <div className="text-gray-600 truncate">
                to {tx.destination}
              </div>
              {tx.memo && (
                <div className="text-gray-500">
                  Memo: {tx.memo}
                </div>
              )}
            </div>
          ))}
        </div>
      )
    }
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