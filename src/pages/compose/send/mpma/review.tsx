import type { ReactElement } from "react";
import { normalizeQuantity } from "@/components/domain/tx/tx-action-info";
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

  // `asset_dest_quant_list_normalized` does not exist: compose returns only
  // `asset_dest_quant_list`, in base units, and inject_normalized_quantities adds no entry for it.
  // Reading the absent field meant this screen rendered "No sends" for every multi-recipient send
  // — the review step showed neither recipients nor amounts. Its tests passed because the fixture
  // invented the field.
  //
  // Quantities are therefore normalized here from the raw list, using the divisibility already in
  // the response, the way the single-send review does.
  const transactions = (result.params.asset_dest_quant_list || []).map(
    (item: [string, string, string | number], index: number) => {
      const [asset, destination, quantity] = item;
      return {
        asset,
        destination,
        quantity: normalizeQuantity(quantity, asset, result.params, 'asset'),
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
