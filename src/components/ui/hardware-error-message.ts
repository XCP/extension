import { hardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { t } from '@/i18n';

/** Only unambiguous wallet-authored codes get translated; device evidence stays intact. */
export function hardwareErrorMessage(error: unknown): string | undefined {
  const diagnostic = hardwareErrorMetadata(error);
  if (diagnostic?.vendor !== 'trezor') return undefined;
  switch (diagnostic.code) {
    case 'INIT_FAILED': return t('hardware_error_init_failed');
    case 'USER_CANCELLED': return t('hardware_error_cancelled');
    case 'DEVICE_DISCONNECTED': return t('hardware_error_disconnected');
    case 'PERMISSION_DENIED': return t('hardware_error_permission_denied');
    case 'DEVICE_BUSY': return t('hardware_error_busy');
    case 'DISCOVERY_FAILED': return t('hardware_error_discovery_failed');
    case 'GET_ADDRESS_FAILED':
    case 'GET_ADDRESSES_FAILED': return t('hardware_error_address_failed');
    case 'GET_XPUB_FAILED':
    case 'XPUB_EXTRACTION_FAILED': return t('hardware_error_public_key_failed');
    case 'TAPROOT_SIGNING_NOT_SUPPORTED': return t('hardware_error_taproot_message', [t('address_type_native_segwit')]);
    // INVALID_PSBT, unsupported inputs and unknown vendor codes carry specific evidence.
    default: return undefined;
  }
}
