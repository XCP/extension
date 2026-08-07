/**
 * The barrier every proxied service call crosses before it is dispatched.
 *
 * MV3 requires listeners in the first turn of the event loop, so the background registers its
 * service ports immediately and initialises afterwards. In that window a waking worker answers
 * from state it has not loaded, and answers wrong in the worst direction: a connected origin reads
 * as disconnected, an unlocked wallet as locked.
 *
 * One barrier at the boundary, not a check inside each method, so a method added later is covered
 * without its author knowing this problem exists.
 *
 * Bounded, because a caller waiting forever takes the popup down with it. On timeout the call
 * fails rather than proceeding — an initialisation that never finished cannot vouch for anything.
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
 * @throws when it has not finished in time, so the caller gets a definite failure rather than a
 *   promise that never settles.
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
