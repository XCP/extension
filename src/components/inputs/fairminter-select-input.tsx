import { useState, useEffect } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { FiChevronDown, FiCheck } from "react-icons/fi";
import { getKeychainSettings } from '@/utils/storage/settingsStorage';
import { formatAmount } from '@/utils/format';

export interface Fairminter {
  tx_hash: string;
  source: string;
  asset: string;
  description: string;
  price_normalized: string;
  quantity_by_price_normalized: string;
  status: string;
  divisible: boolean;
  max_mint_per_tx?: number;
  max_mint_per_tx_normalized?: string;
}

interface FairminterSelectInputProps {
  selectedAsset: string;
  onChange: (asset: string, fairminter?: Fairminter) => void;
  label: string;
  showHelpText?: boolean;
  description?: string;
  required?: boolean;
  currencyFilter?: string; // "BTC" or "XCP" to filter fairminters
}

export function FairminterSelectInput({
  selectedAsset,
  onChange,
  label,
  showHelpText = false,
  description,
  required = false,
  currencyFilter,
}: FairminterSelectInputProps) {
  const [query, setQuery] = useState("");
  const [fairminters, setFairminters] = useState<Fairminter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFairminters = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const settings = await getKeychainSettings();
        // Fetch fairminters with status "open"
        const response = await fetch(`${settings.counterpartyApiBase}/v2/fairminters?status=open&verbose=true`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch fairminters: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.result && Array.isArray(data.result)) {
          // Filter out fairminters with null asset
          const validFairminters = data.result.filter(
            (fairminter: Fairminter) => fairminter.asset !== null
          );
          setFairminters(validFairminters);
          
          // If we have an initially selected asset, notify parent with its fairminter data
          // This handles the case when returning from review
          if (selectedAsset) {
            const matchingFairminter = validFairminters.find((f: any) => f.asset === selectedAsset);
            if (matchingFairminter) {
              // Use setTimeout to avoid state update during render
              setTimeout(() => onChange(selectedAsset, matchingFairminter), 0);
            }
          }
        } else {
          setFairminters([]);
        }
      } catch (error) {
        console.error("Error fetching fairminters:", error);
        setError(error instanceof Error ? error.message : "Failed to fetch fairminters");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFairminters();
  }, []);

  // Filter fairminters based on query and currency type
  let filteredFairminters = fairminters;
  
  // Apply currency filter if specified
  if (currencyFilter) {
    filteredFairminters = filteredFairminters.filter((fairminter) => {
      const price = parseFloat(fairminter.price_normalized);
      if (currencyFilter === "BTC") {
        // BTC fairminters have price = 0 (free mints)
        return price === 0;
      } else if (currencyFilter === "XCP") {
        // XCP fairminters have price > 0
        return price > 0;
      }
      return true;
    });
  }
  
  // Apply text search filter
  if (query !== "") {
    filteredFairminters = filteredFairminters.filter((fairminter) =>
      fairminter.asset.toLowerCase().includes(query.toLowerCase()) ||
      (fairminter.description && fairminter.description.toLowerCase().includes(query.toLowerCase()))
    );
  }

  const handleAssetChange = (asset: string | null) => {
    if (asset) {
      const fairminter = fairminters.find(f => f.asset === asset);
      onChange(asset, fairminter);
    }
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
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
              >
                <FiChevronDown
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </ComboboxButton>
            </div>
            
            {isLoading ? (
              <div className="mt-2 text-sm text-gray-500">Loading fairminters...</div>
            ) : error ? (
              <div className="mt-2 text-sm text-red-500">{error}</div>
            ) : filteredFairminters.length > 0 ? (
              <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                {filteredFairminters.map((fairminter) => (
                  <ComboboxOption
                    key={fairminter.tx_hash}
                    value={fairminter.asset}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? "bg-blue-500 text-white" : "text-gray-900"
                      }`
                    }
                  >
                    {({ selected, active }) => (
                      <>
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                          <AssetIcon asset={fairminter.asset} />
                        </span>
                        <div className="flex flex-col">
                          <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                            {fairminter.asset}
                          </span>
                          <span className={`text-xs ${active ? "text-blue-100" : "text-gray-500"}`}>
                            {parseFloat(fairminter.price_normalized) === 0 
                              ? "Free mint (BTC fees only)" 
                              : `Price: ${formatAmount({ value: parseFloat(fairminter.price_normalized), maximumFractionDigits: 8 })} XCP`}
                          </span>
                        </div>
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
            ) : null}
          </div>
        </div>
      </Combobox>
      {showHelpText && (
        <p className="mt-2 text-sm text-gray-500">
          {description || "Select an open fairminter asset to mint"}
        </p>
      )}
    </div>
  );
} 