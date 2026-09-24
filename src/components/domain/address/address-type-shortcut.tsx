import { Popover, PopoverButton, PopoverPanel, Radio, RadioGroup } from '@headlessui/react';
import type { ReactElement } from 'react';
import { localizedAddressFormatLabel } from '@/components/domain/address/address-format-label';
import { FaCheck, FaExchangeAlt } from '@/components/icons';
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

  const label = t('address_type_shortcut_change_address_type');
  return (
    <Popover className="relative">
      <PopoverButton as={Button} variant="header" aria-label={label} title={label}>
        <FaExchangeAlt className="size-4" aria-hidden="true" />
      </PopoverButton>
      <PopoverPanel
        focus
        className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md bg-white p-2 shadow-lg ring-1 ring-black/5"
      >
        {({ close }) => <AddressTypeOptions onSwitched={() => close()} />}
      </PopoverPanel>
    </Popover>
  );
}

/** Mounted only while the popover is open, so previews are derived on demand, not on every visit. */
function AddressTypeOptions({ onSwitched }: { onSwitched: () => void }): ReactElement {
  const { formats, previews, isLoadingPreviews, selectedFormat, error, clearError, switchFormat } =
    useAddressFormatSwitch();

  const handleChange = (format: AddressFormat | null) => {
    void switchFormat(format).then((switched) => {
      if (switched) onSwitched();
    });
  };

  return (
    <div className="space-y-2">
      {/* Visual caption only; the radio group carries the same name for assistive technology. */}
      <p aria-hidden="true" className="px-2 pt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {t('common_address_type')}
      </p>
      {error && <ErrorAlert message={error} onClose={clearError} />}
      <RadioGroup
        value={selectedFormat}
        onChange={handleChange}
        aria-label={t('common_address_type')}
        aria-busy={isLoadingPreviews}
        className="space-y-1"
      >
        {formats.map((format) => {
          const preview = previews[format];
          return (
            <Radio
              key={format}
              value={format}
              className="group flex w-full cursor-pointer items-center rounded px-2 py-1.5 outline-none hover:bg-gray-50 data-[checked]:bg-blue-50 data-[focus]:ring-2 data-[focus]:ring-blue-500"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {localizedAddressFormatLabel(format)}
                </span>
                <span className="block truncate font-mono text-xs text-gray-500">
                  {isLoadingPreviews ? t('common_loading') : preview ? formatAddress(preview) : ' '}
                </span>
              </span>
              <FaCheck
                className="ml-2 size-4 shrink-0 text-blue-500 opacity-0 group-data-[checked]:opacity-100"
                aria-hidden="true"
              />
            </Radio>
          );
        })}
      </RadioGroup>
    </div>
  );
}
