import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  stored: null as Record<string, unknown> | null,
  whenServicesReady: vi.fn(async () => {}),
}));

vi.mock('@/platform/storage/updateStorage', () => ({
  getUpdateState: vi.fn(async () => h.stored),
  setUpdateState: vi.fn(async (state: Record<string, unknown>) => { h.stored = { ...state }; }),
}));
vi.mock('@/services/core/serviceReadiness', () => ({ whenServicesReady: h.whenServicesReady }));

type UpdateListener = (details: { version: string }) => void;

function stubChrome(openContexts: unknown[] = []) {
  const listeners: UpdateListener[] = [];
  const chromeStub = {
    runtime: {
      getManifest: () => ({ version: '1.0.0' }),
      reload: vi.fn(),
      getContexts: vi.fn(async () => openContexts),
      onUpdateAvailable: {
        addListener: vi.fn((listener: UpdateListener) => listeners.push(listener)),
        removeListener: vi.fn(),
      },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn() },
    },
  };
  vi.stubGlobal('chrome', chromeStub);
  return { chromeStub, announce: (version: string) => { for (const listener of listeners) listener({ version }); } };
}

async function freshService() {
  const { UpdateService } = await import('../updateService');
  const service = new UpdateService();
  await service.initialize();
  return service;
}

beforeEach(() => {
  vi.useFakeTimers();
  h.stored = null;
  h.whenServicesReady.mockImplementation(async () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('UpdateService', () => {
  it('schedules no alarm, so it never wakes an idle worker', async () => {
    const { chromeStub } = stubChrome();
    await freshService();
    expect(chromeStub.alarms.create).not.toHaveBeenCalled();
    expect(chromeStub.alarms.onAlarm.addListener).not.toHaveBeenCalled();
    // ...and clears the one earlier versions left, which would otherwise fire every 15 minutes.
    expect(chromeStub.alarms.clear).toHaveBeenCalledWith('update-service-periodic-check');
  });

  it('never reloads without an update, however long it runs', async () => {
    const { chromeStub } = stubChrome();
    await freshService();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(chromeStub.runtime.reload).not.toHaveBeenCalled();
  });

  it('reloads for an update once nothing is in use', async () => {
    const { chromeStub, announce } = stubChrome();
    await freshService();
    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload while an extension page is open, and does once it closes', async () => {
    const open = [{ contextType: 'POPUP' }];
    const { chromeStub, announce } = stubChrome(open);
    await freshService();
    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(chromeStub.runtime.reload).not.toHaveBeenCalled();
    expect(chromeStub.runtime.getContexts).toHaveBeenCalledWith({ contextTypes: ['POPUP', 'TAB', 'SIDE_PANEL'] });

    open.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload while an approval is pending', async () => {
    const { chromeStub, announce } = stubChrome();
    const service = await freshService();
    let pending = true;
    service.addBusyCheck(() => pending);
    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(chromeStub.runtime.reload).not.toHaveBeenCalled();

    pending = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('waits for a signing request to finish', async () => {
    const { chromeStub, announce } = stubChrome();
    const service = await freshService();
    service.registerCriticalOperation('sign-psbt-1');
    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(chromeStub.runtime.reload).not.toHaveBeenCalled();

    service.unregisterCriticalOperation('sign-psbt-1');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the update to Chrome when it cannot tell whether a page is open', async () => {
    const { chromeStub, announce } = stubChrome();
    (chromeStub.runtime as { getContexts?: unknown }).getContexts = undefined;
    await freshService();
    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(chromeStub.runtime.reload).not.toHaveBeenCalled();
  });

  it('listens before initialising, and acts on an update only once services are ready', async () => {
    let ready!: () => void;
    h.whenServicesReady.mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
    const { chromeStub, announce } = stubChrome();
    const { UpdateService } = await import('../updateService');
    const service = new UpdateService();
    service.listen();
    expect(chromeStub.runtime.onUpdateAvailable.addListener).toHaveBeenCalledTimes(1);

    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getStatus().reloadScheduled).toBe(false);

    await service.initialize();
    // initialize() does not register a second listener.
    expect(chromeStub.runtime.onUpdateAvailable.addListener).toHaveBeenCalledTimes(1);
    ready();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('resumes a reload the previous worker scheduled but never ran', async () => {
    h.stored = { updateAvailable: true, pendingVersion: '1.0.1', reloadScheduled: true, currentVersion: '1.0.0', lastCheckTime: 0 };
    const { chromeStub } = stubChrome();
    await freshService();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('clears the scheduled reload before reloading, so a wake cannot loop on it', async () => {
    const { chromeStub, announce } = stubChrome();
    await freshService();
    announce('1.0.1');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
    expect(h.stored?.reloadScheduled).toBe(false);

    // The reload did not apply the update (still 1.0.0): the next worker does not reload again.
    await freshService();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(chromeStub.runtime.reload).toHaveBeenCalledTimes(1);
  });
});
