/**
 * Hardware Wallet Operation Manager
 *
 * Provides utilities for managing hardware wallet operations:
 * - Operation timeouts
 * - Device disconnection handling
 * - Pending operation tracking
 * - Graceful abort mechanisms
 */

import { HardwareWalletError, type HardwareWalletVendor } from './types';

/**
 * Default timeout for operations (60 seconds)
 * This is longer than typical to account for user interaction on device
 */
export const DEFAULT_OPERATION_TIMEOUT_MS = 60000;

/**
 * Short timeout for quick operations like getting device info (10 seconds)
 */
export const SHORT_OPERATION_TIMEOUT_MS = 10000;

/**
 * Long timeout for operations that require multiple confirmations (120 seconds)
 */
export const LONG_OPERATION_TIMEOUT_MS = 120000;

/**
 * Operation state for tracking pending operations
 */
interface PendingOperation {
  id: string;
  vendor: HardwareWalletVendor;
  name: string;
  startTime: number;
  abortController: AbortController;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Registry of pending operations
 */
const pendingOperations = new Map<string, PendingOperation>();

/**
 * Generate a unique operation ID
 */
function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Register a pending operation for tracking
 */
export function registerOperation(
  vendor: HardwareWalletVendor,
  name: string
): { id: string; abortController: AbortController } {
  const id = generateOperationId();
  const abortController = new AbortController();

  pendingOperations.set(id, {
    id,
    vendor,
    name,
    startTime: Date.now(),
    abortController,
  });

  return { id, abortController };
}

/**
 * Complete (remove) a pending operation
 */
export function completeOperation(id: string): void {
  const operation = pendingOperations.get(id);
  if (operation) {
    if (operation.timeoutId) {
      clearTimeout(operation.timeoutId);
    }
    pendingOperations.delete(id);
  }
}

/**
 * Abort a pending operation
 */
export function abortOperation(id: string, reason?: string): void {
  const operation = pendingOperations.get(id);
  if (operation) {
    operation.abortController.abort(reason);
    if (operation.timeoutId) {
      clearTimeout(operation.timeoutId);
    }
    pendingOperations.delete(id);
  }
}

/**
 * Abort all pending operations for a vendor (e.g., on device disconnect)
 */
export function abortAllOperations(vendor: HardwareWalletVendor, reason?: string): number {
  let abortedCount = 0;
  for (const [id, operation] of pendingOperations) {
    if (operation.vendor === vendor) {
      operation.abortController.abort(reason ?? 'Device disconnected');
      if (operation.timeoutId) {
        clearTimeout(operation.timeoutId);
      }
      pendingOperations.delete(id);
      abortedCount++;
    }
  }
  return abortedCount;
}

/**
 * Get count of pending operations for a vendor
 */
export function getPendingOperationCount(vendor: HardwareWalletVendor): number {
  let count = 0;
  for (const operation of pendingOperations.values()) {
    if (operation.vendor === vendor) {
      count++;
    }
  }
  return count;
}

/**
 * Check if an abort signal is aborted
 */
function checkAborted(signal: AbortSignal, vendor: HardwareWalletVendor, operation: string): void {
  if (signal.aborted) {
    throw new HardwareWalletError(
      `Operation aborted: ${operation}`,
      'OPERATION_ABORTED',
      vendor,
      'The operation was cancelled. Please try again.'
    );
  }
}

/**
 * Wrap an async operation with timeout and abort handling
 *
 * @param promise - The promise to wrap
 * @param vendor - The hardware wallet vendor
 * @param operationName - Human-readable operation name for error messages
 * @param timeoutMs - Timeout in milliseconds (default: 60 seconds)
 * @param abortSignal - Optional abort signal for cancellation
 * @returns The result of the promise
 * @throws HardwareWalletError on timeout or abort
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  vendor: HardwareWalletVendor,
  operationName: string,
  timeoutMs: number = DEFAULT_OPERATION_TIMEOUT_MS,
  abortSignal?: AbortSignal
): Promise<T> {
  // Check if already aborted
  if (abortSignal?.aborted) {
    throw new HardwareWalletError(
      `Operation aborted before start: ${operationName}`,
      'OPERATION_ABORTED',
      vendor,
      'The operation was cancelled.'
    );
  }

  return new Promise<T>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    // Set up abort listener
    const abortHandler = () => {
      if (!settled) {
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(
          new HardwareWalletError(
            `Operation aborted: ${operationName}`,
            'OPERATION_ABORTED',
            vendor,
            'The operation was cancelled. Please try again.'
          )
        );
      }
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        reject(
          new HardwareWalletError(
            `Operation timed out after ${timeoutMs}ms: ${operationName}`,
            'OPERATION_TIMEOUT',
            vendor,
            `The operation took too long. Please check your ${vendor === 'trezor' ? 'Trezor' : 'Ledger'} device and try again.`
          )
        );
      }
    }, timeoutMs);

    // Execute the promise
    promise
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          if (abortSignal) {
            abortSignal.removeEventListener('abort', abortHandler);
          }
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          if (abortSignal) {
            abortSignal.removeEventListener('abort', abortHandler);
          }
          reject(error);
        }
      });
  });
}

/**
 * Create a managed operation that tracks state and handles timeouts
 *
 * @param vendor - The hardware wallet vendor
 * @param operationName - Human-readable operation name
 * @param executor - Function that performs the operation
 * @param timeoutMs - Timeout in milliseconds
 * @returns The result of the operation
 */
export async function managedOperation<T>(
  vendor: HardwareWalletVendor,
  operationName: string,
  executor: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_OPERATION_TIMEOUT_MS
): Promise<T> {
  const { id, abortController } = registerOperation(vendor, operationName);

  try {
    const result = await withTimeout(
      executor(abortController.signal),
      vendor,
      operationName,
      timeoutMs,
      abortController.signal
    );
    return result;
  } finally {
    completeOperation(id);
  }
}

/**
 * Firmware version requirements for different features
 */
export interface FirmwareRequirements {
  trezor: {
    /** Minimum firmware for Model T */
    modelT: string;
    /** Minimum firmware for Model One */
    modelOne: string;
  };
  ledger: {
    /** Minimum Bitcoin app version */
    bitcoinApp: string;
  };
}

/**
 * Firmware requirements by feature
 */
export const FIRMWARE_REQUIREMENTS: Record<string, FirmwareRequirements> = {
  taproot: {
    trezor: {
      modelT: '2.4.3',
      modelOne: '1.10.4',
    },
    ledger: {
      bitcoinApp: '2.0.0',
    },
  },
  segwit: {
    trezor: {
      modelT: '2.0.0',
      modelOne: '1.6.0',
    },
    ledger: {
      bitcoinApp: '1.3.0',
    },
  },
};

/**
 * Compare semantic version strings
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }
  return 0;
}

/**
 * Check if a firmware version meets the minimum requirement
 */
export function isFirmwareSufficient(
  current: string | undefined,
  required: string
): boolean {
  if (!current) return false;
  return compareVersions(current, required) >= 0;
}

/**
 * Validate firmware for a specific feature
 */
export function validateFirmwareForFeature(
  vendor: HardwareWalletVendor,
  feature: string,
  firmwareVersion: string | undefined,
  model?: string
): { valid: boolean; requiredVersion?: string; message?: string } {
  const requirements = FIRMWARE_REQUIREMENTS[feature];
  if (!requirements) {
    // No requirements defined for this feature
    return { valid: true };
  }

  if (!firmwareVersion) {
    return {
      valid: false,
      message: 'Unable to determine firmware version. Please ensure your device is connected.',
    };
  }

  if (vendor === 'trezor') {
    const isModelOne = model?.toLowerCase().includes('one') || model === '1';
    const requiredVersion = isModelOne
      ? requirements.trezor.modelOne
      : requirements.trezor.modelT;

    if (!isFirmwareSufficient(firmwareVersion, requiredVersion)) {
      return {
        valid: false,
        requiredVersion,
        message: `This feature requires Trezor firmware ${requiredVersion} or later. Your device has ${firmwareVersion}.`,
      };
    }
  } else if (vendor === 'ledger') {
    const requiredVersion = requirements.ledger.bitcoinApp;
    if (!isFirmwareSufficient(firmwareVersion, requiredVersion)) {
      return {
        valid: false,
        requiredVersion,
        message: `This feature requires Ledger Bitcoin app ${requiredVersion} or later.`,
      };
    }
  }

  return { valid: true };
}

/**
 * User-friendly error messages for common hardware wallet errors
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // Connection errors
  DEVICE_NOT_FOUND: 'No hardware wallet found. Please connect your device and try again.',
  DEVICE_LOCKED: 'Your device is locked. Please unlock it and try again.',
  DEVICE_BUSY: 'Your device is busy with another operation. Please wait and try again.',
  PERMISSION_DENIED: 'Permission denied. Please allow access to your hardware wallet.',

  // Operation errors
  USER_CANCELLED: 'You cancelled the operation on your device.',
  OPERATION_TIMEOUT: 'The operation timed out. Please try again.',
  OPERATION_ABORTED: 'The operation was cancelled.',

  // Signing errors
  INSUFFICIENT_FUNDS: 'Insufficient funds for this transaction.',
  INVALID_ADDRESS: 'Invalid address format.',
  SIGN_TX_FAILED: 'Failed to sign the transaction. Please check the details and try again.',
  SIGN_MESSAGE_FAILED: 'Failed to sign the message. Please try again.',

  // Firmware errors
  FIRMWARE_UPDATE_REQUIRED: 'Please update your device firmware to use this feature.',
  UNSUPPORTED_OPERATION: 'This operation is not supported by your device.',

  // Generic
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

/**
 * Get a user-friendly error message for an error code
 */
export function getUserMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? ERROR_MESSAGES.UNKNOWN_ERROR;
}
