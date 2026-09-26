/**
 * A gate that holds anything depending on lock state until session recovery has run.
 *
 * A cold start can find the master key still in session storage after its session expired. The
 * key itself cannot revive that session: `getKeychainMasterKey` refuses a key whose session
 * metadata is expired or missing, and `checkSessionRecovery` removes an expired session's metadata
 * and key together. What this gate adds is order: the first keychain load waits for recovery's
 * verdict instead of racing it, and does not re-derive at all when the verdict is LOCKED —
 * including when initialisation failed, which the background reports as LOCKED.
 *
 * Hence a gate rather than a flag: a caller that arrives first waits, instead of reading a value
 * that is not yet true.
 */

import type { SessionRecoveryState } from '@/platform/auth/sessionManager';

let resolveOutcome: ((state: SessionRecoveryState) => void) | null = null;

const outcome = new Promise<SessionRecoveryState>((resolve) => {
  resolveOutcome = resolve;
});

/**
 * Record how session recovery ended. Called once, by the background worker; later calls are
 * ignored, since a second answer could only loosen the first.
 */
export function markSessionRecovery(state: SessionRecoveryState): void {
  resolveOutcome?.(state);
  resolveOutcome = null;
}

/** The outcome of session recovery, waiting for it if it has not finished. */
export function whenSessionRecovered(): Promise<SessionRecoveryState> {
  return outcome;
}
