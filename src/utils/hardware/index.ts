/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Currently supports Trezor devices.
 * Designed to be extensible for future Ledger support.
 */

import { IHardwareWalletAdapter } from './interface';
import { HardwareWalletVendor, HardwareWalletError } from './types';
import { getTrezorAdapter } from './trezorAdapter';

export * from './types';
export * from './interface';
export { TrezorAdapter, getTrezorAdapter, resetTrezorAdapter } from './trezorAdapter';

/**
 * Factory function to get the appropriate hardware wallet adapter
 * based on the vendor type. This abstraction allows easy addition
 * of new hardware wallet vendors in the future.
 *
 * @param vendor - The hardware wallet vendor (e.g., 'trezor', 'ledger')
 * @returns The hardware wallet adapter for the specified vendor
 * @throws HardwareWalletError if the vendor is not supported
 *
 * @example
 * // Get Trezor adapter
 * const adapter = getHardwareAdapter('trezor');
 * await adapter.init();
 *
 * @example
 * // Future Ledger support
 * const adapter = getHardwareAdapter('ledger');
 */
export function getHardwareAdapter(vendor: HardwareWalletVendor): IHardwareWalletAdapter {
  switch (vendor) {
    case 'trezor':
      return getTrezorAdapter();

    case 'ledger':
      // TODO: Implement LedgerAdapter when Ledger support is added
      // return getLedgerAdapter();
      throw new HardwareWalletError(
        'Ledger support is not yet implemented',
        'VENDOR_NOT_SUPPORTED',
        'ledger',
        'Ledger hardware wallets are not yet supported. Please use a Trezor device.'
      );

    default:
      throw new HardwareWalletError(
        `Unknown hardware wallet vendor: ${vendor}`,
        'UNKNOWN_VENDOR',
        vendor,
        'This hardware wallet type is not supported.'
      );
  }
}

/**
 * Check if a hardware wallet vendor is supported
 *
 * @param vendor - The vendor to check
 * @returns true if the vendor is supported
 */
export function isVendorSupported(vendor: HardwareWalletVendor): boolean {
  return vendor === 'trezor';
}

/**
 * Get list of currently supported hardware wallet vendors
 *
 * @returns Array of supported vendor names
 */
export function getSupportedVendors(): HardwareWalletVendor[] {
  return ['trezor'];
}
