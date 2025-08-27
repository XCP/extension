import { useState, useEffect } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { FiChevronDown, FiCheck } from "react-icons/fi";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";

interface Asset {
  asset: string;
  symbol: string;
  description: string;
  supply: number | string;
}

interface AssetSelectInputProps {
  selectedAsset: string;
  onChange: (asset: string) => void;
  label: string;
  shouldShowHelpText?: boolean;
  description?: string;
  required?: boolean;
}

export function AssetSelectInput({
  selectedAsset,
  onChange,
  label,
  shouldShowHelpText,
  description,
  required = false,
}: AssetSelectInputProps) {
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { activeWallet } = useWallet();
  const { settings } = useSettings();

  useEffect(() => {
    const searchAssets = async () => {
      if (query.length < 2) {
        if (isInitialLoad && settings?.pinnedAssets) {
          const pinnedAssetsList = settings.pinnedAssets.map((asset: string) => ({
            asset,
            symbol: asset,
            description: `${asset} Token`,
            supply: 0,
          }));
          setAssets(pinnedAssetsList);
        } else {
          setAssets([]);
        }
        return;
      }
      setIsInitialLoad(false);
      try {
        const response = await fetch(
          `https://app.xcp.io/api/v1/search?type=assets&query=${query}`
        );
        const data = await response.json();
        setAssets(data.assets);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      }
    };

    const debounceTimeout = setTimeout(searchAssets, 300);
    return () => clearTimeout(debounceTimeout);
  }, [query, isInitialLoad, settings?.pinnedAssets]);

  const handleComboboxButtonClick = () => {
    if (query.length < 2 && settings?.pinnedAssets) {
      const pinnedAssetsList = settings.pinnedAssets.map((asset: string) => ({
        asset,
        symbol: asset,
        description: `${asset} Token`,
        supply: 0,
      }));
      setAssets(pinnedAssetsList);
    }
  };

  function AssetIcon({ asset }: { asset: string }) {
    return (
      <img
        src={`https://app.xcp.io/img/icon/${asset}`}
        alt={`${asset} icon`}
        className="w-5 h-5 rounded-full"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  const handleAssetChange = (asset: string) => {
    onChange(asset);
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
  };

  return (
    <div className="relative">
      <Combobox value={selectedAsset} onChange={handleAssetChange}>
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500">*</span>}
          </label>
          <div className="relative mt-1">
            <div className="relative w-full cursor-default overflow-hidden rounded-md bg-gray-50 text-left focus:outline-none sm:text-sm">
              <div className="flex items-center">
                {selectedAsset && (
                  <div className="absolute left-3">
                    <AssetIcon asset={selectedAsset} />
                  </div>
                )}
                <ComboboxInput
                  className={`uppercase w-full border border-gray-300 rounded-md bg-gray-50 py-2 text-sm leading-5 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    selectedAsset ? "pl-10" : "pl-3"
                  } pr-10`}
                  onChange={(event) => handleSearch(event.target.value)}
                  displayValue={(asset: string) => asset}
                />
              </div>
              <ComboboxButton
                className="absolute inset-y-0 right-0 flex items-center justify-center px-1 m-1 w-11"
                onClick={handleComboboxButtonClick}
              >
                <FiChevronDown
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </ComboboxButton>
            </div>
            {assets.length > 0 && (
              <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                {assets.map((asset) => (
                  <ComboboxOption
                    key={asset.asset}
                    value={asset.asset}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? "bg-blue-500 text-white" : "text-gray-900"
                      }`
                    }
                  >
                    {({ selected, active }) => (
                      <>
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                          <AssetIcon asset={asset.asset} />
                        </span>
                        <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                          {asset.asset}
                        </span>
                        {selected && (
                          <span
                            className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
                              active ? "text-white" : "text-blue-500"
                            }`}
                          >
                            <FiCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                ))}
              </ComboboxOptions>
            )}
          </div>
        </div>
      </Combobox>
      {shouldShowHelpText && (
        <p className="mt-2 text-sm text-gray-500">
          {description || "Search and select an asset by name or symbol"}
        </p>
      )}
    </div>
  );
}
