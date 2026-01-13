/**
 * Trezor Emulator Test Helpers
 *
 * Utilities for communicating with the Trezor emulator in e2e tests.
 * Based on patterns from @trezor/trezor-user-env-link.
 *
 * The trezor-user-env container exposes:
 * - Bridge: localhost:21325 (Trezor Bridge API)
 * - HTTP API: localhost:9001 (emulator control)
 */

// Emulator control API endpoints
const EMULATOR_HTTP_API = 'http://localhost:9001';
const BRIDGE_API = 'http://localhost:21325';

/**
 * Send a command to the Trezor emulator via HTTP API
 */
export async function emulatorHttpCommand(
  command: string,
  params?: Record<string, any>
): Promise<any> {
  const url = new URL(`/emulator/${command}`, EMULATOR_HTTP_API);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Emulator HTTP command failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

/**
 * Press "Yes" button on the Trezor emulator
 * This confirms any pending operation on the emulator screen
 */
export async function emulatorPressYes(): Promise<void> {
  try {
    await emulatorHttpCommand('decision', { value: 'true' });
  } catch {
    // Ignore errors - emulator might not need confirmation
  }
}

/**
 * Press "No" button on the Trezor emulator
 */
export async function emulatorPressNo(): Promise<void> {
  try {
    await emulatorHttpCommand('decision', { value: 'false' });
  } catch {
    // Ignore errors
  }
}

/**
 * Swipe on the Trezor emulator (for Model T)
 */
export async function emulatorSwipe(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
  try {
    await emulatorHttpCommand('swipe', { direction });
  } catch {
    // Ignore errors
  }
}

/**
 * Input text on the Trezor emulator (for passphrase entry)
 */
export async function emulatorInputText(text: string): Promise<void> {
  try {
    await emulatorHttpCommand('input', { text });
  } catch {
    // Ignore errors
  }
}

/**
 * Check if the Trezor emulator is running and reachable
 */
export async function isEmulatorAvailable(): Promise<boolean> {
  try {
    // Try to reach the HTTP API
    const response = await fetch(`${EMULATOR_HTTP_API}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if the Trezor Bridge is running
 */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const response = await fetch(BRIDGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of devices from Trezor Bridge
 */
export async function getBridgeDevices(): Promise<any[]> {
  try {
    const response = await fetch(`${BRIDGE_API}/enumerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return response.json();
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Auto-confirm helper that repeatedly presses Yes
 * Useful for confirming multi-step operations
 */
export async function autoConfirm(times: number = 3, delayMs: number = 500): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await emulatorPressYes();
  }
}

/**
 * Start auto-confirm loop that runs in background
 * Returns a stop function
 */
export function startAutoConfirm(delayMs: number = 300): () => void {
  let running = true;

  const loop = async () => {
    while (running) {
      await emulatorPressYes();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  };

  loop();

  return () => {
    running = false;
  };
}

/**
 * Wait for the emulator to be ready
 */
export async function waitForEmulator(timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await isEmulatorAvailable()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Wait for bridge to detect a device
 */
export async function waitForDevice(timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const devices = await getBridgeDevices();
    if (devices && devices.length > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Standard test mnemonic (same as Trezor's test suite)
 * Generates known addresses for testing
 */
export const TEST_MNEMONIC = 'all all all all all all all all all all all all';

/**
 * Expected addresses from the TEST_MNEMONIC for verification
 * These are the first addresses (index 0) for each address format
 */
export const EXPECTED_ADDRESSES = {
  // Native SegWit (m/84'/0'/0'/0/0)
  P2WPKH_0_0: 'bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk',
  // Legacy (m/44'/0'/0'/0/0)
  P2PKH_0_0: '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL',
  // Nested SegWit (m/49'/0'/0'/0/0)
  P2SH_P2WPKH_0_0: '3L6TyTisPBmrDAj6RoKmDzNnj4eQi54gD2',
  // Taproot (m/86'/0'/0'/0/0) - Note: Verify this address when testing
  P2TR_0_0: 'bc1pswrqtykue8r89t9u4rprjs0gt4qzkdfuursfnvqaa3f2yql07zmq8s8a5u',
};

/**
 * Emulator status result
 */
export interface EmulatorStatus {
  available: boolean;
  bridgeAvailable: boolean;
  deviceConnected: boolean;
}

/**
 * Release all device sessions via the bridge
 * This helps when previous tests left the device in a busy state
 */
export async function releaseAllDeviceSessions(): Promise<void> {
  try {
    // First enumerate to get current devices
    const enumResponse = await fetch(`${BRIDGE_API}/enumerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });

    if (!enumResponse.ok) return;

    const devices = await enumResponse.json();
    if (!Array.isArray(devices)) return;

    // Release any sessions that exist
    for (const device of devices) {
      if (device.session) {
        try {
          await fetch(`${BRIDGE_API}/release/${device.session}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(2000),
          });
          console.log(`Released session ${device.session} for device ${device.path}`);
        } catch {
          // Ignore errors releasing sessions
        }
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Reset the emulator via WebSocket controller
 * This is more thorough than just releasing sessions
 */
export async function resetEmulatorViaWebSocket(): Promise<boolean> {
  try {
    // The WebSocket controller on port 9001 can reset the emulator
    // We'll try to restart just the emulator part
    const response = await fetch(`${EMULATOR_HTTP_API}/client/emulator-wipe`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get full emulator status
 */
export async function getEmulatorStatus(): Promise<EmulatorStatus> {
  const [available, bridgeAvailable] = await Promise.all([
    isEmulatorAvailable(),
    isBridgeAvailable(),
  ]);

  let deviceConnected = false;
  if (bridgeAvailable) {
    const devices = await getBridgeDevices();
    deviceConnected = devices && devices.length > 0;
  }

  return {
    available,
    bridgeAvailable,
    deviceConnected,
  };
}
