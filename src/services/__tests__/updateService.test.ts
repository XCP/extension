import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/storage/updateStorage', () => ({
  getUpdateState: vi.fn(async () => null),
  setUpdateState: vi.fn(async () => {}),
}));

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
});
