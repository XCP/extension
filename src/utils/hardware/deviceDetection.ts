/**
 * Hardware Wallet Device Detection
 *
 * Provides utilities for detecting connected hardware wallets.
 * Uses WebHID for Ledger and presence detection for Trezor.
 */

import type { HardwareWalletVendor } from './types';

/**
 * Known USB vendor IDs for hardware wallets
 */
const VENDOR_IDS = {
  LEDGER: 0x2c97,
  TREZOR: 0x1209,
  TREZOR_ALT: 0x534c, // SatoshiLabs
} as const;

/**
 * Result of device detection
 */
export interface DeviceDetectionResult {
  vendor: HardwareWalletVendor;
  deviceCount: number;
  /** Device models if detected (for multi-device scenarios) */
  devices: DetectedDevice[];
}

/**
 * Information about a detected device
 */
export interface DetectedDevice {
  vendor: HardwareWalletVendor;
  productId?: number;
  productName?: string;
  /** Whether the device is already connected/authorized */
  authorized: boolean;
}

/**
 * Check if WebHID is available in the current environment
 */
export function isWebHidAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

/**
 * Detect connected Ledger devices using WebHID
 * Note: Only returns previously authorized devices
 */
export async function detectLedgerDevices(): Promise<DetectedDevice[]> {
  if (!isWebHidAvailable()) {
    return [];
  }

  try {
    const devices = await navigator.hid.getDevices();
    return devices
      .filter((device) => device.vendorId === VENDOR_IDS.LEDGER)
      .map((device) => ({
        vendor: 'ledger' as HardwareWalletVendor,
        productId: device.productId,
        productName: device.productName || 'Ledger Device',
        authorized: true,
      }));
  } catch (error) {
    console.warn('[DeviceDetection] Failed to enumerate Ledger devices:', error);
    return [];
  }
}

/**
 * Detect connected Trezor devices using WebHID
 * Note: Only returns previously authorized devices
 */
export async function detectTrezorDevices(): Promise<DetectedDevice[]> {
  if (!isWebHidAvailable()) {
    return [];
  }

  try {
    const devices = await navigator.hid.getDevices();
    return devices
      .filter(
        (device) =>
          device.vendorId === VENDOR_IDS.TREZOR ||
          device.vendorId === VENDOR_IDS.TREZOR_ALT
      )
      .map((device) => ({
        vendor: 'trezor' as HardwareWalletVendor,
        productId: device.productId,
        productName: device.productName || 'Trezor Device',
        authorized: true,
      }));
  } catch (error) {
    console.warn('[DeviceDetection] Failed to enumerate Trezor devices:', error);
    return [];
  }
}

/**
 * Detect all connected hardware wallet devices
 * Returns a summary of detected devices grouped by vendor
 */
export async function detectAllDevices(): Promise<{
  trezor: DeviceDetectionResult;
  ledger: DeviceDetectionResult;
  anyDetected: boolean;
  multipleVendors: boolean;
}> {
  const [trezorDevices, ledgerDevices] = await Promise.all([
    detectTrezorDevices(),
    detectLedgerDevices(),
  ]);

  const trezor: DeviceDetectionResult = {
    vendor: 'trezor',
    deviceCount: trezorDevices.length,
    devices: trezorDevices,
  };

  const ledger: DeviceDetectionResult = {
    vendor: 'ledger',
    deviceCount: ledgerDevices.length,
    devices: ledgerDevices,
  };

  return {
    trezor,
    ledger,
    anyDetected: trezorDevices.length > 0 || ledgerDevices.length > 0,
    multipleVendors: trezorDevices.length > 0 && ledgerDevices.length > 0,
  };
}

/**
 * Request access to a Ledger device via WebHID
 * This will show a browser permission prompt
 */
export async function requestLedgerAccess(): Promise<DetectedDevice | null> {
  if (!isWebHidAvailable()) {
    throw new Error('WebHID is not available in this browser');
  }

  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: VENDOR_IDS.LEDGER }],
    });

    if (devices.length === 0) {
      return null;
    }

    const device = devices[0];
    return {
      vendor: 'ledger',
      productId: device.productId,
      productName: device.productName || 'Ledger Device',
      authorized: true,
    };
  } catch (error) {
    // User cancelled the permission dialog
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return null;
    }
    throw error;
  }
}

/**
 * Get a user-friendly device name from detection info
 */
export function getDeviceDisplayName(device: DetectedDevice): string {
  if (device.productName) {
    // Clean up Ledger product names
    if (device.vendor === 'ledger') {
      if (device.productName.toLowerCase().includes('nano s plus')) {
        return 'Ledger Nano S Plus';
      }
      if (device.productName.toLowerCase().includes('nano s')) {
        return 'Ledger Nano S';
      }
      if (device.productName.toLowerCase().includes('nano x')) {
        return 'Ledger Nano X';
      }
      if (device.productName.toLowerCase().includes('stax')) {
        return 'Ledger Stax';
      }
      if (device.productName.toLowerCase().includes('flex')) {
        return 'Ledger Flex';
      }
    }

    // Clean up Trezor product names
    if (device.vendor === 'trezor') {
      if (device.productName.toLowerCase().includes('model t')) {
        return 'Trezor Model T';
      }
      if (device.productName.toLowerCase().includes('model one') || device.productName === '1') {
        return 'Trezor Model One';
      }
      if (device.productName.toLowerCase().includes('safe 3')) {
        return 'Trezor Safe 3';
      }
      if (device.productName.toLowerCase().includes('safe 5')) {
        return 'Trezor Safe 5';
      }
    }

    return device.productName;
  }

  return device.vendor === 'trezor' ? 'Trezor' : 'Ledger';
}

/**
 * Check if a specific vendor has multiple devices connected
 */
export function hasMultipleDevices(result: DeviceDetectionResult): boolean {
  return result.deviceCount > 1;
}

/**
 * Get helpful connection instructions based on detection state
 */
export function getConnectionInstructions(
  vendor: HardwareWalletVendor,
  detected: boolean
): string[] {
  const instructions: string[] = [];

  if (vendor === 'trezor') {
    instructions.push('Connect your Trezor via USB');
    instructions.push('Unlock your device with your PIN');
    if (!detected) {
      instructions.push('If using Trezor Suite, close it first');
      instructions.push('Make sure Trezor Bridge is installed');
    }
  } else if (vendor === 'ledger') {
    instructions.push('Connect your Ledger via USB');
    instructions.push('Unlock your device with your PIN');
    instructions.push('Open the Bitcoin app on your Ledger');
    if (!detected) {
      instructions.push('If using Ledger Live, close it first');
    }
  }

  return instructions;
}
