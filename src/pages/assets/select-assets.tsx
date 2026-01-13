
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { FaSearch } from "@/components/icons";
import { FiHelpCircle } from "@/components/icons";
import { TbPinned, TbPinnedFilled } from "@/components/icons";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ReactElement } from "react";

/**
 * Interface for an asset object returned from the search API.
 */
interface Asset {
  symbol: string;
  supply?: string | number;
}

/**
 * Constants for asset selection configuration and navigation paths.
 */
const CONSTANTS = {
  MAX_PINNED_ASSETS: 10,
  SEARCH_API_URL: "https://app.xcp.io/api/v1/simple-search",
  PATHS: {
    INDEX: "/index",
    BALANCE: "/balance",
  } as const,
} as const;

/**
 * SelectAssets component allows users to search, pin, and reorder assets.
 *
 * Features:
 * - Search assets via an external API with debounced input
 * - Pin up to 10 assets with drag-and-drop reordering
 * - Toggle help text visibility
 *
 * @returns {ReactElement} The rendered asset selection UI.
 * @example
 * ```tsx
 * <SelectAssets />
 * ```
 */
export default function SelectAssets(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [pinnedAssets, setPinnedAssets] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localHelpText, setLocalHelpText] = useState<boolean>(true);

  const { setHeaderProps } = useHeader();
  const { activeWallet } = useWallet();
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync help text from settings
  useEffect(() => {
    if (settings) setLocalHelpText(settings.showHelpText);
  }, [settings]);

  // Configure header with dynamic back and help toggle
  useEffect(() => {
    setHeaderProps({
      title: "Search Assets",
      onBack: searchQuery
        ? () => {
            setSearchQuery("");
            setSearchParams({});
          }
        : () => navigate(CONSTANTS.PATHS.INDEX),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: "Toggle help text",
      },
    });
  }, [setHeaderProps, navigate, searchQuery, setSearchParams]);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Debounced asset search
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const debounceTimeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `${CONSTANTS.SEARCH_API_URL}?query=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();
        setSearchResults(data.assets || []);
        setError(null);
      } catch (err) {
        console.error("Error searching assets:", err);
        setSearchResults([]);
        setError("Failed to search assets.");
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);

  // Sync pinned assets from wallet
  useEffect(() => {
    if (settings) setPinnedAssets(settings.pinnedAssets || []);
  }, [settings?.pinnedAssets]);

  /**
   * Handles search input changes and updates URL params.
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query) setSearchParams({ q: query });
    else setSearchParams({});
  };

  /**
   * Adds an asset to the pinned list.
   * @param asset - The asset symbol to pin.
   */
  const handleAddAsset = async (asset: string) => {
    if (!activeWallet) {
      setError("No active wallet selected");
      return;
    }
    if (pinnedAssets.length >= CONSTANTS.MAX_PINNED_ASSETS) {
      setError(`You can only pin up to ${CONSTANTS.MAX_PINNED_ASSETS} assets.`);
      return;
    }
    if (pinnedAssets.includes(asset)) return;

    try {
      const newPinnedAssets = [...pinnedAssets, asset];
      await updateSettings({ pinnedAssets: newPinnedAssets });
      setPinnedAssets(newPinnedAssets);
      setError(null);
    } catch (err) {
      console.error("Error adding asset:", err);
      setError("Failed to add asset.");
    }
  };

  /**
   * Removes an asset from the pinned list.
   * @param asset - The asset symbol to unpin.
   */
  const handleRemoveAsset = async (asset: string) => {
    if (!activeWallet) {
      setError("No active wallet selected");
      return;
    }

    try {
      const newPinnedAssets = pinnedAssets.filter((a) => a !== asset);
      await updateSettings({ pinnedAssets: newPinnedAssets });
      setPinnedAssets(newPinnedAssets);
      setError(null);
    } catch (err) {
      console.error("Error removing asset:", err);
      setError("Failed to remove asset.");
    }
  };

  /**
   * Reorders pinned assets after drag-and-drop.
   * @param items - The reordered items array.
   */
  const handleReorder = async (items: string[]) => {
    if (!activeWallet) return;

    setPinnedAssets(items);
    try {
      await updateSettings({ pinnedAssets: items });
      setError(null);
    } catch (err) {
      console.error("Error updating asset order:", err);
      setError("Failed to reorder assets.");
    }
  };

  const {
    draggedIndex,
    dragOverIndex,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
  } = useDragAndDrop({
    items: pinnedAssets,
    onReorder: handleReorder,
  });

  const shouldShowHelpText = isHelpTextOverride ? !localHelpText : localHelpText;

  /**
   * Sub-component to display an asset with its icon.
   */
  const AssetWithIcon = ({ symbol, description }: { symbol: string; description?: string }) => {
    const imageUrl = `https://app.xcp.io/img/icon/${symbol}`;
    return (
      <Link
        to={`${CONSTANTS.PATHS.BALANCE}/${symbol}`}
        className="flex items-center flex-1 cursor-pointer hover:bg-gray-50"
      >
        <div className="w-8 h-8 flex-shrink-0 mr-3">
          <img src={imageUrl} alt={symbol} className="w-full h-full object-cover" />
        </div>
        <div>
          <div>{symbol}</div>
          {description && <div className="text-sm text-gray-500">{description}</div>}
        </div>
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col" role="main" aria-labelledby="select-assets-title">
      <div className="flex-shrink-0 p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <div className="relative mb-4">
          <input
            ref={searchInputRef}
            type="text"
            className="w-full p-2 pl-10 border rounded-lg"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search assets"
          />
          <FaSearch className="absolute left-3 top-3 text-gray-400" aria-hidden="true" />
        </div>
      </div>
      <div className="flex-1 px-4">
        {!searchQuery ? (
          <div className="h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-2" id="select-assets-title">
              Pinned Assets
            </h3>
            {shouldShowHelpText && (
              <p className="text-sm text-gray-500 mb-4">
                Pin up to {CONSTANTS.MAX_PINNED_ASSETS} assets to the top of your main screen.
              </p>
            )}
            <div className="flex-1 overflow-y-auto mb-4">
              <div className="space-y-2">
                {pinnedAssets.map((asset, index) => {
                  const isDragging = draggedIndex === index;
                  const isDragOver = dragOverIndex === index;

                  return (
                    <div
                      key={asset}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragLeave={handleDragLeave}
                      className={`flex items-center justify-between p-3 bg-white rounded-lg shadow-sm cursor-move transition-all ${
                        isDragging ? "shadow-lg opacity-50" : ""
                      } ${
                        isDragOver ? "border-t-2 border-blue-500" : ""
                      }`}
                    >
                      <AssetWithIcon symbol={asset} />
                      <Button
                        color="gray"
                        onClick={() => handleRemoveAsset(asset)}
                        className="!p-2"
                        aria-label={`Remove ${asset} from pinned`}
                      >
                        <TbPinnedFilled aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold mb-2">Search Results</h3>
            {isSearching ? (
              <div className="text-center py-4">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-4">No results found</div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((asset) => (
                  <div
                    key={asset.symbol}
                    className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm"
                  >
                    <AssetWithIcon symbol={asset.symbol} />
                    <Button
                      color="gray"
                      onClick={() =>
                        pinnedAssets.includes(asset.symbol)
                          ? handleRemoveAsset(asset.symbol)
                          : handleAddAsset(asset.symbol)
                      }
                      className="!p-2"
                      aria-label={
                        pinnedAssets.includes(asset.symbol)
                          ? `Unpin ${asset.symbol}`
                          : `Pin ${asset.symbol}`
                      }
                    >
                      {pinnedAssets.includes(asset.symbol) ? (
                        <TbPinnedFilled aria-hidden="true" />
                      ) : (
                        <TbPinned aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
