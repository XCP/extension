import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  deliverProviderEvent, getProviderTabs, recordProviderTab, resetProviderTabsCache, sendToOriginTabs,
  wereAccountsAnnounced,
} from '../browser';

/** What each tab's content script answers; a tab not listed has none. */
let replies: Record<number, unknown>;
const runtime: { lastError?: { message: string } } = {};
const sendMessage = vi.fn((tabId: number, _message: unknown, callback: (response: unknown) => void) => {
  const answers = tabId in replies;
  runtime.lastError = answers ? undefined : { message: 'Could not establish connection. Receiving end does not exist.' };
  callback(answers ? replies[tabId] : undefined);
  runtime.lastError = undefined;
});

beforeEach(() => {
  fakeBrowser.reset();
  resetProviderTabsCache();
  replies = {};
  sendMessage.mockClear();
  vi.stubGlobal('chrome', { storage: fakeBrowser.storage, tabs: { sendMessage }, runtime });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const received = { received: true };

describe('provider event delivery', () => {
  it('messages only the tabs recorded for the origin, not every tab', async () => {
    await recordProviderTab(1, 'https://a.example');
    await recordProviderTab(2, 'https://b.example');
    await recordProviderTab(3, 'https://a.example');
    replies = { 1: received, 2: received, 3: received, 4: received };

    await deliverProviderEvent('https://a.example', 'accountsChanged', ['bc1qa']);

    expect(sendMessage.mock.calls.map(([tabId]) => tabId).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(sendMessage).toHaveBeenCalledWith(1,
      { type: 'PROVIDER_EVENT', origin: 'https://a.example', event: 'accountsChanged', data: ['bc1qa'] },
      expect.any(Function));
  });

  it('forgets a tab that closed or now shows another site, and keeps one that answered', async () => {
    await recordProviderTab(1, 'https://a.example');
    await recordProviderTab(2, 'https://a.example');
    await recordProviderTab(3, 'https://a.example');
    replies = { 1: received, 3: { received: false } }; // 2 closed; 3 navigated to another origin

    const results = await sendToOriginTabs('https://a.example', { type: 'PROVIDER_EVENT' });

    expect(results).toEqual(expect.arrayContaining([
      { tabId: 1, ok: true }, { tabId: 2, ok: false }, { tabId: 3, ok: false },
    ]));
    expect(await getProviderTabs('https://a.example')).toEqual([1]);
  });

  it('remembers the tabs across a worker restart', async () => {
    await recordProviderTab(5, 'https://a.example');
    resetProviderTabsCache();
    expect(await getProviderTabs('https://a.example')).toEqual([5]);
  });

  it('follows a tab to the origin it was last seen using', async () => {
    await recordProviderTab(5, 'https://a.example');
    await recordProviderTab(5, 'https://b.example');
    expect(await getProviderTabs('https://a.example')).toEqual([]);
    expect(await getProviderTabs('https://b.example')).toEqual([5]);
  });

  it('writes nothing when a port reconnects from a tab it already knows', async () => {
    await recordProviderTab(5, 'https://a.example');
    const set = vi.spyOn(fakeBrowser.storage.session, 'set');
    await recordProviderTab(5, 'https://a.example');
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps every tab when several ports connect at once', async () => {
    await Promise.all([1, 2, 3, 4].map((tabId) => recordProviderTab(tabId, 'https://a.example')));
    resetProviderTabsCache();
    expect((await getProviderTabs('https://a.example')).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('sends nothing for an origin no tab has used', async () => {
    await deliverProviderEvent('https://nobody.example', 'accountsChanged', []);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('announced accounts', () => {
  it('remembers what each origin was last told', async () => {
    expect(await wereAccountsAnnounced('https://a.example', ['bc1qa'])).toBe(false);
    await deliverProviderEvent('https://a.example', 'accountsChanged', ['bc1qa']);
    expect(await wereAccountsAnnounced('https://a.example', ['bc1qa'])).toBe(true);
    expect(await wereAccountsAnnounced('https://a.example', [])).toBe(false);
    expect(await wereAccountsAnnounced('https://b.example', ['bc1qa'])).toBe(false);
  });

  it('tracks the latest announcement, including an emptied one', async () => {
    await deliverProviderEvent('https://a.example', 'accountsChanged', ['bc1qa']);
    await deliverProviderEvent('https://a.example', 'accountsChanged', []);
    expect(await wereAccountsAnnounced('https://a.example', [])).toBe(true);
    expect(await wereAccountsAnnounced('https://a.example', ['bc1qa'])).toBe(false);
  });

  it('forgets an origin that was disconnected', async () => {
    await deliverProviderEvent('https://a.example', 'accountsChanged', ['bc1qa']);
    await deliverProviderEvent('https://a.example', 'disconnect', {});
    expect(await wereAccountsAnnounced('https://a.example', ['bc1qa'])).toBe(false);
  });
});
