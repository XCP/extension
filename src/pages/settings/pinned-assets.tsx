import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { PinnableAssetCard } from "@/components/domain/asset/pinnable-asset-card";
import { FiHelpCircle } from "@/components/icons";
import { ErrorAlert } from "@/components/ui/error-alert";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { t } from '@/i18n';
import { analytics } from "@/platform/fathom";

/**
 * Constants for navigation paths.
 */
const PATHS = {
  BACK: -1,
  HELP_URL: "https://youtube.com", // Placeholder for now
} as const;

/**
 * PinnedAssetsSettings component manages which assets are pinned to the top of the main screen.
 *
 * Features:
 * - Search for assets to pin
 * - Pin/unpin assets
 * - Reorder pinned assets via up/down arrows
 * - Limit of 10 pinned assets
 *
 * @returns {ReactElement} The rendered pinned assets settings UI.
 */
export default function PinnedAssetsPage(): ReactElement {
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
      title: t('common_pinned_assets'),
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => window.open(PATHS.HELP_URL, "_blank"),
        ariaLabel: t('common_help'),
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
      setError(t('settings_pinned_assets_you_can_only_pin_up'));
      return;
    }
    if (pinnedAssets.includes(asset)) return;

    try {
      const newPinnedAssets = [...pinnedAssets, asset];
      setPinnedAssets(newPinnedAssets);
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: newPinnedAssets });
      analytics.track('asset_pinned');
      // Don't clear search or reset UI state - maintain the search experience
    } catch (err) {
      console.error("Error adding asset:", err);
      setError(t('settings_pinned_assets_failed_to_pin_asset'));
    }
  }, [pinnedAssets, setError, updateSettings]);

  const handleRemoveAsset = useCallback(async (asset: string) => {
    if (!pinnedAssets.includes(asset)) return;
    try {
      const newPinnedAssets = pinnedAssets.filter((a) => a !== asset);
      setPinnedAssets(newPinnedAssets);
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: newPinnedAssets });
      analytics.track('asset_unpinned');
      // Don't clear search or reset UI state - maintain the search experience
    } catch (err) {
      console.error("Error removing asset:", err);
      setError(t('settings_pinned_assets_failed_to_unpin_asset'));
    }
  }, [pinnedAssets, setError, updateSettings]);

  const handleReorder = async (items: string[]) => {
    setPinnedAssets(items);
    try {
      // Use the settings context directly to ensure proper update
      await updateSettings({ pinnedAssets: items });
    } catch (err) {
      console.error("Error updating asset order:", err);
      setError(t('common_failed_to_reorder_assets'));
    }
  };

  const moveAsset = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    // Boundary checks
    if (newIndex < 0 || newIndex >= pinnedAssets.length) return;

    const newPinnedAssets = [...pinnedAssets];
    // Swap the elements
    [newPinnedAssets[index], newPinnedAssets[newIndex]] =
    [newPinnedAssets[newIndex]!, newPinnedAssets[index]!];

    await handleReorder(newPinnedAssets);
  };



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
    const isFirst = index === 0;
    const isLast = index === pinnedAssets.length - 1;

    return (
      <PinnableAssetCard
        symbol={symbol}
        isPinned={true}
        onPinToggle={handleRemoveAsset}
        showArrows={true}
        onMoveUp={!isFirst ? () => moveAsset(index, 'up') : undefined}
        onMoveDown={!isLast ? () => moveAsset(index, 'down') : undefined}
      />
    );
  };

  // Render content based on search state
  const renderContent = () => {
    // Always show search results if there's a search query, regardless of other state
    if (searchQuery) {
      return (
        <div className="h-full flex flex-col">
          <h2 className="text-lg font-semibold mb-2">{t('common_search_results')}</h2>
          {isSearching ? (
            <Spinner message={t('common_searching_assets')} />
          ) : searchResults.length === 0 ? (
            <div className="text-center py-4 text-gray-500">{t('common_no_results_found')}</div>
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
            <h2 className="text-lg font-semibold mb-2">{t('settings_pinned_assets_pinned')}</h2>
            {showHelpText && (
              <p className="text-sm text-gray-500 mb-2">
                {t('settings_pinned_assets_pin_up_to_10_assets')}
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
            {t('settings_pinned_assets_no_pinned_assets_search_for')}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="flex flex-col h-full" aria-labelledby="pinned-assets-title">
      <h2 id="pinned-assets-title" className="sr-only">
        {t('settings_pinned_assets_pinned_assets_settings')}
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
          placeholder={t('settings_pinned_assets_search_assets_to_pin')}
          className="mb-4"
          showClearButton={true}
          isLoading={isSearching}
        />

        <div className="overflow-y-auto">
          {renderContent()}
        </div>
      </div>

    </section>
  );
} 