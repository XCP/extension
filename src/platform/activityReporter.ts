/** Page-side activity batching. The caller supplies the service-client report function. */

/**
 * The shortest gap between two activity reports to the background. The shortest auto-lock
 * timeout is a minute, so this leaves the background's deadline at least 30 seconds of margin.
 */
export const ACTIVITY_REPORT_INTERVAL_MS = 30_000;

export interface ActivityReporter {
  /** Note activity now. Reported at once if the last report is old enough, else batched. */
  activity: () => void;
  /** Report any batched activity now (the popup is closing). */
  flush: () => void;
  /** Drop any batched activity and stop the timer. */
  dispose: () => void;
}

/**
 * Batch activity reports to the background, which each cost an RPC, a session-storage write and
 * an alarm reschedule. Throttled to one per 200ms, mouse movement alone used to send five a second.
 *
 * Each report carries the time of the latest activity it covers, not the time it was sent, so the
 * background's auto-lock deadline stays the configured timeout after the user really stopped. The
 * interval is measured between reported activity times: activity is reported no later than
 * `interval` after the previously reported activity, which the background's deadline is always at
 * least a minute after, so a batched report cannot arrive after the session it extends has expired.
 * A closing popup flushes what is batched; were that report lost, the wallet would lock up to
 * `interval` early, never late.
 */
export function createActivityReporter(
  report: (activityTime: number) => void,
  interval: number = ACTIVITY_REPORT_INTERVAL_MS,
): ActivityReporter {
  let lastReported = Number.NEGATIVE_INFINITY;
  let pending: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending === null) return;
    const activityTime = pending;
    pending = null;
    lastReported = activityTime;
    report(activityTime);
  };

  return {
    activity: () => {
      const now = Date.now();
      pending = now;
      if (now - lastReported >= interval) {
        flush();
        return;
      }
      timer ??= setTimeout(flush, lastReported + interval - now);
    },
    flush,
    dispose: () => {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
