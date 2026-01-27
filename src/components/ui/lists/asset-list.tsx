import { useState, useEffect } from "react";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { AssetCard } from "@/components/ui/cards/asset-card";
import { SearchResultCard } from "@/components/ui/cards/search-result-card";
import { useWallet } from "@/contexts/wallet-context";
import { useHeader } from "@/contexts/header-context";
import { fetchOwnedAssets, type OwnedAsset } from "@/utils/blockchain/counterparty/api";
import { Spinner } from "@/components/ui/spinner";
import { useSearchQuery } from "@/hooks/useSearchQuery";

export const AssetList = (): React.ReactElement => {
  const { activeAddress } = useWallet();
  const { cacheOwnedAssets } = useHeader();
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
          // Cache assets for instant display on detail pages
          cacheOwnedAssets(assets);
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
  }, [activeAddress, cacheOwnedAssets]);

  const renderAssetItem = (asset: OwnedAsset) => (
    <AssetCard key={asset.asset} asset={asset} />
  );


  if (isLoading) return <Spinner message="Loading owned assets…" />;

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search assets…"
        name="asset-search"
        className="mb-3"
        showClearButton={true}
        isLoading={isSearching}
      />
      {searchQuery ? (
        isSearching ? (
          <Spinner message="Searching assets…" />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map((asset) => <SearchResultCard key={asset.symbol} symbol={asset.symbol} navigationType="asset" />)
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
