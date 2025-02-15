import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { formatAsset, formatAmount } from "@/utils/format";
import { AssetMenu } from "@/components/menus/asset-menu";
import { useWallet } from "@/contexts/wallet-context";

export interface OwnedAsset {
  asset: string;
  asset_longname: string | null;
  supply_normalized: string;
  description: string;
  locked: boolean;
}

interface AssetListProps {
  enabled?: boolean;
}

export const AssetList: React.FC<AssetListProps> = ({ enabled = true }) => {
  const { activeAddress } = useWallet();
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    
    async function loadOwnedAssets() {
      if (!activeAddress) return;
      setIsLoadingAssets(true);
      try {
        const response = await fetch(
          `https://api.counterparty.io:4000/v2/addresses/${activeAddress.address}/assets/owned?verbose=true`
        );
        const data = await response.json();
        setOwnedAssets(data.result);
      } catch {
        // handle error if needed
      } finally {
        setIsLoadingAssets(false);
      }
    }
    
    loadOwnedAssets();
  }, [activeAddress, enabled]);

  if (!enabled) return null;

  if (isLoadingAssets) {
    return (
      <div className="flex justify-center items-center h-full">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }
  if (ownedAssets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center">
        <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
          <div className="text-gray-600 text-lg font-medium mb-2">
            No Assets Owned
          </div>
          <div className="text-gray-500 text-sm">
            This address hasn't issued any Counterparty assets.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {ownedAssets.map((asset) => {
        const imageUrl = `https://app.xcp.io/img/icon/${asset.asset}`;
        return (
          <div
            key={asset.asset}
            className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
            onClick={() => navigate(`/asset/${asset.asset}`)}
          >
            <div className="w-12 h-12 flex-shrink-0">
              <img
                src={imageUrl}
                alt={formatAsset(asset.asset, {
                  assetInfo: { asset_longname: asset.asset_longname },
                })}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="ml-3 flex-grow">
              <div className="font-medium text-sm text-gray-900">
                {formatAsset(asset.asset, {
                  assetInfo: { asset_longname: asset.asset_longname },
                  shorten: true,
                })}
              </div>
              <div className="text-sm text-gray-500">
                Supply:{" "}
                {formatAmount({
                  value: Number(asset.supply_normalized),
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })}
              </div>
            </div>
            <div className="absolute top-2 right-2">
              <AssetMenu ownedAsset={asset} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
