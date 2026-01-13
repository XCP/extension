/**
 * Hardware Wallet Module
 *
 * Provides hardware wallet integration for XCP Wallet.
 * Supports Trezor and Ledger devices.
 *
 * NOTE: Adapter imports are lazy-loaded to avoid triggering browser API
 * side effects during module initialization (which breaks unit tests).
 */

import { IHardwareWalletAdapter } from './interface';
import { HardwareWalletVendor, HardwareWalletError } from './types';

export * from './types';
export * from './interface';
export * from './helpers';
export * from './deviceDetection';
export * from './operationManager';

// Lazy-loaded adapter getters to avoid triggering browser API side effects on import
let _trezorModule: typeof import('./trezorAdapter') | null = null;
let _ledgerModule: typeof import('./ledgerAdapter') | null = null;

async function loadTrezorModule() {
  if (!_trezorModule) {
    _trezorModule = await import('./trezorAdapter');
  }
  return _trezorModule;
}

async function loadLedgerModule() {
  if (!_ledgerModule) {
    _ledgerModule = await import('./ledgerAdapter');
  }
  return _ledgerModule;
}

/**
 * Get the Trezor adapter instance (lazy-loaded)
 */
export async function getTrezorAdapter() {
  const mod = await loadTrezorModule();
  return mod.getTrezorAdapter();
}

/**
 * Reset the Trezor adapter instance
 */
export async function resetTrezorAdapter() {
  const mod = await loadTrezorModule();
  return mod.resetTrezorAdapter();
}

/**
 * Get the Ledger adapter instance (lazy-loaded)
 */
export async function getLedgerAdapter() {
  const mod = await loadLedgerModule();
  return mod.getLedgerAdapter();
}

/**
 * Reset the Ledger adapter instance
 */
export async function resetLedgerAdapter() {
  const mod = await loadLedgerModule();
  return mod.resetLedgerAdapter();
}

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
 * const adapter = await getHardwareAdapter('trezor');
 * await adapter.init();
 *
 * @example
 * // Get Ledger adapter
 * const adapter = await getHardwareAdapter('ledger');
 * await adapter.init();
 */
export async function getHardwareAdapter(vendor: HardwareWalletVendor): Promise<IHardwareWalletAdapter> {
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
