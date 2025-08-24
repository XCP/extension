"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaSearch, FaTimes } from "react-icons/fa";
import { FiHelpCircle } from "react-icons/fi";
import { TbPinned, TbPinnedFilled } from "react-icons/tb";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/button";
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

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !pinnedAssets.length) return;
    const items = Array.from(pinnedAssets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setPinnedAssets(items);
    try {
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: items });
    } catch (err) {
      console.error("Error updating asset order:", err);
      setError("Failed to reorder assets.");
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  const SearchItemComponent = ({ asset }: { asset: { symbol: string } }): ReactElement => {
    const imageUrl = `https://app.xcp.io/img/icon/${asset.symbol}`;
    const isPinned = pinnedAssets.includes(asset.symbol);
    const [isAnimating, setIsAnimating] = useState(false);

    const handlePinToggle = async (e: React.MouseEvent) => {
      // Prevent event bubbling to maintain focus
      e.preventDefault();
      e.stopPropagation();
      
      setIsAnimating(true);
      if (isPinned) {
        await handleRemoveAsset(asset.symbol);
      } else {
        await handleAddAsset(asset.symbol);
      }
      // Reset animation after a short delay
      setTimeout(() => setIsAnimating(false), 300);
    };

    return (
      <div className="flex items-center justify-between p-3 rounded-lg shadow-sm bg-white hover:bg-gray-50">
        <div className="flex items-center flex-1">
          <div className="w-8 h-8 flex-shrink-0">
            <img src={imageUrl} alt={asset.symbol} className="w-full h-full object-cover" />
          </div>
          <div className="ml-2">
            <div className="font-medium text-sm text-gray-900">{asset.symbol}</div>
          </div>
        </div>
        <Button
          color={isPinned ? "blue" : "gray"}
          onClick={handlePinToggle}
          className={`!p-1 transition-transform ${isAnimating ? 'scale-125' : ''}`}
          aria-label={isPinned ? "Unpin asset" : "Pin asset"}
        >
          {isPinned ? <TbPinnedFilled className="text-white" /> : <TbPinned />}
        </Button>
      </div>
    );
  };

  const PinnedItemComponent = ({ symbol }: { symbol: string }): ReactElement => {
    const imageUrl = `https://app.xcp.io/img/icon/${symbol}`;

    return (
      <Draggable key={symbol} draggableId={symbol} index={pinnedAssets.indexOf(symbol)}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:bg-gray-50 cursor-move ${
              snapshot.isDragging ? "shadow-lg" : ""
            }`}
          >
            <div className="flex items-center flex-1">
              <div className="w-8 h-8 flex-shrink-0">
                <img src={imageUrl} alt={symbol} className="w-full h-full object-cover" />
              </div>
              <div className="ml-2">
                <div className="font-medium text-sm text-gray-900">{symbol}</div>
              </div>
            </div>
            <Button
              color="blue"
              onClick={(e) => {
                // Prevent event bubbling to maintain focus
                e.preventDefault();
                e.stopPropagation();
                handleRemoveAsset(symbol);
              }}
              className="!p-1"
              aria-label="Unpin asset"
            >
              <TbPinnedFilled className="text-white" />
            </Button>
          </div>
        )}
      </Draggable>
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
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="pinnedAssets" type="PINNED_ASSETS">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {pinnedAssets.map((symbol) => (
                      <PinnedItemComponent key={symbol} symbol={symbol} />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
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
        
        <div className="relative mb-4">
          <input
            ref={searchInputRef}
            type="text"
            className="w-full p-2 pl-8 pr-8 border rounded-lg bg-white"
            placeholder="Search assets to pin..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <FaTimes />
            </button>
          )}
        </div>
        
        <div className="overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 