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

  // Use normalized quantities from verbose API response (handles divisibility correctly)
  const assetDestQuantListNormalized = result.params.asset_dest_quant_list_normalized || [];

  // Group by transaction for display with normalized quantities
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