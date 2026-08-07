/**
 * A gate that holds anything depending on lock state until session recovery has run.
 *
 * The background worker registers its listeners synchronously and then initialises the rest in the
 * background, because MV3 requires listeners to exist in the first turn of the event loop. Session
 * recovery — the check that decides whether an idle or expired session is still usable — is one of
 * the last steps of that initialisation, while the proxy that answers dApp requests is one of the
 * first.
 *
 * That ordering matters more than it looks. On expiry `checkSessionRecovery` clears the session
 * *metadata*, but the master key is cleared separately, by the lock that follows it. So there is a
 * window on every cold start where an expired session still has a usable key sitting in session
 * storage. Anything that re-derives from that key before recovery has run would silently revive a
 * session that had already timed out, turning auto-lock into a no-op.
 *
 * Hence a gate rather than a flag: callers await the outcome, and a caller that arrives first waits
 * rather than reading a value that is not yet true.
 */

import type { SessionRecoveryState } from '@/platform/auth/sessionManager';

let resolveOutcome: ((state: SessionRecoveryState) => void) | null = null;

const outcome = new Promise<SessionRecoveryState>((resolve) => {
  resolveOutcome = resolve;
});

/**
 * Record how session recovery ended. Called once, by the background worker.
 *
 * Later calls are ignored: the first answer is the one the gate was waiting for, and a second would
 * only be able to loosen it.
 */
export function markSessionRecovery(state: SessionRecoveryState): void {
  resolveOutcome?.(state);
  resolveOutcome = null;
}

/**
 * The outcome of session recovery, waiting for it if it has not finished.
 *
 * Resolves to `LOCKED` when initialisation failed, because a recovery that did not run cannot be
 * read as permission to re-derive a key.
 */
export function whenSessionRecovered(): Promise<SessionRecoveryState> {
  return outcome;
}
