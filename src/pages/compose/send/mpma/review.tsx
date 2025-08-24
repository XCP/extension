import React, { type ReactElement, useEffect, useState } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";
import { formatAmount } from "@/utils/format";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty";

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
  const [assetInfoMap, setAssetInfoMap] = useState<{ [key: string]: { divisible: boolean } }>({});
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  
  // Parse the asset_dest_quant_list to show individual sends
  const assetDestQuantList = result.params.asset_dest_quant_list || [];
  
  // Get unique assets to fetch info for
  useEffect(() => {
    const fetchAssetInfo = async () => {
      const uniqueAssets = [...new Set(assetDestQuantList.map(([asset]: any[]) => asset))] as string[];
      const infoMap: { [key: string]: { divisible: boolean } } = {};
      
      // BTC is always divisible
      infoMap['BTC'] = { divisible: true };
      
      // Fetch info for each unique asset
      await Promise.all(
        uniqueAssets.map(async (asset) => {
          if (asset === 'BTC') return;
          
          try {
            const assetInfo = await fetchAssetDetails(asset);
            infoMap[asset] = { divisible: assetInfo?.divisible ?? true };
          } catch (e) {
            // Default to divisible if we can't fetch info
            // XCP is always divisible
            infoMap[asset] = { divisible: asset === 'XCP' ? true : true };
          }
        })
      );
      
      setAssetInfoMap(infoMap);
      setIsLoadingAssets(false);
    };
    
    fetchAssetInfo();
  }, [assetDestQuantList]);
  
  // Group by transaction for display with normalized quantities
  const transactions = assetDestQuantList.map((item: any[], index: number) => {
    const [asset, destination, quantity] = item;
    const isDivisible = assetInfoMap[asset]?.divisible ?? true;
    const memo = result.params.memos?.[index];
    
    // For divisible assets, ensure we show 8 decimal places
    const formattedQuantity = isDivisible 
      ? formatAmount({
          value: Number(quantity) / 1e8,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })
      : quantity.toString();
    
    return {
      asset,
      destination,
      quantity: formattedQuantity,
      memo
    };
  });
  
  // Build custom fields showing detailed breakdown
  const customFields: Array<{ label: string; value: string | number; rightElement?: React.ReactNode }> = [
    {
      label: "Send",
      value: "",
      rightElement: isLoadingAssets ? (
      <div className="text-xs text-gray-500 mt-2">Loading asset information...</div>
    ) : (
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
  }];

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