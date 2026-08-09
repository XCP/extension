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
import type { FairminterDetails } from "@/core/counterparty/api";
import { fetchAssetFairminter } from "@/core/counterparty/api";
import {
  describeFairminterLot,
  isFairminterMintableNow,
} from "@/core/counterparty/fairminterModel";
import { isGreaterThan } from "@/core/numeric";
import { useBlockHeight } from "@/hooks/useBlockHeight";

/**
 * The list and the per-asset endpoint return the same row, so they share one type. Re-exported
 * under the name the mint screens already use.
 */
export type Fairminter = FairminterDetails;

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
  // Needed to tell a sale opening on the next block from one parked years out.
  const { blockHeight } = useBlockHeight();

  // Load the open fairminters once, at mount. The fetch calls onChange(selectedAsset, ...), so
  // listing either would refetch the whole list on every selection change.
  //
  // `blockHeight` is deliberately not a dependency: refetching the list when a block arrives would
  // reset a selection mid-form. A sale that becomes mintable one block later is picked up the next
  // time this screen is opened.
  useEffect(() => {
    const fetchFairminters = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Open only. The pending set is in practice parked placeholders with a start block years
        // out, so listing it would be noise; a genuinely imminent sale is reached by typing its
        // name, which triggers the lookup below.
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

  /**
   * A name the open list does not hold may still be mintable: a sale opening on the *next* block
   * accepts a mint composed now, because core opens it before parsing that block's transactions.
   *
   * Looked up one asset at a time rather than listed, because the pending set is dominated by
   * fairminters parked years out — `isFairminterMintableNow` is what keeps those out, and offering
   * one would cost a miner fee and mint nothing.
   */
  useEffect(() => {
    const name = query.trim().toUpperCase();
    if (!name || fairminters.some((f) => f.asset === name)) return;
    // Cheap shape check first: no point asking the node about a half-typed name.
    if (!/^[A-Z][A-Z0-9.]{2,}$/.test(name)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await fetchAssetFairminter(name);
        if (cancelled || !found || !isFairminterMintableNow(found, blockHeight)) return;
        setFairminters((current) =>
          current.some((f) => f.asset === found.asset) ? current : [...current, found]
        );
      } catch {
        // A miss is the common case — most names are simply not fairminters.
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, fairminters, blockHeight]);

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
