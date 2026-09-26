/**
 * Host access to Trezor Suite Web, which Trezor Connect 10 needs: Suite hosts every approval
 * screen, and Connect's message channel reads that tab's URL, which Chrome hides without it.
 *
 * The permission is optional (see wxt.config.ts), so the wallet asks for it the first time
 * someone uses a Trezor, never at update time. Chrome shows its prompt only in answer to a click
 * in an extension page, so `request` belongs in click handlers; the background can only check.
 */
import { HardwareWalletError } from '@/core/hardware/types';
import { TREZOR_SUITE_ORIGINS } from '@/platform/suiteOrigins';

export { TREZOR_SUITE_ORIGINS };

function permissionsApi(): typeof chrome.permissions | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.permissions;
}

/** True when granted, or where the API does not exist (Node, the emulator suite). */
export async function hasTrezorSuiteAccess(): Promise<boolean> {
  const permissions = permissionsApi();
  if (!permissions?.contains) return true;
  return permissions.contains({ origins: TREZOR_SUITE_ORIGINS });
}

/** Asks Chrome, resolving immediately when already granted. Call it first in a click handler. */
export async function requestTrezorSuiteAccess(): Promise<boolean> {
  const permissions = permissionsApi();
  if (!permissions?.request) return true;
  return permissions.request({ origins: TREZOR_SUITE_ORIGINS });
}

export function suiteAccessRequiredError(): HardwareWalletError {
  return new HardwareWalletError(
    'Trezor Suite access has not been granted',
    'SUITE_ACCESS_REQUIRED',
    'trezor',
    'Allow Trezor access on the home screen, then try again.',
  );
}

/** The user answered Chrome's prompt with Deny. */
export function suiteAccessDeniedError(): HardwareWalletError {
  return new HardwareWalletError(
    'Trezor Suite access was denied',
    'SUITE_ACCESS_DENIED',
    'trezor',
    'Connect again and choose Allow.',
  );
}

/** Stops a Trezor call before Suite opens, instead of it failing later as a handshake error. */
export async function assertTrezorSuiteAccess(): Promise<void> {
  if (!(await hasTrezorSuiteAccess())) throw suiteAccessRequiredError();
}
