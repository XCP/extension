import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from "@headlessui/react";
import { type ReactElement, useEffect, useState } from "react";
import { FaCheck, FiChevronDown } from "@/components/icons";
import { useSettings } from "@/contexts/settings-context";
import { describeFairminterLot } from "@/core/counterparty/fairminterModel";
import { isGreaterThan } from "@/core/numeric";

/**
 * A fairminter as `/v2/fairminters?verbose=true` returns it.
 *
 * The endpoint returns every column of core's fairminters table; this interface used to declare
 * nine fields and drop the rest, which is why the mint screens could not say where a payment goes
 * or how close the asset is to its cap. The fields below are read by the mint form and review, so
 * they are declared here rather than re-fetched.
 */
export interface Fairminter {
  tx_hash: string;
  /** Where the XCP goes when burn_payment is false — the address that opened the fairminter. */
  source: string;
  asset: string;
  description: string;
  /** XCP charged per lot, in base units. */
  price?: number;
  /** XCP per whole unit; core derives it as price / quantity_by_price. */
  price_normalized: string;
  /** Assets released per lot paid for, i.e. the lot size. */
  quantity_by_price_normalized: string;
  status: string;
  divisible: boolean;
  max_mint_per_tx?: number;
  max_mint_per_tx_normalized?: string;
  /** True burns the payment; false sends it to `source`. Says nothing about whether it is free. */
  burn_payment?: boolean;
  hard_cap?: number;
  hard_cap_normalized?: string;
  /** Until this is reached, both the payment and the minted assets sit in escrow. */
  soft_cap?: number;
  soft_cap_normalized?: string;
  soft_cap_deadline_block?: number;
  max_mint_per_address?: number;
  max_mint_per_address_normalized?: string;
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

/**
 * FairminterSelectInput provides a searchable dropdown for selecting open fairminters.
 *
 * @param props - The component props
 * @returns A ReactElement representing the fairminter selection input
 */
export function FairminterSelectInput({
  selectedAsset,
  onChange,
  label,
  showHelpText = false,
  description,
  required = false,
  currencyFilter,
}: FairminterSelectInputProps): ReactElement {
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [fairminters, setFairminters] = useState<Fairminter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFairminters = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch fairminters with status "open"
        const response = await fetch(
          `${settings.counterpartyApiBase}/v2/fairminters?status=open&verbose=true`,
        );

        if (!response.ok) {
          // Use generic error to prevent leaking HTTP status details
          throw new Error("Failed to fetch fairminters");
        }

        const data = await response.json();

        if (data.result && Array.isArray(data.result)) {
          // Filter out fairminters with null asset
          const validFairminters = data.result.filter(
            (fairminter: Fairminter) => fairminter.asset !== null,
          );
          setFairminters(validFairminters);

          // If we have an initially selected asset, notify parent with its fairminter data
          // This handles the case when returning from review
          if (selectedAsset) {
            const matchingFairminter = validFairminters.find(
              (f: any) => f.asset === selectedAsset,
            );
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
        // Use generic error to prevent leaking internal details
        setError("Failed to load available assets. Please try again.");
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
      const price = fairminter.price_normalized;
      if (currencyFilter === "BTC") {
        // BTC fairminters have price = 0 (free mints)
        return !isGreaterThan(price, 0);
      } else if (currencyFilter === "XCP") {
        // XCP fairminters have price > 0
        return isGreaterThan(price, 0);
      }
      return true;
    });
  }

  // Apply text search filter
  if (query !== "") {
    filteredFairminters = filteredFairminters.filter(
      (fairminter) =>
        fairminter.asset.toLowerCase().includes(query.toLowerCase()) ||
        (fairminter.description &&
          fairminter.description.toLowerCase().includes(query.toLowerCase())),
    );
  }

  const handleAssetChange = (asset: string | null) => {
    if (asset) {
      const fairminter = fairminters.find((f) => f.asset === asset);
      onChange(asset, fairminter);
    }
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
  };

  function AssetIcon({ asset }: { asset: string }) {
    return (
      <img
        src={`https://cdn.xcp.io/img/icon/${asset}`}
        alt={`${asset} icon`}
        className="size-5 rounded-full"
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
          {/* Headless UI's Label, so it is wired to the Combobox input rather than only
              looking like a label. Still renders a <label>, which the input specs select on. */}
          <Label className="block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
          <div className="relative mt-1">
            <div className="relative w-full cursor-default overflow-hidden rounded-md bg-gray-50 text-left focus:outline-none sm:text-sm">
              <div className="flex items-center">
                {selectedAsset && (
                  <div className="absolute left-3">
                    <AssetIcon asset={selectedAsset} />
                  </div>
                )}
                <ComboboxInput
                  className={`uppercase w-full border border-gray-300 rounded-md bg-gray-50 py-2.5 text-sm leading-5 text-gray-900 outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    selectedAsset ? "pl-10" : "pl-3"
                  } pr-10`}
                  onChange={(event) => handleSearch(event.target.value)}
                  displayValue={(asset: string) => asset}
                  aria-label={label}
                />
              </div>
              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center justify-center px-1 m-1 w-11">
                <FiChevronDown
                  className="size-4 text-gray-400"
                  aria-hidden="true"
                />
              </ComboboxButton>
            </div>

            {isLoading ? (
              <div className="mt-2 text-sm text-gray-500">
                Loading fairminters…
              </div>
            ) : error ? (
              <div className="mt-2 text-sm text-red-500">{error}</div>
            ) : filteredFairminters.length > 0 ? (
              <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                {filteredFairminters.map((fairminter) => (
                  <ComboboxOption
                    key={fairminter.tx_hash}
                    value={fairminter.asset}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2.5 pl-10 pr-4 ${
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
                          <span
                            className={`block truncate ${selected ? "font-medium" : "font-normal"}`}
                          >
                            {fairminter.asset}
                          </span>
                          <span
                            className={`text-xs ${active ? "text-blue-100" : "text-gray-500"}`}
                          >
                            {/* Cost of a whole lot, not of one token. The per-token figure read
                                as "the price of a mint" while being a fraction of it. */}
                            {describeFairminterLot(fairminter)}
                          </span>
                        </div>
                        {selected && (
                          <span
                            className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
                              active ? "text-white" : "text-blue-500"
                            }`}
                          >
                            <FaCheck className="size-4" aria-hidden="true" />
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
