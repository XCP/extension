/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Supports Trezor and Ledger devices.
 */

import { IHardwareWalletAdapter } from './interface';
import { HardwareWalletVendor, HardwareWalletError } from './types';
import { getTrezorAdapter } from './trezorAdapter';
import { getLedgerAdapter } from './ledgerAdapter';

export * from './types';
export * from './interface';
export { TrezorAdapter, getTrezorAdapter, resetTrezorAdapter } from './trezorAdapter';
export { LedgerAdapter, getLedgerAdapter, resetLedgerAdapter } from './ledgerAdapter';

/**
 * Factory function to get the appropriate hardware wallet adapter
 * based on the vendor type.
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
 * // Get Ledger adapter
 * const adapter = getHardwareAdapter('ledger');
 * await adapter.init();
 */
export function getHardwareAdapter(vendor: HardwareWalletVendor): IHardwareWalletAdapter {
  switch (vendor) {
    case 'trezor':
      return getTrezorAdapter();

    case 'ledger':
      return getLedgerAdapter();

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
  return vendor === 'trezor' || vendor === 'ledger';
}

/**
 * Get list of currently supported hardware wallet vendors
 *
 * @returns Array of supported vendor names
 */
export function getSupportedVendors(): HardwareWalletVendor[] {
  return ['trezor', 'ledger'];
}
