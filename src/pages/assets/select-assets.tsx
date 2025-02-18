"use client";

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch } from 'react-icons/fa';
import { FiHelpCircle } from 'react-icons/fi';
import { TbPinned, TbPinnedFilled } from 'react-icons/tb';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';

interface Asset {
  symbol: string;
  supply?: string | number;
}

function SelectAssets() {
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedAssets, setPinnedAssets] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localHelpText, setLocalHelpText] = useState<boolean>(true);

  const { setHeaderProps } = useHeader();
  const { activeWallet, updatePinnedAssets } = useWallet();
  const { settings } = useSettings();
  const navigate = useNavigate();

  // Initialize help text flag from settings context.
  useEffect(() => {
    if (settings) {
      setLocalHelpText(settings.showHelpText);
    }
  }, [settings]);

  // Set the header.
  useEffect(() => {
    setHeaderProps({
      title: 'Manage Assets',
      onBack: searchQuery ? () => setSearchQuery('') : () => navigate('/index'),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: 'Toggle help text',
      },
    });
  }, [setHeaderProps, navigate, searchQuery]);

  // Debounced asset search.
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
          `https://app.xcp.io/api/v1/simple-search?query=${encodeURIComponent(
            searchQuery
          )}`
        );
        const data = await response.json();
        setSearchResults(data.assets || []);
      } catch (err) {
        console.error('Error searching assets:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);

  // Initialize pinned assets from the active wallet.
  useEffect(() => {
    if (activeWallet && activeWallet.pinnedAssetBalances) {
      setPinnedAssets(activeWallet.pinnedAssetBalances);
    }
  }, [activeWallet]);

  // Determine whether to show the help text.
  const shouldShowHelpText = isHelpTextOverride ? !localHelpText : localHelpText;

  const handleAddAsset = async (asset: string) => {
    if (!activeWallet) {
      setError('No active wallet selected');
      return;
    }

    if (pinnedAssets.length >= 10) {
      setError(
        'You can only pin up to 10 assets. Please remove some assets before adding more.'
      );
      return;
    }

    if (!pinnedAssets.includes(asset)) {
      try {
        const newPinnedAssets = [...pinnedAssets, asset];
        await updatePinnedAssets(newPinnedAssets);
        setPinnedAssets(newPinnedAssets);
      } catch (err) {
        console.error('Error adding asset:', err);
        setError('Failed to add asset. Please try again.');
      }
    }
  };

  const handleRemoveAsset = async (asset: string) => {
    if (!activeWallet) {
      setError('No active wallet selected');
      return;
    }

    try {
      const newPinnedAssets = pinnedAssets.filter((a) => a !== asset);
      await updatePinnedAssets(newPinnedAssets);
      setPinnedAssets(newPinnedAssets);
    } catch (err) {
      console.error('Error removing asset:', err);
      setError('Failed to remove asset. Please try again.');
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
      console.error('Error updating asset order:', err);
      setError('Failed to reorder assets.');
    }
  };

  // A simple sub-component for displaying an asset icon and details.
  const AssetWithIcon = ({ symbol, description }: { symbol: string; description?: string }) => {
    const imageUrl = `https://app.xcp.io/img/icon/${symbol}`;
    return (
      <div className="flex items-center">
        <div className="w-8 h-8 flex-shrink-0 mr-3">
          <img src={imageUrl} alt={symbol} className="w-full h-full object-cover" />
        </div>
        <div>
          <div>{symbol}</div>
          {description && <div className="text-sm text-gray-500">{description}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <div className="relative mb-4">
          <input
            type="text"
            className="w-full p-2 pl-10 border rounded-lg"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
        </div>
      </div>

      <div className="flex-1 px-4">
        {!searchQuery ? (
          <div className="h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Pinned Assets</h3>
            {shouldShowHelpText && (
              <p className="text-sm text-gray-500 mb-4">
                Pin up to 10 assets to the top of your main screen, useful for surfacing balances in large wallets.
              </p>
            )}
            <div className="flex-1 overflow-y-auto">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="pinnedAssets" type="PINNED_ASSETS">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {pinnedAssets.map((asset, index) => (
                        <Draggable key={asset} draggableId={asset} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`flex items-center justify-between p-3 bg-white rounded-lg shadow-sm ${
                                snapshot.isDragging ? 'shadow-lg' : ''
                              }`}
                            >
                              <AssetWithIcon symbol={asset} />
                              <Button color="gray" onClick={() => handleRemoveAsset(asset)} className="!p-2">
                                <TbPinnedFilled />
                              </Button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
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
                  <div key={asset.symbol} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                    <AssetWithIcon symbol={asset.symbol} />
                    <Button
                      color="gray"
                      onClick={() =>
                        pinnedAssets.includes(asset.symbol)
                          ? handleRemoveAsset(asset.symbol)
                          : handleAddAsset(asset.symbol)
                      }
                      className="!p-2"
                    >
                      {pinnedAssets.includes(asset.symbol) ? <TbPinnedFilled /> : <TbPinned />}
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

export default SelectAssets;
