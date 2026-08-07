/**
 * A gate that holds anything depending on lock state until session recovery has run.
 *
 * On expiry `checkSessionRecovery` clears the session *metadata*, but the master key is cleared
 * separately, by the lock that follows it. So on every cold start there is a window where an
 * expired session still has a usable key in session storage, and anything re-deriving from it
 * before recovery has run would revive a session that had already timed out — turning auto-lock
 * into a no-op.
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
