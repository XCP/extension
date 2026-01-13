/**
 * Hardware Wallet Helpers
 *
 * Utility functions for hardware wallet operations and display.
 */

import type { HardwareWalletVendor } from './types';

/**
 * Get user-friendly display label for a hardware wallet vendor
 * @param vendor - The hardware wallet vendor
 * @returns Display name (e.g., "Trezor", "Ledger")
 */
export function getVendorLabel(vendor?: HardwareWalletVendor): string {
  if (!vendor) return 'Hardware Wallet';
  return vendor === 'ledger' ? 'Ledger' : 'Trezor';
}

/**
 * Get device-specific confirmation instructions
 * @param vendor - The hardware wallet vendor
 * @returns Instructions for confirming on the device
 */
export function getVendorConfirmInstructions(vendor?: HardwareWalletVendor): string {
  if (vendor === 'ledger') {
    return 'Press both buttons to approve';
  }
  return 'Press Confirm to approve';
}
