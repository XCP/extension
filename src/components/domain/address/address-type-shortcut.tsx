import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { type KeyboardEvent, type ReactElement, useRef, useState } from 'react';
import { localizedAddressFormatLabel } from '@/components/domain/address/address-format-label';
import { FaCheck, FiLayers } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { useWallet } from '@/contexts/wallet-context';
import type { AddressFormat } from '@/core/bitcoin/address';
import { formatAddress } from '@/core/format';
import { canSwitchAddressFormat, selectableAddressFormats } from '@/core/wallet/addressFormatChoices';
import { useAddressFormatSwitch } from '@/hooks/useAddressFormatSwitch';
import { t } from '@/i18n';

/**
 * A header shortcut to Settings → Address type.
 *
 * It offers exactly what the settings page offers — the same eligibility policy, previews and
 * switching call, through `useAddressFormatSwitch` — and nothing about paired addresses or site
 * connections. It renders nothing unless an unlocked wallet can actually switch between two or
 * more formats.
 */
export function AddressTypeShortcut(): ReactElement | null {
  const { activeWallet, keychainLocked } = useWallet();
  if (keychainLocked || !activeWallet) return null;
  if (!canSwitchAddressFormat(activeWallet)) return null;
  if (selectableAddressFormats(activeWallet.addressFormat).length < 2) return null;

  const label = t(
    'address_type_shortcut_change_address_type',
    localizedAddressFormatLabel(activeWallet.addressFormat)
  );
  return (
    <Popover className="relative">
      <PopoverButton as={Button} variant="header" aria-label={label} title={label}>
        <FiLayers className="size-4" aria-hidden="true" />
      </PopoverButton>
      <PopoverPanel
        focus
        className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md bg-white p-2 shadow-lg ring-1 ring-black/5"
      >
        {({ close }) => <AddressTypeOptions onDone={() => close()} />}
      </PopoverPanel>
    </Popover>
  );
}

/**
 * Mounted only while the popover is open, so previews are derived on demand, not on every visit.
 *
 * A listbox, not a radio group: switching re-derives the wallet, so moving through the options
 * must not commit anything. Arrow keys, Home and End only move focus; Enter, Space or a click
 * commits the focused option. Escape and outside clicks close the popover through Headless UI.
 */
function AddressTypeOptions({ onDone }: { onDone: () => void }): ReactElement {
  const { formats, previews, isLoadingPreviews, selectedFormat, error, clearError, switchFormat } =
    useAddressFormatSwitch();
  const optionRefs = useRef(new Map<AddressFormat, HTMLDivElement>());
  const [focusedFormat, setFocusedFormat] = useState<AddressFormat | null>(
    () => selectedFormat ?? formats[0] ?? null
  );

  const commit = (format: AddressFormat) => {
    // Choosing the type already in use changes nothing; just close.
    if (format === selectedFormat) {
      onDone();
      return;
    }
    void switchFormat(format).then((switched) => {
      if (switched) onDone();
    });
  };

  const moveFocus = (format: AddressFormat | undefined) => {
    if (!format) return;
    setFocusedFormat(format);
    optionRefs.current.get(format)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, format: AddressFormat) => {
    const current = formats.indexOf(format);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(formats[Math.min(current + 1, formats.length - 1)]);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(formats[Math.max(current - 1, 0)]);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(formats[0]);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(formats.at(-1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(format);
        break;
    }
  };

  return (
    <div className="space-y-2">
      {/* Visual caption only; the listbox carries the same name for assistive technology. */}
      <p aria-hidden="true" className="px-2 pt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {t('common_address_type')}
      </p>
      {error && <ErrorAlert message={error} onClose={clearError} />}
      <div
        role="listbox"
        aria-label={t('common_address_type')}
        aria-busy={isLoadingPreviews}
        className="space-y-1"
      >
        {formats.map((format) => {
          const preview = previews[format];
          const isSelected = format === selectedFormat;
          return (
            <div
              key={format}
              ref={(element) => {
                if (element) optionRefs.current.set(format, element);
                else optionRefs.current.delete(format);
              }}
              role="option"
              aria-selected={isSelected}
              tabIndex={format === focusedFormat ? 0 : -1}
              onClick={() => commit(format)}
              onKeyDown={(event) => handleKeyDown(event, format)}
              onFocus={() => setFocusedFormat(format)}
              className={`flex w-full cursor-pointer items-center rounded px-2 py-1.5 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? 'bg-blue-50' : ''}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {localizedAddressFormatLabel(format)}
                </span>
                <span className="block truncate font-mono text-xs text-gray-500">
                  {isLoadingPreviews ? t('common_loading') : preview ? formatAddress(preview) : ' '}
                </span>
              </span>
              <FaCheck
                className={`ml-2 size-4 shrink-0 text-blue-500 ${isSelected ? '' : 'opacity-0'}`}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
