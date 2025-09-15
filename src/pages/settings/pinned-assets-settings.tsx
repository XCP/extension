"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { Button } from "@/components/button";
import { SearchInput } from "@/components/inputs/search-input";
import { PinnableAssetCard } from "@/components/cards/pinnable-asset-card";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: -1,
    HELP_URL: "https://youtube.com", // Placeholder for now
  } as const,
};

/**
 * PinnedAssetsSettings component manages which assets are pinned to the top of the main screen.
 *
 * Features:
 * - Search for assets to pin
 * - Pin/unpin assets
 * - Reorder pinned assets via drag and drop
 * - Limit of 10 pinned assets
 *
 * @returns {ReactElement} The rendered pinned assets settings UI.
 */
export default function PinnedAssetsSettings(): ReactElement {
  const [pinnedAssets, setPinnedAssets] = useState<string[]>([]);
  const { searchQuery, setSearchQuery, searchResults, isSearching, error, setError } = useSearchQuery();
  const { settings, updateSettings } = useSettings();
  const [showHelpText, setShowHelpText] = useState<boolean>(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  // Configure header with help button
  useEffect(() => {
    setHeaderProps({
      title: "Pinned Assets",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => window.open(CONSTANTS.PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps, navigate]);

  // Initialize state from settings
  useEffect(() => {
    if (settings) {
      setShowHelpText(settings.showHelpText);
      if (settings.pinnedAssets) {
        setPinnedAssets([...settings.pinnedAssets]);
      }
    }
  }, [settings]);

  // Focus search input on initial load
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Maintain focus on search input after pinning/unpinning if search is active
  useEffect(() => {
    if (searchQuery && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [pinnedAssets, searchQuery]);

  const handleAddAsset = useCallback(async (asset: string) => {
    if (pinnedAssets.length >= 10) {
      setError("You can only pin up to 10 assets.");
      return;
    }
    if (pinnedAssets.includes(asset)) return;

    try {
      const newPinnedAssets = [...pinnedAssets, asset];
      setPinnedAssets(newPinnedAssets);
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: newPinnedAssets });
      // Don't clear search or reset UI state - maintain the search experience
    } catch (err) {
      console.error("Error adding asset:", err);
      setError("Failed to pin asset.");
    }
  }, [pinnedAssets, setError, updateSettings]);

  const handleRemoveAsset = useCallback(async (asset: string) => {
    if (!pinnedAssets.includes(asset)) return;
    try {
      const newPinnedAssets = pinnedAssets.filter((a) => a !== asset);
      setPinnedAssets(newPinnedAssets);
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: newPinnedAssets });
      // Don't clear search or reset UI state - maintain the search experience
    } catch (err) {
      console.error("Error removing asset:", err);
      setError("Failed to unpin asset.");
    }
  }, [pinnedAssets, setError, updateSettings]);

  const handleReorder = async (items: string[]) => {
    setPinnedAssets(items);
    try {
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: items });
    } catch (err) {
      console.error("Error updating asset order:", err);
      setError("Failed to reorder assets.");
    }
  };

  const {
    draggedIndex,
    dragOverIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handleDragLeave,
  } = useDragAndDrop({
    items: pinnedAssets,
    onReorder: handleReorder,
  });


  const SearchItemComponent = ({ asset }: { asset: { symbol: string } }): ReactElement => {
    const isPinned = pinnedAssets.includes(asset.symbol);

    const handlePinToggle = async (symbol: string) => {
      if (isPinned) {
        await handleRemoveAsset(symbol);
      } else {
        await handleAddAsset(symbol);
      }
    };

    return (
      <PinnableAssetCard
        symbol={asset.symbol}
        isPinned={isPinned}
        onPinToggle={handlePinToggle}
      />
    );
  };

  const PinnedItemComponent = ({ symbol, index }: { symbol: string; index: number }): ReactElement => {
    const isDragging = draggedIndex === index;
    const isDragOver = dragOverIndex === index;

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, index)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDrop={(e) => handleDrop(e, index)}
        onDragEnd={handleDragEnd}
        onDragLeave={handleDragLeave}
        className={`cursor-move transition-all ${
          isDragging ? "opacity-50" : ""
        } ${
          isDragOver ? "border-t-2 border-blue-500" : ""
        }`}
      >
        <PinnableAssetCard
          symbol={symbol}
          isPinned={true}
          isDragging={isDragging}
          onPinToggle={handleRemoveAsset}
        />
      </div>
    );
  };

  // Render content based on search state
  const renderContent = () => {
    // Always show search results if there's a search query, regardless of other state
    if (searchQuery) {
      return (
        <div className="h-full flex flex-col">
          <h3 className="text-lg font-semibold mb-2">Search Results</h3>
          {isSearching ? (
            <Spinner message="Searching assets..." />
          ) : searchResults.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No results found</div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((asset) => (
                <SearchItemComponent key={asset.symbol} asset={asset} />
              ))}
            </div>
          )}
        </div>
      );
    }
    
    // If no search query, show the default view with pinned assets
    return (
      <div className="h-full flex flex-col">
        {pinnedAssets.length > 0 ? (
          <>
            <h3 className="text-lg font-semibold mb-2">Pinned</h3>
            {showHelpText && (
              <p className="text-sm text-gray-500 mb-2">
                Pin up to 10 assets to the top of your main screen. Drag to reorder.
              </p>
            )}
            <div className="space-y-2">
              {pinnedAssets.map((symbol, index) => (
                <PinnedItemComponent key={symbol} symbol={symbol} index={index} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-gray-500">
            No pinned assets. Search for assets to pin them.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="pinned-assets-title">
      <h2 id="pinned-assets-title" className="sr-only">
        Pinned Assets Settings
      </h2>
      <div className="p-4">
        {error && (
          <div className="mb-4">
            <ErrorAlert message={error} onClose={() => setError(null)} />
          </div>
        )}
        
        <SearchInput
          ref={searchInputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search assets to pin..."
          className="mb-4"
          showClearButton={true}
          isLoading={isSearching}
        />
        
        <div className="overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 