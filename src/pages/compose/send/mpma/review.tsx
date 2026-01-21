import { type ReactElement, useState, useEffect } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty/api";
import { fromSatoshis } from "@/utils/numeric";

interface ReviewMPMAProps {
  apiResponse: any;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}

interface Transaction {
  asset: string;
  destination: string;
  quantity: string | number;
  quantityNormalized: string;
  memo?: string;
}

export function ReviewMPMA({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: ReviewMPMAProps): ReactElement {
  const { result } = apiResponse;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // The API returns asset_dest_quant_list with [asset, destination, quantity] tuples
  const assetDestQuantList = result.params.asset_dest_quant_list || [];

  useEffect(() => {
    async function normalizeQuantities() {
      if (assetDestQuantList.length === 0) {
        setTransactions([]);
        setIsLoading(false);
        return;
      }

      // Get unique assets
      const assetNames: string[] = assetDestQuantList.map((item: any[]) => String(item[0]));
      const uniqueAssets: string[] = Array.from(new Set<string>(assetNames));

      // Fetch divisibility for each asset (BTC and XCP are known divisible)
      const divisibilityMap: Record<string, boolean> = { BTC: true, XCP: true };

      // Fetch divisibility for unknown assets
      const unknownAssets = uniqueAssets.filter((asset) => !(asset in divisibilityMap));
      await Promise.all(
        unknownAssets.map(async (asset) => {
          try {
            const info = await fetchAssetDetails(asset);
            divisibilityMap[asset] = info?.divisible ?? false;
          } catch {
            divisibilityMap[asset] = false;
          }
        })
      );

      // Build transactions with normalized quantities
      const normalizedTransactions = assetDestQuantList.map((item: any[], index: number) => {
        const [asset, destination, quantity] = item;
        const isDivisible = divisibilityMap[asset];
        const memo = result.params.memos?.[index];

        // Normalize: divide by 10^8 for divisible assets
        const quantityNormalized = isDivisible
          ? fromSatoshis(quantity.toString())
          : quantity.toString();

        return {
          asset,
          destination,
          quantity,
          quantityNormalized,
          memo
        };
      });

      setTransactions(normalizedTransactions);
      setIsLoading(false);
    }

    normalizeQuantities();
  }, [assetDestQuantList, result.params.memos]);

  // Build custom fields showing detailed breakdown
  const customFields: Array<{ label: string; value: string | number; rightElement?: React.ReactNode }> = [
    {
      label: "Send",
      value: "",
      rightElement: (
        <div className="space-y-2 max-h-48 overflow-y-auto mt-2 w-full">
          {isLoading ? (
            <div className="text-xs text-gray-500">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-xs text-gray-500">No sends</div>
          ) : (
            transactions.map((tx, idx) => (
              <div key={idx} className="text-xs border-b pb-1">
                <div className="font-mono">
                  Send #{idx + 1}: {tx.quantityNormalized} {tx.asset}
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
