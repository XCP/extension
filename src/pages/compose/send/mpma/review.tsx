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

  // Render the API's normalized quantities (the signed values) rather than
  // re-deriving divisibility client-side, which can diverge from what is signed.
  const transactions = (result.params.asset_dest_quant_list_normalized || []).map(
    (item: any[], index: number) => {
      const [asset, destination, quantity] = item;
      return {
        asset,
        destination,
        quantity,
        memo: result.params.memos?.[index],
      };
    }
  );

  // Build custom fields showing detailed breakdown
  const customFields: Array<{ label: string; value: string | number; rightElement?: React.ReactNode }> = [
    {
      label: "Send",
      value: "",
      rightElement: (
        <div className="space-y-2 max-h-48 overflow-y-auto mt-2 w-full">
          {transactions.length === 0 ? (
            <div className="text-xs text-gray-500">No sends</div>
          ) : (
            transactions.map((tx: { asset: string; destination: string; quantity: string | number; memo?: string }, idx: number) => (
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
            ))
          )}
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
