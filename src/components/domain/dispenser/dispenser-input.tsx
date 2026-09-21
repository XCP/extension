import { Description, Field, Input, Label } from "@headlessui/react";
import { type ReactElement, useEffect, useMemo } from "react";
import { DispenserList, type DispenserOption } from "@/components/ui/lists/dispenser-list";
import type { DispenseOptions } from "@/core/counterparty/compose";
import { fromSatoshis, toNumber } from "@/core/numeric";
import { isValidBitcoinAddress } from "@/core/validation/bitcoin";
import { useAddressDispensers } from "@/hooks/useAddressDispensers";
import { useInView } from "@/hooks/useInView";

import { t } from '@/i18n';

// ============================================================================
// Types
// ============================================================================

interface DispenserInputProps {
  value: string; // The dispenser address
  onChange: (address: string) => void;
  selectedIndex: number | null;
  onSelectionChange: (index: number | null, option: DispenserOption | null) => void;
  initialFormData?: (DispenseOptions & { initialAsset?: string }) | null;
  disabled?: boolean;
  showHelpText?: boolean;
  required?: boolean;
  onError?: (error: string | null) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * DispenserInput provides an address input with automatic dispenser discovery.
 *
 * @param props - The component props
 * @returns A ReactElement representing the dispenser input with selection list
 */
export function DispenserInput({
  value,
  onChange,
  selectedIndex,
  onSelectionChange,
  initialFormData,
  disabled = false,
  showHelpText = false,
  required = true,
  onError,
  onLoadingChange,
}: DispenserInputProps): ReactElement {
  const isValidAddress = value ? isValidBitcoinAddress(value) : false;
  const showInvalidBorder = value && !isValidAddress;
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: '200px' });
  const page = useAddressDispensers(isValidAddress ? value : undefined, initialFormData?.initialAsset,
    initialFormData?.dispenser === value ? selectedIndex : undefined);
  const isLoading = page.isLoading;
  const error = page.error ? t('dispenser_load_failed')
    : isValidAddress && !isLoading && !page.hasMore && page.data.length === 0
      ? t('dispenser_dispenser_input_no_open_dispenser_found_at') : null;

  useEffect(() => { onError?.(error); }, [error, onError]);
  useEffect(() => { onLoadingChange?.(isLoading); }, [isLoading, onLoadingChange]);
  const loadMore = page.loadMore;
  useEffect(() => { if (inView) loadMore(); }, [inView, loadMore]);

  // Keep API order as pages append so a new page cannot change the selected index.
  const dispenserOptions = useMemo(() => page.data.map((dispenser, index) => {
    return {
      dispenser: {
        ...dispenser,
        satoshirate: toNumber(dispenser.satoshirate),
      },
      satoshirate: toNumber(dispenser.satoshirate),
      btcAmount: fromSatoshis(dispenser.satoshirate, true),
      index,
    };
  }), [page.data]);

  // Auto-select dispenser when options change (prefer initialAsset if provided)
  useEffect(() => {
    if (isLoading) return;
    if (dispenserOptions.length > 0) {
      if (selectedIndex === null) {
        // Check if we have an initialAsset to pre-select
        const initialAsset = initialFormData?.initialAsset;
        if (initialAsset) {
          const matchIndex = dispenserOptions.findIndex(
            opt => opt.dispenser.asset === initialAsset
          );
          if (matchIndex >= 0) {
            onSelectionChange(matchIndex, dispenserOptions[matchIndex]!);
            return;
          }
        }
        // Fall back to first option
        onSelectionChange(0, dispenserOptions[0]!);
      } else if (selectedIndex >= dispenserOptions.length) {
        onSelectionChange(0, dispenserOptions[0]!);
      }
    } else if (dispenserOptions.length === 0) {
      onSelectionChange(null, null);
    }
  }, [dispenserOptions, selectedIndex, onSelectionChange, initialFormData?.initialAsset, isLoading]);

  return (
    <>
      {/* Dispenser Address Input */}
      <Field>
        <Label 
          htmlFor="dispenserAddress" 
          className="block text-sm font-medium text-gray-700"
        >
          {t('messages_dispense_dispenser_address')} {required && <span className="text-red-500">*</span>}
        </Label>
        <Input
          id="dispenserAddress"
          name="dispenserAddress"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`mt-1 block w-full p-2.5 rounded-md border bg-gray-50 outline-none focus-visible:ring-2 ${
            showInvalidBorder ? "border-red-500 focus:border-red-500 focus-visible:ring-red-500" : "border-gray-300 focus:border-blue-500 focus-visible:ring-blue-500"
          }`}
          required={required}
          disabled={disabled || isLoading}
        />
        {showHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            {t('dispenser_dispenser_input_enter_the_dispenser_address_to')}
          </Description>
        )}
      </Field>

      {/* Dispenser List */}
      <DispenserList
        dispensers={dispenserOptions}
        selectedIndex={selectedIndex}
        onSelect={onSelectionChange}
        disabled={disabled}
        isLoading={isLoading}
        error={page.data.length === 0 ? error : null}
      />

      <div ref={!isLoading && page.data.length > 0 ? loadMoreRef : undefined} className="py-2 text-center text-sm">
        {page.error ? (
          <div role="alert">
            <p>{t('dispenser_more_failed')}</p>
            <button type="button" onClick={page.retry} className="text-blue-600 underline" disabled={disabled}>{t('common_retry')}</button>
          </div>
        ) : page.isFetchingMore ? t('pagination_loading_more') : page.hasMore && isValidAddress ? (
          <button type="button" onClick={page.loadMore} className="text-blue-600 underline" disabled={disabled || isLoading}>{t('dispenser_load_more')}</button>
        ) : null}
      </div>

      {/* Hidden inputs for form data */}
      {selectedIndex !== null && dispenserOptions[selectedIndex] && (
        <>
          <input
            type="hidden"
            name="satoshirate"
            value={dispenserOptions[selectedIndex].satoshirate}
          />
          <input
            type="hidden"
            name="selectedDispenserIndex"
            value={selectedIndex}
          />
          <input type="hidden" name="dispenser" value={value} />
        </>
      )}
    </>
  );
}

// Re-export the type for convenience
export type { DispenserOption };
