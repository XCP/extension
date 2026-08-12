/**
 * On-chain notifications: telling you about things you did not do.
 *
 * A dispenser selling, an order matching — events that arrive without you asking, which is exactly
 * the set worth interrupting someone for. Anything you initiated yourself already has a screen.
 *
 * ## Why this keeps its own copy of the addresses
 *
 * Settings live inside the keychain, and `getActiveSettings()` reads as defaults while the wallet
 * is locked. The wallet auto-locks after five minutes by default, so a poller that could only read
 * settings would be asleep almost exactly when notifications are worth having. The enable flag and
 * the address list are therefore mirrored into `chrome.storage.local`, which the service worker can
 * read locked or not.
 *
 * That is a real trade, and the settings copy says so: addresses are public data, but this writes
 * them somewhere unencrypted that they were not before. Switching the feature off deletes them.
 *
 * ## What keeps this off the node's back
 *
 * One request per poll, covering every watched address at once. Core's `/v2/addresses/events` takes
 * a comma-separated list and filters by event name server-side, so cost is flat in the number of
 * addresses rather than a call per address per event type. Beyond that:
 *
 * - the tick is slow (see `POLL_PERIOD_MINUTES`) and the page is small;
 * - a failing node backs the poller off exponentially instead of retrying every tick;
 * - nothing is requested at all when the feature is off, the permission is missing, or there are no
 *   addresses to watch — for most installs the steady-state traffic is zero;
 * - the address list is capped, so one enormous wallet cannot turn one request into a huge one.
 */

import { fetchAddressEvents } from '@/core/counterparty/api';
import {
  type AddressEvent,
  detectFromEvents,
  MAX_NOTIFICATIONS_PER_POLL,
  type NotificationState,
  type PendingNotification,
  WATCHED_EVENTS,
} from '@/core/notifications/detect';

const STORAGE_KEY = 'notificationWatch';

/**
 * How often the alarm fires. Blocks arrive about every ten minutes, so a two-minute tick already
 * costs several redundant polls per block; anything faster buys latency nobody asked for at a
 * multiple of the traffic. Chrome's floor for periodic alarms is well below this.
 */
export const POLL_PERIOD_MINUTES = 2;

/**
 * Events read per poll. Enough that an ordinary gap is covered by one request, small enough that
 * the response stays trivial. A wallet that missed more than this shows the cap's worth and
 * summarises the rest, rather than paging back through history it would not display anyway.
 */
const PAGE_SIZE = 25;

/**
 * Addresses per request. The list travels in the query string, so an unbounded wallet would build
 * an unbounded URL; watching the first slice is a better failure than a request the node rejects.
 */
const MAX_WATCHED_ADDRESSES = 20;

/** Consecutive failures double the wait, up to this many ticks skipped. */
const MAX_BACKOFF_TICKS = 15;

/** The mirror the service worker reads. Deliberately not the keychain's settings. */
export interface NotificationWatch {
  enabled: boolean;
  addresses: string[];
  state?: NotificationState;
  /** Ticks still to skip before the next attempt, after a failure. */
  backoffTicks?: number;
  /** Consecutive failures, which is what the backoff doubles on. */
  failures?: number;
}

const EMPTY_WATCH: NotificationWatch = { enabled: false, addresses: [] };

export async function readWatch(): Promise<NotificationWatch> {
  if (!chrome?.storage?.local) return EMPTY_WATCH;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    if (!value || typeof value !== 'object') return EMPTY_WATCH;
    const watch = value as Partial<NotificationWatch>;
    return {
      enabled: watch.enabled === true,
      addresses: Array.isArray(watch.addresses)
        ? watch.addresses.filter((a): a is string => typeof a === 'string')
        : [],
      state: watch.state && typeof watch.state === 'object' ? watch.state : undefined,
      backoffTicks: typeof watch.backoffTicks === 'number' ? watch.backoffTicks : undefined,
      failures: typeof watch.failures === 'number' ? watch.failures : undefined,
    };
  } catch {
    return EMPTY_WATCH;
  }
}

async function writeWatch(watch: NotificationWatch): Promise<void> {
  if (!chrome?.storage?.local) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: watch });
  } catch (error) {
    console.error('[Notifications] Could not persist watch state:', error);
  }
}

/**
 * Point the poller at a set of addresses, or switch it off.
 *
 * Disabling deletes the record rather than setting a flag beside it: the addresses are the part
 * worth not leaving behind. The watermark goes with them, so re-enabling starts quiet instead of
 * announcing everything that happened while it was off.
 */
export async function setNotificationWatch(enabled: boolean, addresses: string[]): Promise<void> {
  if (!enabled) {
    if (chrome?.storage?.local) {
      try {
        await chrome.storage.local.remove(STORAGE_KEY);
      } catch (error) {
        console.error('[Notifications] Could not clear watch state:', error);
      }
    }
    return;
  }

  const existing = await readWatch();
  const watched = addresses.slice(0, MAX_WATCHED_ADDRESSES);
  // A watermark is only meaningful for the set it was taken against: widening the set leaves older
  // events for the new addresses sitting below it, never to be seen. Dropping it re-adopts a
  // position on the next poll, which is silent by design.
  const sameSet =
    existing.addresses.length === watched.length
    && watched.every((address) => existing.addresses.includes(address));

  await writeWatch({
    enabled: true,
    addresses: watched,
    state: sameSet ? existing.state : undefined,
  });
}

/** Whether the browser has actually granted the optional permission. */
export async function hasNotificationPermission(): Promise<boolean> {
  if (!chrome?.permissions?.contains) return false;
  try {
    return await chrome.permissions.contains({ permissions: ['notifications'] });
  } catch {
    return false;
  }
}

/**
 * Where a notification should take you when clicked.
 *
 * In memory only: the worker may be torn down between raising a notification and the click
 * arriving, in which case the click opens the wallet without a deep link. Persisting these would
 * mean keeping another record of on-chain activity for a fallback that is one tap from the right
 * place anyway.
 */
const routes = new Map<string, string>();

async function show(notification: PendingNotification): Promise<void> {
  if (!chrome?.notifications?.create) return;
  try {
    await chrome.notifications.create(notification.id, {
      // `basic` on purpose: the image and list templates degrade on macOS — images are dropped and
      // only the first list item survives — so anything richer would render differently per
      // platform for no gain here.
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/96.png'),
      title: notification.title,
      message: notification.message,
      // Priorities below zero are ChromeOS-only and error elsewhere; zero is the portable default.
      priority: 0,
    });
    routes.set(notification.id, notification.route);
  } catch (error) {
    console.error('[Notifications] Could not show notification:', error);
  }
}

/** Open the wallet at whatever the notification was about. */
export async function handleNotificationClick(notificationId: string): Promise<void> {
  const route = routes.get(notificationId);
  routes.delete(notificationId);
  try {
    await chrome.notifications.clear(notificationId);
    const url = chrome.runtime.getURL(`popup.html${route ? `#${route}` : ''}`);
    await chrome.tabs.create({ url });
  } catch (error) {
    console.error('[Notifications] Could not handle click:', error);
  }
}

/**
 * One tick. Returns how many notifications were raised, which is what the tests assert on.
 *
 * Returns early — making no request at all — whenever there is nothing to do: feature off, no
 * addresses, permission not granted, or still inside a backoff window. A failure doubles the
 * backoff; a success clears it.
 */
export async function pollOnce(): Promise<number> {
  const watch = await readWatch();
  if (!watch.enabled || watch.addresses.length === 0) return 0;
  if (!(await hasNotificationPermission())) return 0;

  // Serving out a backoff after a failed poll. Counting ticks rather than timing keeps the whole
  // thing on the alarm's clock, with no wall-time arithmetic to get wrong.
  const remaining = watch.backoffTicks ?? 0;
  if (remaining > 0) {
    await writeWatch({ ...watch, backoffTicks: remaining - 1 });
    return 0;
  }

  let events: AddressEvent[];
  try {
    const response = await fetchAddressEvents(watch.addresses, {
      eventNames: WATCHED_EVENTS,
      limit: PAGE_SIZE,
    });
    events = response.result ?? [];
  } catch (error) {
    const failures = (watch.failures ?? 0) + 1;
    const backoff = Math.min(2 ** (failures - 1), MAX_BACKOFF_TICKS);
    console.error(`[Notifications] Poll failed, skipping ${backoff} tick(s):`, error);
    await writeWatch({ ...watch, failures, backoffTicks: backoff });
    return 0;
  }

  const watched = new Set(watch.addresses);
  const result = detectFromEvents(events, watch.state ?? {}, watched);

  for (const notification of result.notifications) {
    await show(notification);
  }

  // Anything past the cap is summarised rather than dropped in silence — the user should know the
  // wallet saw more than it showed.
  if (result.suppressed > 0) {
    await show({
      id: `summary:${result.state.lastEventIndex ?? 0}`,
      title: 'More activity',
      message: `${result.suppressed} more event${result.suppressed === 1 ? '' : 's'} not shown`,
      route: '/index',
    });
  }

  await writeWatch({
    enabled: true,
    addresses: watch.addresses,
    state: result.state,
    failures: 0,
    backoffTicks: 0,
  });

  return result.notifications.length + (result.suppressed > 0 ? 1 : 0);
}

export { MAX_NOTIFICATIONS_PER_POLL, MAX_WATCHED_ADDRESSES };
