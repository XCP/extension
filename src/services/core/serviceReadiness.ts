/**
 * The barrier every proxied service call crosses before it is dispatched.
 *
 * MV3 requires listeners to be registered in the first turn of the event loop, so the background
 * registers its service ports immediately and finishes initialising afterwards. Without a barrier
 * that means a request arriving at a waking worker is answered by a worker that has not yet decided
 * whether the session survives, nor loaded the keychain it would answer from — and the answers it
 * gives in that window are wrong in the worst direction: a connected origin reads as disconnected,
 * an unlocked wallet reads as locked.
 *
 * One barrier at the boundary rather than a check inside each method. A method added tomorrow is
 * covered without its author knowing this problem exists, which is the only kind of guard that
 * survives contact with a growing codebase.
 *
 * Bounded, because a barrier that can hang is worse than the bug it prevents: a caller waiting
 * forever takes the popup down with it. On timeout the call fails rather than proceeding — an
 * initialisation that never finished cannot vouch for anything, so answering anyway is exactly what
 * this exists to stop.
 */

/** How long a call waits for initialisation before failing. Generous; init is normally instant. */
const READY_TIMEOUT_MS = 10_000;

let resolveReady: (() => void) | null = null;

const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

/** Open the barrier. Called once, by the background, after initialisation completes. */
export function markServicesReady(): void {
  resolveReady?.();
  resolveReady = null;
}

/**
 * Wait for initialisation to finish.
 *
 * @throws when initialisation has not finished in time, so the caller gets a definite failure
 *   instead of a promise that never settles.
 */
export async function whenServicesReady(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Wallet is still starting up; please try again.')),
          READY_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
