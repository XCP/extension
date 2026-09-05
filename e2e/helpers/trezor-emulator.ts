/**
 * Trezor Emulator Helpers
 *
 * Helpers for controlling the Trezor emulator in CI/testing.
 *
 * trezor-user-env exposes a WebSocket controller on port 9001. Port 9001 is not an HTTP API.
 * The bridge runs on port 21325 (or TREZOR_BRIDGE_URL).
 */

// Configuration
const EMULATOR_CONTROLLER_URL = process.env.TREZOR_EMULATOR_CONTROLLER_URL
  || process.env.TREZOR_EMULATOR_URL
  || 'ws://127.0.0.1:9001';
const BRIDGE_URL = process.env.TREZOR_BRIDGE_URL || 'http://localhost:21325';

let controllerSocket: WebSocket | null = null;
let controllerConnection: Promise<WebSocket> | null = null;
let controllerMessageId = 0;
const controllerRequests = new Map<number, {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

function rejectControllerRequests(error: Error): void {
  for (const request of controllerRequests.values()) {
    clearTimeout(request.timeout);
    request.reject(error);
  }
  controllerRequests.clear();
}

async function getControllerSocket(): Promise<WebSocket> {
  if (controllerSocket?.readyState === WebSocket.OPEN) return controllerSocket;
  if (controllerConnection) return controllerConnection;

  controllerConnection = new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(EMULATOR_CONTROLLER_URL);
    let welcomed = false;

    const failConnection = (message: string) => {
      controllerSocket = null;
      controllerConnection = null;
      rejectControllerRequests(new Error(message));
      if (!welcomed) reject(new Error(message));
    };

    socket.addEventListener('message', (event) => {
      let response: { id?: number; type?: string; success?: boolean; error?: unknown };
      try {
        response = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (!welcomed && (response.type === 'client' || response.id === undefined)) {
        welcomed = true;
        controllerSocket = socket;
        resolve(socket);
      }

      if (response.id === undefined) return;
      const pending = controllerRequests.get(response.id);
      if (!pending) return;
      controllerRequests.delete(response.id);
      clearTimeout(pending.timeout);
      if (response.success === false) {
        pending.reject(new Error(`Trezor emulator command failed: ${String(response.error)}`));
      } else {
        pending.resolve();
      }
    });
    socket.addEventListener('error', () => failConnection('Trezor emulator controller failed'));
    socket.addEventListener('close', () => failConnection('Trezor emulator controller closed'));
  });

  return controllerConnection;
}

async function sendControllerCommand(type: string): Promise<void> {
  const socket = await getControllerSocket();
  const id = controllerMessageId++;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      controllerRequests.delete(id);
      reject(new Error(`Timed out waiting for Trezor emulator command ${type}`));
    }, 10_000);
    controllerRequests.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ type, id }));
  });
}

// Expected addresses from the test mnemonic: "all all all all all all all all all all all all"
export const EXPECTED_ADDRESSES = {
  // Native SegWit (m/84'/0'/0'/0/0)
  NATIVE_SEGWIT: 'bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk',
  P2WPKH_0_0: 'bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk',

  // Legacy (m/44'/0'/0'/0/0)
  LEGACY: '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL',
  P2PKH_0_0: '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL',

  // Nested SegWit (m/49'/0'/0'/0/0)
  NESTED_SEGWIT: '3L6TyTisPBmrDAj6RoKmDzNnj4eQi54gD2',
  P2SH_P2WPKH_0_0: '3L6TyTisPBmrDAj6RoKmDzNnj4eQi54gD2',

  // Taproot (m/86'/0'/0'/0/0)
  TAPROOT: 'bc1ptxs597p3fnpd8gwut5p467ulsydae3rp9z75hd99w8k3ljr9g9rqx6ynaw',
  P2TR_0_0: 'bc1ptxs597p3fnpd8gwut5p467ulsydae3rp9z75hd99w8k3ljr9g9rqx6ynaw',
};

/**
 * Press "Yes" on the emulator via the trezor-user-env controller.
 * Used to auto-confirm prompts during testing
 */
export async function emulatorPressYes(): Promise<void> {
  try {
    await sendControllerCommand('emulator-press-yes');
  } catch {
    // Ignore errors - emulator might not need confirmation
  }
}

/**
 * Press "No" on the emulator via the WebSocket controller.
 */
export async function emulatorPressNo(): Promise<void> {
  try {
    await sendControllerCommand('emulator-press-no');
  } catch {
    // Ignore errors
  }
}

/**
 * Check if the emulator controller is available.
 */
export async function isEmulatorAvailable(): Promise<boolean> {
  try {
    await getControllerSocket();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the Trezor Bridge is available
 */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/enumerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for a device to be detected by the bridge
 */
export async function waitForDevice(timeoutMs: number = 10000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${BRIDGE_URL}/enumerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const devices = await response.json();
        if (Array.isArray(devices) && devices.length > 0) {
          return true;
        }
      }
    } catch {
      // Continue waiting
    }

    // Wait a bit before retrying
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

/**
 * Get comprehensive emulator status
 */
export async function getEmulatorStatus(): Promise<{
  available: boolean;
  bridgeAvailable: boolean;
  deviceConnected: boolean;
}> {
  const [available, bridgeAvailable] = await Promise.all([
    isEmulatorAvailable(),
    isBridgeAvailable(),
  ]);

  let deviceConnected = false;
  if (bridgeAvailable) {
    try {
      const response = await fetch(`${BRIDGE_URL}/enumerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const devices = await response.json();
        deviceConnected = Array.isArray(devices) && devices.length > 0;
      }
    } catch {
      // Ignore
    }
  }

  return { available, bridgeAvailable, deviceConnected };
}

/**
 * Start auto-confirming on the emulator
 * Returns a function to stop the auto-confirm loop
 */
export function startAutoConfirm(intervalMs: number = 500): () => void {
  const interval = setInterval(() => {
    emulatorPressYes();
  }, intervalMs);

  return () => clearInterval(interval);
}

/**
 * Auto-confirm multiple times with delays
 */
export async function autoConfirm(times: number = 3, delayMs: number = 500): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await emulatorPressYes();
  }
}

/**
 * Release all device sessions via the bridge
 * This helps prevent "handshake failed" errors from stale sessions
 */
export async function releaseAllDeviceSessions(): Promise<void> {
  try {
    // First enumerate devices to get session info
    const enumerateResponse = await fetch(`${BRIDGE_URL}/enumerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!enumerateResponse.ok) return;

    const devices = await enumerateResponse.json();
    if (!Array.isArray(devices)) return;

    // Release each device session
    for (const device of devices) {
      if (device.session) {
        try {
          await fetch(`${BRIDGE_URL}/release/${device.session}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
        } catch {
          // Ignore release errors
        }
      }
    }
  } catch {
    // Ignore errors
  }
}
