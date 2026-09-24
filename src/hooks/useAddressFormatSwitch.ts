import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import type { AddressFormat } from '@/core/bitcoin/address';
import { addressIndexKeptBySwitch, selectableAddressFormats } from '@/core/wallet/addressFormatChoices';
import { t } from '@/i18n';

interface AddressFormatSwitch {
  /** Formats the active wallet may be offered, from the shared eligibility policy. */
  formats: AddressFormat[];
  /**
   * Per format, the address a switch would land on, derived at the index the switch keeps
   * (`addressIndexKeptBySwitch`), so the current format's preview is the address in use. Empty
   * string when no preview could be derived.
   */
  previews: Partial<Record<AddressFormat, string>>;
  /** True until the previews for `formats` have been loaded. */
  isLoadingPreviews: boolean;
  /** The format shown as chosen: the wallet's, or the one being switched to. */
  selectedFormat: AddressFormat | null;
  error: string | null;
  clearError: () => void;
  /**
   * Switch the active wallet to `format` through `updateWalletAddressFormat`.
   * Resolves true when the switch was saved; on failure the selection reverts and `error` is set.
   */
  switchFormat: (format: AddressFormat | null) => Promise<boolean>;
}

/**
 * The one switching path behind every address-type control.
 *
 * Settings → Address type and the home header shortcut both render from this hook, so they offer
 * the same formats, preview the same addresses and save through the same wallet call with the same
 * failure handling. Surfaces decide only how to present it.
 */
export function useAddressFormatSwitch(): AddressFormatSwitch {
  const { activeWallet, activeAddress, updateWalletAddressFormat, getPreviewAddressForFormat } = useWallet();
  const walletFormat = activeWallet?.addressFormat ?? null;
  const formats = useMemo(
    () => (walletFormat ? selectableAddressFormats(walletFormat) : []),
    [walletFormat]
  );
  const addressIndex = activeWallet ? addressIndexKeptBySwitch(activeWallet, activeAddress?.address) : 0;
  const [previews, setPreviews] = useState<Partial<Record<AddressFormat, string>>>({});
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<AddressFormat | null>(walletFormat);
  const [error, setError] = useState<string | null>(null);
  const isChanging = useRef(false);

  // Previews depend only on which wallet, which formats are offered and which index — not on the
  // wallet object, which is replaced on unrelated refreshes, nor on the current format within the
  // family, so a switch or a refresh does not re-derive them or flash the loading state.
  const walletId = activeWallet?.id ?? null;
  const formatsKey = formats.join(',');
  useEffect(() => {
    let cancelled = false;
    const loadPreviews = async () => {
      if (!walletId) {
        setIsLoadingPreviews(false);
        return;
      }
      setIsLoadingPreviews(true);
      const loaded: Partial<Record<AddressFormat, string>> = {};
      for (const format of formatsKey.split(',') as AddressFormat[]) {
        try {
          loaded[format] = await getPreviewAddressForFormat(walletId, format, addressIndex);
        } catch (err) {
          // No preview available for this format; the option is still offered without one.
          console.debug(`No preview available for ${format}:`, err);
          loaded[format] = '';
        }
      }
      if (cancelled) return;
      setPreviews(loaded);
      setIsLoadingPreviews(false);
    };
    void loadPreviews();
    return () => { cancelled = true; };
  }, [walletId, formatsKey, addressIndex, getPreviewAddressForFormat]);

  // Follow the wallet when its format changes underneath us (a save here, or another surface).
  const [followedFormat, setFollowedFormat] = useState(walletFormat);
  if (walletFormat !== followedFormat) {
    setFollowedFormat(walletFormat);
    if (walletFormat) setSelectedFormat(walletFormat);
  }

  const switchFormat = useCallback(async (format: AddressFormat | null): Promise<boolean> => {
    if (!format || !activeWallet || isChanging.current) return false;

    // Select immediately for an instant response; revert below if the save fails.
    setSelectedFormat(format);
    isChanging.current = true;
    try {
      await updateWalletAddressFormat(activeWallet.id, format);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating address type:', err);
      setError(err instanceof Error ? err.message : t('settings_address_types_failed_to_update_address_type'));
      setSelectedFormat(activeWallet.addressFormat);
      return false;
    } finally {
      isChanging.current = false;
    }
  }, [activeWallet, updateWalletAddressFormat]);

  const clearError = useCallback(() => setError(null), []);

  return { formats, previews, isLoadingPreviews, selectedFormat, error, clearError, switchFormat };
}
