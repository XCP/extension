import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import type { AddressFormat } from '@/core/bitcoin/address';
import { selectableAddressFormats } from '@/core/wallet/addressFormatChoices';
import { t } from '@/i18n';

interface AddressFormatSwitch {
  /** Formats the active wallet may be offered, from the shared eligibility policy. */
  formats: AddressFormat[];
  /** First-address preview per format; empty string when no preview could be derived. */
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
  const { activeWallet, updateWalletAddressFormat, getPreviewAddressForFormat } = useWallet();
  const walletFormat = activeWallet?.addressFormat ?? null;
  const formats = useMemo(
    () => (walletFormat ? selectableAddressFormats(walletFormat) : []),
    [walletFormat]
  );
  const [previews, setPreviews] = useState<Partial<Record<AddressFormat, string>>>({});
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<AddressFormat | null>(walletFormat);
  const [error, setError] = useState<string | null>(null);
  const isChanging = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const loadPreviews = async () => {
      if (!activeWallet) {
        setIsLoadingPreviews(false);
        return;
      }
      setIsLoadingPreviews(true);
      const loaded: Partial<Record<AddressFormat, string>> = {};
      for (const format of formats) {
        try {
          loaded[format] = await getPreviewAddressForFormat(activeWallet.id, format);
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
  }, [activeWallet, formats, getPreviewAddressForFormat]);

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
