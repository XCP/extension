import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { AssetMenu } from "@/components/menus/asset-menu";
import { useWallet } from "@/contexts/wallet-context";
import { fetchOwnedAssets, type OwnedAsset } from "@/utils/blockchain/counterparty/api";
import { formatAsset, formatAmount } from "@/utils/format";

interface AssetListProps {
  visible: boolean;
  scrollContainer: HTMLDivElement | null;
}

export const AssetList = ({ visible, scrollContainer }: AssetListProps) => {
  const { activeAddress } = useWallet();
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!activeAddress?.address) return;
    let isCancelled = false;

    async function loadOwnedAssets() {
      setIsLoadingAssets(true);
      try {
        const assets = await fetchOwnedAssets(activeAddress.address);
        if (!isCancelled) {
          setOwnedAssets(assets);
        }
      } catch (error) {
        console.error("Error fetching owned assets:", error);
      } finally {
        if (!isCancelled) {
          setIsLoadingAssets(false);
        }
      }
    }

    loadOwnedAssets();
    return () => {
      isCancelled = true;
    };
  }, [activeAddress]);

  // Even if not visible, we keep the component mounted so its data persists.
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
