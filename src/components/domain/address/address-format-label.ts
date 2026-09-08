import { AddressFormat, getAddressFormatLabel } from '@/core/bitcoin/address';
import { t } from '@/i18n';

/** Translate presentation only; saved formats and protocol identifiers stay unchanged. */
export function localizedAddressFormatLabel(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return `${t('address_type_legacy')} (P2PKH)`;
    case AddressFormat.P2WPKH:
      return `${t('address_type_native_segwit')} (P2WPKH)`;
    case AddressFormat.P2SH_P2WPKH:
      return `${t('address_type_nested_segwit')} (P2SH-P2WPKH)`;
    default:
      // Taproot, wallet brands and unknown-format fallbacks retain their names.
      return getAddressFormatLabel(format);
  }
}
