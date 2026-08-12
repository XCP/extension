/**
 * Deciding what is worth a notification, kept away from the browser and the network.
 *
 * Everything here is a pure function over "what the node reports now" plus "what we already told
 * the user about". That split is the point: the part that can double-notify, replay a year of
 * history on first run, or announce a stranger's dispense is the part that has to be testable
 * without a browser.
 *
 * The input is core's `address_events` feed, which already carries every event touching a watched
 * address, typed and with a monotonic `event_index`. That index is the watermark, and the rule that
 * makes this bearable is: on first sight, adopt the current position *silently*. Someone switching
 * this on does not want to hear about last year.
 */

/** What the poller remembers between runs. One watermark covers every watched address. */
export interface NotificationState {
  /**
   * Highest `event_index` already announced. Undefined means nothing has been polled yet — adopt
   * the position and stay quiet.
   */
  lastEventIndex?: number;
}

/** A notification decided on but not yet handed to the browser. */
export interface PendingNotification {
  /**
   * Stable per event, so re-running a poll over the same data replaces the notification rather
   * than stacking a second copy — the notifications API treats a repeated id as an update.
   */
  id: string;
  title: string;
  message: string;
  /** Where to send the user when they click it. */
  route: string;
}

/** One row of core's address events feed. `params` varies by event type. */
export interface AddressEvent {
  event_index: number;
  event: string;
  params?: Record<string, unknown>;
}

/**
 * Never raise more than this many at once. A wallet that was closed over a busy weekend should
 * produce a handful of notifications and a summary, not ninety separate alerts.
 */
export const MAX_NOTIFICATIONS_PER_POLL = 5;

/** The events asked for. Sent to the node as a server-side filter, so nothing else arrives. */
export const WATCHED_EVENTS = ['DISPENSE', 'ORDER_MATCH'] as const;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * A dispense touches two addresses and means opposite things to each. `source` is the dispenser —
 * the seller — and `destination` is whoever paid. Reporting both as "sold" would tell a buyer their
 * dispenser sold something they actually just bought.
 */
function describeDispense(
  params: Record<string, unknown>,
  watched: ReadonlySet<string>
): { title: string; message: string } | null {
  const asset = asString(params.asset) ?? 'an asset';
  const amount = asString(params.dispense_quantity_normalized);
  const quantity = amount ? `${amount} ${asset}` : asset;

  const source = asString(params.source);
  const destination = asString(params.destination);

  if (source && watched.has(source)) {
    return { title: 'Dispenser sold', message: `${quantity} dispensed` };
  }
  if (destination && watched.has(destination)) {
    return { title: 'Dispense received', message: `${quantity} received` };
  }
  // Neither side is ours. The node filters by address, so this should not arrive — and if it does,
  // announcing a stranger's trade is worse than staying quiet.
  return null;
}

function describeOrderMatch(params: Record<string, unknown>): { title: string; message: string } {
  const give = asString(params.forward_asset) ?? asString(params.give_asset);
  const get = asString(params.backward_asset) ?? asString(params.get_asset);
  return {
    title: 'Order matched',
    message: give && get ? `${give} for ${get}` : 'One of your orders matched',
  };
}

/**
 * Turn a page of address events into notifications.
 *
 * `events` is newest-first, as the node returns it. `watched` decides which side of a two-sided
 * event we are on. Only entries strictly above the watermark are announced, so a poll racing
 * another poll, or re-running after the worker restarts, cannot say the same thing twice.
 */
export function detectFromEvents(
  events: AddressEvent[],
  state: NotificationState,
  watched: ReadonlySet<string>
): { notifications: PendingNotification[]; state: NotificationState; suppressed: number } {
  if (events.length === 0) return { notifications: [], state, suppressed: 0 };

  const highest = events.reduce(
    (max, event) => (event.event_index > max ? event.event_index : max),
    events[0]!.event_index
  );

  // First sight: take the position, say nothing.
  if (state.lastEventIndex === undefined) {
    return { notifications: [], state: { lastEventIndex: highest }, suppressed: 0 };
  }

  const watermark = state.lastEventIndex;
  const fresh = events.filter((event) => event.event_index > watermark);

  const all: PendingNotification[] = [];
  for (const event of fresh) {
    const params = event.params ?? {};
    const described =
      event.event === 'DISPENSE'
        ? describeDispense(params, watched)
        : event.event === 'ORDER_MATCH'
          ? describeOrderMatch(params)
          : null;
    if (!described) continue;

    const txHash = asString(params.tx_hash);
    all.push({
      id: `${event.event}:${event.event_index}`,
      title: described.title,
      message: described.message,
      route: txHash ? `/transactions/${txHash}` : '/index',
    });
  }

  // The watermark advances past everything read, including events that produced no notification —
  // they have been considered, and re-reading them next poll would only re-skip them.
  return {
    notifications: all.slice(0, MAX_NOTIFICATIONS_PER_POLL),
    state: { lastEventIndex: highest },
    suppressed: Math.max(0, all.length - MAX_NOTIFICATIONS_PER_POLL),
  };
}
