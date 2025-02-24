"use client";

import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { FaSearch, FaTimes } from "react-icons/fa";
import { TbPinned, TbPinnedFilled } from "react-icons/tb";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { Spinner } from "@/components/spinner";

interface Asset {
  symbol: string;
  supply?: string | number;
}

interface SearchListProps {
  onClose: () => void;
  visible: boolean;
}

export const SearchList = ({ onClose, visible }: SearchListProps): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedAssets, setPinnedAssets] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHelpText, setShowHelpText] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState(false);

  const { activeWallet, updatePinnedAssets } = useWallet();
  const { settings } = useSettings();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setShowHelpText(settings.showHelpText);
    }
  }, [settings]);

  useEffect(() => {
    if (activeWallet) {
      setPinnedAssets(activeWallet.pinnedAssetBalances || []);
    }
  }, [activeWallet?.id, activeWallet?.pinnedAssetBalances]);

  useEffect(() => {
    if (visible) {
      searchInputRef.current?.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;

    const debounceTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://app.xcp.io/api/v1/simple-search?query=${encodeURIComponent(searchQuery)}`
        );
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        if (!isCancelled) {
          setSearchResults(data.assets || []);
        }
      } catch (err) {
        console.error("Error searching assets:", err);
        if (!isCancelled) {
          setSearchResults([]);
          setError("Failed to load search results.");
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }, 500);

    return () => {
      clearTimeout(debounceTimeout);
      isCancelled = true;
    };
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query) {
      onClose();
    }
  };

  const handleAddAsset = async (asset: string) => {
    if (!activeWallet) {
      setError("No active wallet selected.");
      return;
    }

    if (pinnedAssets.length >= 10) {
      setError("You can only pin up to 10 assets.");
      return;
    }

    if (pinnedAssets.includes(asset)) return;

    try {
      const newPinnedAssets = [...pinnedAssets, asset];
      await updatePinnedAssets(newPinnedAssets);
      setPinnedAssets(newPinnedAssets);
    } catch (err) {
      console.error("Error adding asset:", err);
      setError("Failed to pin asset.");
    }
  };

  const handleRemoveAsset = async (asset: string) => {
    if (!activeWallet) {
      setError("No active wallet selected.");
      return;
    }

    try {
      const newPinnedAssets = pinnedAssets.filter((a) => a !== asset);
      await updatePinnedAssets(newPinnedAssets);
      setPinnedAssets(newPinnedAssets);
    } catch (err) {
      console.error("Error removing asset:", err);
      setError("Failed to unpin asset.");
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !activeWallet) return;

    const items = Array.from(pinnedAssets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setPinnedAssets(items);
    try {
      await updatePinnedAssets(items);
    } catch (err) {
      console.error("Error updating asset order:", err);
      setError("Failed to reorder assets.");
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  };

  interface SearchItemProps {
    asset: Asset;
  }

  const SearchItemComponent = ({ asset }: SearchItemProps): JSX.Element => {
    const imageUrl = `https://app.xcp.io/img/icon/${asset.symbol}`;
    const isPinned = pinnedAssets.includes(asset.symbol);

    return (
      <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:bg-gray-50">
        <Link to={`/balance/${asset.symbol}`} className="flex items-center flex-1">
          <div className="w-8 h-8 flex-shrink-0">
            <img src={imageUrl} alt={asset.symbol} className="w-full h-full object-cover" />
          </div>
          <div className="ml-2">
            <div className="font-medium text-sm text-gray-900">{asset.symbol}</div>
          </div>
        </Link>
        <Button
          color="gray"
          onClick={() => (isPinned ? handleRemoveAsset(asset.symbol) : handleAddAsset(asset.symbol))}
          className="!p-1"
        >
          {isPinned ? <TbPinnedFilled /> : <TbPinned />}
        </Button>
      </div>
    );
  };

  interface PinnedItemProps {
    symbol: string;
  }

  const PinnedItemComponent = ({ symbol }: PinnedItemProps): JSX.Element => {
    const imageUrl = `https://app.xcp.io/img/icon/${symbol}`;

    return (
      <Draggable key={symbol} draggableId={symbol} index={pinnedAssets.indexOf(symbol)}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:bg-gray-50 ${
              snapshot.isDragging ? "shadow-lg" : ""
            }`}
          >
            <Link to={`/balance/${symbol}`} className="flex items-center flex-1">
              <div className="w-8 h-8 flex-shrink-0">
                <img src={imageUrl} alt={symbol} className="w-full h-full object-cover" />
              </div>
              <div className="ml-2">
                <div className="font-medium text-sm text-gray-900">{symbol}</div>
              </div>
            </Link>
            <Button color="gray" onClick={() => handleRemoveAsset(symbol)} className="!p-1">
              <TbPinnedFilled />
            </Button>
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <div className="relative mb-2">
          <input
            ref={searchInputRef}
            type="text"
            className="w-full p-2 pl-8 pr-8 border rounded-lg bg-white"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={handleSearchChange}
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
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {isSearching ? (
          <Spinner message="Searching assets..." />
        ) : !searchQuery ? (
          <div className="h-full flex flex-col">
            {pinnedAssets.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mb-2">Pinned Assets</h3>
                {showHelpText && (
                  <p className="text-sm text-gray-500 mb-2">
                    Pin up to 10 assets to the top of your main screen.
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
            )}
          </div>
        ) : (
          <>
            {searchResults.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No results found</div>
            ) : (
              searchResults.map((asset) => (
                <SearchItemComponent key={asset.symbol} asset={asset} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};
