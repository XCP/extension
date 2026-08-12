import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/core/counterparty/api';
import {
  hasNotificationPermission,
  MAX_WATCHED_ADDRESSES,
  pollOnce,
  readWatch,
  setNotificationWatch,
} from '../notificationService';

vi.mock('@/core/counterparty/api');

const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const OTHER = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';

/** A minimal in-memory stand-in for the three Chrome APIs this service touches. */
function installChromeStub(options: { granted?: boolean } = {}) {
  const store: Record<string, unknown> = {};
  const created: Array<{ id: string; title: string }> = [];

  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
        remove: vi.fn(async (key: string) => { delete store[key]; }),
      },
    },
    permissions: { contains: vi.fn(async () => options.granted ?? true) },
    notifications: {
      create: vi.fn(async (id: string, opts: { title: string }) => {
        created.push({ id, title: opts.title });
        return id;
      }),
      clear: vi.fn(async () => true),
    },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  };

  return { store, created };
}

const page = (records: unknown[]) =>
  ({ result: records, result_count: records.length }) as any;

const dispense = (event_index: number, source = ADDRESS) => ({
  event_index,
  event: 'DISPENSE',
  params: {
    asset: 'XCP',
    dispense_quantity_normalized: '1',
    source,
    destination: OTHER,
    tx_hash: `hash${event_index}`,
  },
});

describe('notification watch state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads as disabled when nothing has been stored', async () => {
    installChromeStub();
    expect(await readWatch()).toEqual({ enabled: false, addresses: [] });
  });

  it('stores the addresses to watch when enabled', async () => {
    installChromeStub();
    await setNotificationWatch(true, [ADDRESS]);

    const watch = await readWatch();
    expect(watch.enabled).toBe(true);
    expect(watch.addresses).toEqual([ADDRESS]);
  });

  // The addresses are the part worth not leaving behind, so disabling removes the record rather
  // than setting a flag beside it.
  it('clears the stored addresses when disabled', async () => {
    const { store } = installChromeStub();
    await setNotificationWatch(true, [ADDRESS]);
    expect(store.notificationWatch).toBeDefined();

    await setNotificationWatch(false, []);
    expect(store.notificationWatch).toBeUndefined();
    expect((await readWatch()).enabled).toBe(false);
  });

  it('keeps the watermark when re-enabled over the same address set', async () => {
    const { store } = installChromeStub();
    store.notificationWatch = { enabled: true, addresses: [ADDRESS], state: { lastEventIndex: 99 } };

    await setNotificationWatch(true, [ADDRESS]);
    expect((await readWatch()).state?.lastEventIndex).toBe(99);
  });

  // A watermark taken against one set says nothing about an address newly added to it: older
  // events for that address sit below the mark and would never be seen.
  it('drops the watermark when the address set changes', async () => {
    const { store } = installChromeStub();
    store.notificationWatch = { enabled: true, addresses: [ADDRESS], state: { lastEventIndex: 99 } };

    await setNotificationWatch(true, [ADDRESS, OTHER]);
    expect((await readWatch()).state).toBeUndefined();
  });

  it('caps how many addresses travel in one request', async () => {
    installChromeStub();
    const many = Array.from({ length: MAX_WATCHED_ADDRESSES + 5 }, (_, i) => `addr${i}`);

    await setNotificationWatch(true, many);
    expect((await readWatch()).addresses).toHaveLength(MAX_WATCHED_ADDRESSES);
  });
});

describe('pollOnce', () => {
  beforeEach(() => vi.clearAllMocks());

  it('makes no request while notifications are switched off', async () => {
    installChromeStub();
    expect(await pollOnce()).toBe(0);
    expect(api.fetchAddressEvents).not.toHaveBeenCalled();
  });

  // The setting and the browser grant are separate facts; a revoked permission must stop the poll
  // before it fetches, not after.
  it('makes no request when the permission is not granted', async () => {
    installChromeStub({ granted: false });
    await setNotificationWatch(true, [ADDRESS]);

    expect(await pollOnce()).toBe(0);
    expect(api.fetchAddressEvents).not.toHaveBeenCalled();
    expect(await hasNotificationPermission()).toBe(false);
  });

  // The whole efficiency argument in one assertion: every watched address in a single call.
  it('asks for every watched address in one request', async () => {
    installChromeStub();
    vi.mocked(api.fetchAddressEvents).mockResolvedValue(page([]));

    await setNotificationWatch(true, [ADDRESS, OTHER]);
    await pollOnce();

    expect(api.fetchAddressEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.fetchAddressEvents).mock.calls[0]![0]).toEqual([ADDRESS, OTHER]);
  });

  it('raises a notification for an event above the watermark', async () => {
    const { created } = installChromeStub();
    vi.mocked(api.fetchAddressEvents).mockResolvedValue(page([dispense(10)]));

    await setNotificationWatch(true, [ADDRESS]);
    // First poll adopts the position silently.
    expect(await pollOnce()).toBe(0);
    expect(created).toHaveLength(0);

    vi.mocked(api.fetchAddressEvents).mockResolvedValue(page([dispense(11), dispense(10)]));
    expect(await pollOnce()).toBe(1);
    expect(created.map((c) => c.id)).toEqual(['DISPENSE:11']);
  });

  // A node having a bad day must not be retried on every single tick.
  it('backs off after a failure and skips the following ticks', async () => {
    installChromeStub();
    vi.mocked(api.fetchAddressEvents).mockRejectedValue(new Error('node down'));

    await setNotificationWatch(true, [ADDRESS]);
    await pollOnce();
    expect((await readWatch()).failures).toBe(1);

    // Inside the backoff window: no further request.
    vi.mocked(api.fetchAddressEvents).mockClear();
    await pollOnce();
    expect(api.fetchAddressEvents).not.toHaveBeenCalled();
  });

  it('doubles the wait as failures repeat', async () => {
    installChromeStub();
    vi.mocked(api.fetchAddressEvents).mockRejectedValue(new Error('node down'));
    await setNotificationWatch(true, [ADDRESS]);

    await pollOnce();
    expect((await readWatch()).backoffTicks).toBe(1);

    await pollOnce(); // serves the backoff
    await pollOnce(); // fails again
    expect((await readWatch()).backoffTicks).toBe(2);
  });

  it('clears the backoff once the node answers again', async () => {
    installChromeStub();
    vi.mocked(api.fetchAddressEvents).mockRejectedValue(new Error('node down'));
    await setNotificationWatch(true, [ADDRESS]);
    await pollOnce();

    vi.mocked(api.fetchAddressEvents).mockResolvedValue(page([]));
    await pollOnce(); // serves out the one-tick backoff
    await pollOnce(); // succeeds

    const watch = await readWatch();
    expect(watch.failures).toBe(0);
    expect(watch.backoffTicks).toBe(0);
  });

  it('summarises a burst instead of firing all of it', async () => {
    const { created } = installChromeStub();
    vi.mocked(api.fetchAddressEvents).mockResolvedValue(page([dispense(1)]));
    await setNotificationWatch(true, [ADDRESS]);
    await pollOnce();

    vi.mocked(api.fetchAddressEvents).mockResolvedValue(
      page(Array.from({ length: 9 }, (_, i) => dispense(20 - i)))
    );
    await pollOnce();

    expect(created.some((c) => c.title === 'More activity')).toBe(true);
    expect(created.length).toBeLessThan(9);
  });
});
