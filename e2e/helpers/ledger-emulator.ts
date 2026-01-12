/**
 * Ledger Speculos Emulator Test Helpers
 *
 * Utilities for communicating with the Ledger Speculos emulator in e2e tests.
 * Speculos is Ledger's device emulator for testing.
 *
 * The Speculos container exposes:
 * - HTTP API: localhost:5000 (emulator control and button presses)
 * - APDU: localhost:9999 (direct APDU communication)
 */

// Speculos API endpoint
const SPECULOS_API = process.env.LEDGER_SPECULOS_URL || 'http://localhost:5000';

/**
 * Press the right button on the Ledger emulator
 * Used to confirm/navigate on Nano S/X devices
 */
export async function speculosPressRight(): Promise<void> {
  try {
    await fetch(`${SPECULOS_API}/button/right`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'press-and-release' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Ignore errors - emulator might not need input
  }
}

/**
 * Press the left button on the Ledger emulator
 * Used to go back/cancel on Nano S/X devices
 */
export async function speculosPressLeft(): Promise<void> {
  try {
    await fetch(`${SPECULOS_API}/button/left`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'press-and-release' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Press both buttons simultaneously on the Ledger emulator
 * Used to confirm selections on Nano S/X devices
 */
export async function speculosPressBoth(): Promise<void> {
  try {
    await fetch(`${SPECULOS_API}/button/both`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'press-and-release' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Navigate right and confirm (common pattern for approving operations)
 * Presses right button multiple times then both buttons to confirm
 */
export async function speculosNavigateAndConfirm(rightPresses: number = 1): Promise<void> {
  for (let i = 0; i < rightPresses; i++) {
    await speculosPressRight();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await speculosPressBoth();
}

/**
 * Touch event for Stax/Flex devices (touch screen)
 */
export async function speculosTouch(x: number, y: number): Promise<void> {
  try {
    await fetch(`${SPECULOS_API}/finger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, action: 'press-and-release' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Get current screen text from Speculos
 * Useful for debugging and verifying prompts
 */
export async function speculosGetScreen(): Promise<string[]> {
  try {
    const response = await fetch(`${SPECULOS_API}/events?currentscreenonly=true`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      return data.events?.map((e: any) => e.text).filter(Boolean) || [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if Speculos is running and reachable
 */
export async function isSpeculosAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${SPECULOS_API}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get Speculos emulator status
 */
export async function getSpeculosStatus(): Promise<{ available: boolean; model?: string }> {
  try {
    const response = await fetch(`${SPECULOS_API}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        model: data.model || 'unknown',
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Auto-confirm helper that presses right then both buttons repeatedly
 * Useful for confirming multi-screen operations
 */
export async function autoConfirmLedger(screens: number = 3, delayMs: number = 300): Promise<void> {
  for (let i = 0; i < screens; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await speculosPressRight();
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await speculosPressBoth();
}

/**
 * Start auto-confirm loop that runs in background
 * Automatically navigates right and confirms
 * Returns a stop function
 */
export function startLedgerAutoConfirm(delayMs: number = 500): () => void {
  let running = true;

  const loop = async () => {
    while (running) {
      // Navigate right through screens
      await speculosPressRight();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      // Try to confirm
      await speculosPressBoth();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  };

  loop();

  return () => {
    running = false;
  };
}

/**
 * Wait for Speculos to be ready
 */
export async function waitForSpeculos(timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await isSpeculosAvailable()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Standard test mnemonic (same as used in Trezor tests)
 * Generates known addresses for testing
 */
export const TEST_MNEMONIC = 'all all all all all all all all all all all all';

/**
 * Expected addresses from the TEST_MNEMONIC for verification
 * These are the first addresses (index 0) for each address format
 * Note: These should match the Trezor addresses since they use the same mnemonic
 */
export const EXPECTED_ADDRESSES = {
  // Native SegWit (m/84'/0'/0'/0/0)
  P2WPKH_0_0: 'bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk',
  // Legacy (m/44'/0'/0'/0/0)
  P2PKH_0_0: '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL',
  // Nested SegWit (m/49'/0'/0'/0/0)
  P2SH_P2WPKH_0_0: '3L6TyTisPBmrDAj6RoKmDzNnj4eQi54gD2',
  // Taproot (m/86'/0'/0'/0/0)
  P2TR_0_0: 'bc1pswrqtykue8r89t9u4rprjs0gt4qzkdfuursfnvqaa3f2yql07zmq8s8a5u',
};

/**
 * Speculos status result
 */
export interface SpeculosStatus {
  available: boolean;
  model?: string;
}

/**
 * Get full Speculos status
 */
export async function getFullSpeculosStatus(): Promise<SpeculosStatus> {
  return getSpeculosStatus();
}

/**
 * Set automation rules for Speculos
 * This can auto-approve specific prompts
 */
export async function setSpeculosAutomation(rules: Array<{ text: string; actions: string[] }>): Promise<void> {
  try {
    await fetch(`${SPECULOS_API}/automation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Clear automation rules
 */
export async function clearSpeculosAutomation(): Promise<void> {
  try {
    await fetch(`${SPECULOS_API}/automation`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Setup automation to auto-approve common Bitcoin app prompts
 */
export async function setupBitcoinAppAutomation(): Promise<void> {
  const rules = [
    { text: 'Approve', actions: ['both'] },
    { text: 'Sign', actions: ['both'] },
    { text: 'Accept', actions: ['both'] },
    { text: 'Confirm', actions: ['both'] },
  ];
  await setSpeculosAutomation(rules);
}
