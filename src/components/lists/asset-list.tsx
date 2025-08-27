import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AssetMenu } from "@/components/menus/asset-menu";
import { useWallet } from "@/contexts/wallet-context";
import { fetchOwnedAssets, type OwnedAsset } from "@/utils/blockchain/counterparty/api";
import { formatAsset, formatAmount } from "@/utils/format";
import { Spinner } from "@/components/spinner";
import { FaSearch, FaTimes } from "react-icons/fa";
import { useSearchQuery } from "@/hooks/useSearchQuery";

export const AssetList = (): React.ReactElement => {
  const { activeAddress } = useWallet();
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, searchResults, isSearching } = useSearchQuery();

  useEffect(() => {
    if (!activeAddress?.address) {
      setOwnedAssets([]);
      return;
    }

    let isCancelled = false;

    const loadOwnedAssets = async () => {
      setIsLoading(true);
      try {
        const assets = await fetchOwnedAssets(activeAddress.address);
        if (!isCancelled) {
          setOwnedAssets(assets);
        }
      } catch (error) {
        console.error("Error fetching owned assets:", error);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadOwnedAssets();

    return () => {
      isCancelled = true;
    };
  }, [activeAddress]);

  const renderAssetItem = (asset: OwnedAsset) => {
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
            alt={formatAsset(asset.asset, { assetInfo: { asset_longname: asset.asset_longname } })}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="ml-3 flex-grow">
          <div className="font-medium text-sm text-gray-900">
            {formatAsset(asset.asset, { assetInfo: { asset_longname: asset.asset_longname }, shorten: true })}
          </div>
          <div className="text-sm text-gray-500">
            Supply: {formatAmount({ value: Number(asset.supply_normalized), minimumFractionDigits: 8, maximumFractionDigits: 8 })}
          </div>
        </div>
        <div className="absolute top-2 right-2">
          <AssetMenu ownedAsset={asset} />
        </div>
      </div>
    );
  };

  const renderSearchResult = (asset: { symbol: string }) => {
    const imageUrl = `https://app.xcp.io/img/icon/${asset.symbol}`;
    return (
      <div
        key={asset.symbol}
        className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
        onClick={() => navigate(`/asset/${asset.symbol}`)}
      >
        <div className="w-12 h-12 flex-shrink-0">
          <img src={imageUrl} alt={asset.symbol} className="w-full h-full object-cover" />
        </div>
        <div className="ml-3 flex-grow">
          <div className="font-medium text-sm text-gray-900">{asset.symbol}</div>
        </div>
      </div>
    );
  };

  if (isLoading) return <Spinner message="Loading owned assets..." />;

  return (
    <div className="space-y-2">
      <div className="relative mb-3">
        <input
          type="text"
          id="asset-search"
          name="asset-search"
          className="w-full p-2 pl-8 pr-8 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <FaSearch className="absolute left-3 top-3 text-gray-400" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <FaTimes />
          </button>
        )}
      </div>
      {searchQuery ? (
        isSearching ? (
          <Spinner message="Searching assets..." />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map(renderSearchResult)
        )
      ) : ownedAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center">
          <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
            <div className="text-gray-600 text-lg font-medium mb-2">No Assets Owned</div>
            <div className="text-gray-500 text-sm">This address hasn't issued any Counterparty assets.</div>
          </div>
        </div>
      ) : (
        ownedAssets.map(renderAssetItem)
      )}
    </div>
  );
};
