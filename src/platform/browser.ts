/**
 * Browser Runtime Utilities
 *
 * Tab messaging with proper error handling, and the record of which tabs a provider event may
 * concern.
 */

import { createWriteLock } from '@/platform/storage/mutex';

/**
 * Message type for Chrome messaging APIs.
 * Chrome requires messages to be JSON-serializable, but we use a
 * permissive type here since strict typing would require all callers
 * to explicitly cast their message objects.
 */
type ChromeMessage = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Send message to specific tab with proper lastError checking.
 * Returns undefined on error instead of throwing.
 */
function sendMessageToTabSafe<T = unknown>(
  tabId: number,
  message: ChromeMessage
): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response: unknown) => {
        // ALWAYS check lastError first to prevent console warnings
        const error = chrome.runtime.lastError;
        if (error) {
          // No receiver: the tab closed, navigated away, or never had our content script.
          resolve(undefined);
        } else {
          resolve(response as T);
        }
      });
    } catch (_error) {
      // Defensive: even catch block returns undefined instead of rejecting
      resolve(undefined);
    }
  });
}

// ============================================================================
// Provider tabs
// ============================================================================

/**
 * Which tab last spoke to the provider from which origin, as `{ [tabId]: origin }`.
 *
 * The worker cannot ask Chrome which tab shows which site: it holds neither the `tabs` permission
 * nor host permissions, so `tab.url` is empty. It does learn it, reliably, from the sender of every
 * provider port (the origin there is Chrome's, not the page's claim). Recording that is how an event
 * for one origin reaches that origin's tabs instead of every tab in the browser.
 *
 * Kept in session storage because the worker that learned a tab is rarely the one that later has
 * an event for it. A tab that has never used the provider is not listed and receives nothing; the
 * content script still filters on its own origin, so a stale entry can only waste a message.
 */
const PROVIDER_TABS_KEY = 'providerTabs';
type ProviderTabs = Record<string, string>;

const withProviderTabsLock = createWriteLock();
/** This worker's copy, so a port that reconnects with nothing new costs no storage I/O. */
let providerTabsCache: ProviderTabs | null = null;

function isProviderTabs(value: unknown): value is ProviderTabs {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((origin) => typeof origin === 'string');
}

async function loadProviderTabs(): Promise<ProviderTabs> {
  if (providerTabsCache) return providerTabsCache;
  let stored: unknown;
  try {
    stored = (await chrome.storage.session.get(PROVIDER_TABS_KEY))[PROVIDER_TABS_KEY];
  } catch {
    stored = undefined;
  }
  providerTabsCache = isProviderTabs(stored) ? { ...stored } : {};
  return providerTabsCache;
}

async function saveProviderTabs(tabs: ProviderTabs): Promise<void> {
  providerTabsCache = tabs;
  await chrome.storage.session.set({ [PROVIDER_TABS_KEY]: tabs });
}

/** Remember that `tabId` is showing `origin`, as learned from a provider port's sender. */
export function recordProviderTab(tabId: number, origin: string): Promise<void> {
  return withProviderTabsLock(async () => {
    const tabs = await loadProviderTabs();
    if (tabs[tabId] === origin) return;
    await saveProviderTabs({ ...tabs, [tabId]: origin });
  });
}

/** The tabs last seen using the provider from `origin`. */
export async function getProviderTabs(origin: string): Promise<number[]> {
  const tabs = await withProviderTabsLock(loadProviderTabs);
  return Object.entries(tabs).filter(([, tabOrigin]) => tabOrigin === origin).map(([tabId]) => Number(tabId));
}

function forgetProviderTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return Promise.resolve();
  return withProviderTabsLock(async () => {
    const tabs = { ...(await loadProviderTabs()) };
    let changed = false;
    for (const tabId of tabIds) {
      if (tabId in tabs) {
        delete tabs[tabId];
        changed = true;
      }
    }
    if (changed) await saveProviderTabs(tabs);
  });
}

/** For tests: forget this worker's copy, as a restarted worker would. */
export function resetProviderTabsCache(): void {
  providerTabsCache = null;
}

/**
 * Send a message to the tabs of one origin, and forget any tab that no longer shows it.
 *
 * A tab that does not answer (closed, navigated to a page without our content script) or answers
 * that the event was not for it (navigated to another origin) is dropped; it is recorded again the
 * next time a page in it uses the provider.
 */
export async function sendToOriginTabs(
  origin: string,
  message: ChromeMessage
): Promise<{ tabId: number; ok: boolean }[]> {
  try {
    const tabIds = await getProviderTabs(origin);
    const results = await Promise.all(tabIds.map(async (tabId) => {
      const response = await sendMessageToTabSafe<{ received?: boolean }>(tabId, message);
      const ok = response !== undefined && response !== null
        && !(typeof response === 'object' && response.received === false);
      return { tabId, ok };
    }));
    await forgetProviderTabs(results.filter((result) => !result.ok).map((result) => result.tabId));
    return results;
  } catch (error) {
    console.debug('Error in sendToOriginTabs:', error);
    return [];
  }
}

// ============================================================================
// Provider events
// ============================================================================

/**
 * The accounts each origin was last told, as `{ [origin]: accounts }`, so a worker that wakes can
 * tell whether the pages of an origin already hold the right answer. Session storage: it has to
 * outlive the worker that sent them, and nothing sent in an earlier browser session is still open.
 */
const ANNOUNCED_ACCOUNTS_KEY = 'announcedAccounts';
const withAnnouncedLock = createWriteLock();

async function readAnnounced(): Promise<Record<string, string[]>> {
  try {
    const stored: unknown = (await chrome.storage.session.get(ANNOUNCED_ACCOUNTS_KEY))[ANNOUNCED_ACCOUNTS_KEY];
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return stored as Record<string, string[]>;
  } catch {
    return {};
  }
}

function recordAnnounced(origin: string, accounts: string[] | null): Promise<void> {
  return withAnnouncedLock(async () => {
    const announced = { ...(await readAnnounced()) };
    if (accounts === null) {
      if (!(origin in announced)) return;
      delete announced[origin];
    } else {
      if (sameAccounts(announced[origin], accounts)) return;
      announced[origin] = [...accounts];
    }
    await chrome.storage.session.set({ [ANNOUNCED_ACCOUNTS_KEY]: announced });
  });
}

function sameAccounts(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((account, i) => account === b[i]);
}

/** Whether `origin` was last told exactly these accounts. */
export async function wereAccountsAnnounced(origin: string, accounts: string[]): Promise<boolean> {
  const announced = await withAnnouncedLock(readAnnounced);
  return sameAccounts(announced[origin], accounts);
}

/**
 * Deliver a provider event to the pages of one origin, and remember what that origin was told.
 *
 * Only tabs recorded as using the provider from `origin` are messaged. The content script still
 * drops any event whose origin is not its own page's, so a stale record cannot leak an event to
 * another site.
 */
export async function deliverProviderEvent(origin: string, event: string, data: unknown): Promise<void> {
  await sendToOriginTabs(origin, { type: 'PROVIDER_EVENT', origin, event, data: data as ChromeMessage });
  try {
    if (event === 'accountsChanged' && Array.isArray(data) && data.every((a) => typeof a === 'string')) {
      await recordAnnounced(origin, data);
    } else if (event === 'disconnect') {
      await recordAnnounced(origin, null);
    }
  } catch (error) {
    // Only costs a redundant announcement on the next wake.
    console.debug('Could not record announced accounts:', error);
  }
}
