import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from "@headlessui/react";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCheck, FiChevronDown } from "@/components/icons";
import { useSettings } from "@/contexts/settings-context";
import type { FairminterDetails } from "@/core/counterparty/api";
import { fetchAssetFairminter, fetchOpenFairminters } from "@/core/counterparty/api";
import {
  describeFairminterLot,
  isFairminterMintableNow,
} from "@/core/counterparty/fairminterModel";
import { isGreaterThan } from "@/core/numeric";
import { useBlockHeight } from "@/hooks/useBlockHeight";
import { usePaginatedFetch } from "@/hooks/usePaginatedFetch";

/**
 * The list and the per-asset endpoint return the same row, so they share one type. Re-exported
 * under the name the mint screens already use.
 */
export type Fairminter = FairminterDetails;

const fairminterKey = (fairminter: Fairminter) => fairminter.tx_hash;

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
  const [lookedUp, setLookedUp] = useState<Fairminter[]>([]);
  const fetchFn = useCallback((offset: number, limit: number) =>
    fetchOpenFairminters({ offset, limit }), [settings.counterpartyApiBase]);
  const page = usePaginatedFetch({ fetchFn, pageSize: 20, maxItems: Infinity, getKey: fairminterKey });
  const fairminters = useMemo(() => {
    const byAsset = new Map(page.data.filter(f => !!f.asset).map(f => [f.asset, f]));
    for (const row of lookedUp) if (!byAsset.has(row.asset)) byAsset.set(row.asset, row);
    return [...byAsset.values()];
  }, [page.data, lookedUp]);
  const { blockHeight } = useBlockHeight();
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Restored selections can live on any page. Resolve them directly rather than draining
  // the browsing list before the form can restore its review state.
  const selected = fairminters.find(f => f.asset === selectedAsset);
  useEffect(() => {
    if (selected) onChangeRef.current(selected.asset, selected);
  }, [selected]);

  /**
   * A name the open list does not hold may still be mintable: a sale opening on the *next* block
   * accepts a mint composed now, because core opens it before parsing that block's transactions.
   *
   * Looked up one asset at a time rather than listed, because the pending set is dominated by
   * fairminters parked years out — `isFairminterMintableNow` is what keeps those out, and offering
   * one would cost a miner fee and mint nothing.
   */
  useEffect(() => {
    const name = (query || selectedAsset).trim().toUpperCase();
    if (!name || fairminters.some((f) => f.asset === name)) return;
    // Cheap shape check first: no point asking the node about a half-typed name.
    if (!/^[A-Z][A-Z0-9.]{2,}$/.test(name)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await fetchAssetFairminter(name);
        if (cancelled || !found || !isFairminterMintableNow(found, blockHeight)) return;
        setLookedUp((current) =>
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
  }, [query, selectedAsset, fairminters, blockHeight]);

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

  // Do not strand the browser on a page containing only another currency, or show
  // an empty search result while matching listings may remain on later pages.
  useEffect(() => {
    if (!page.data.length || filteredFairminters.length || !page.hasMore
      || page.error || page.isLoading || page.isFetchingMore) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) page.loadMore(); });
    return () => { cancelled = true; };
  }, [filteredFairminters.length, page]);

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

            {(filteredFairminters.length > 0 || page.hasMore) && (
              <ComboboxOptions
                className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                onScroll={event => {
                  const list = event.currentTarget;
                  if (list.scrollHeight - list.scrollTop - list.clientHeight < 40) page.loadMore();
                }}
              >
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
            )}
          </div>
        </div>
      </Combobox>
      {page.error ? (
        <div role="alert" className="mt-2 text-sm text-red-600">
          Unable to load {page.data.length ? 'more' : 'available'} fairminters.{' '}
          <button type="button" className="underline" onClick={page.refresh}>Retry</button>
        </div>
      ) : page.isLoading || page.isFetchingMore ? (
        <p role="status" className="mt-2 text-sm text-gray-500">Loading fairminters…</p>
      ) : page.hasMore ? (
        <button type="button" className="mt-2 text-sm text-blue-600 underline" onClick={page.loadMore}>
          Load more fairminters
        </button>
      ) : filteredFairminters.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No matching fairminters.</p>
      ) : null}
      {showHelpText && (
        <p className="mt-2 text-sm text-gray-500">
          {description || "Select an open fairminter asset to mint"}
        </p>
      )}
    </div>
  );
}
