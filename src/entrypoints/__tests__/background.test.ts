/**
 * The background's startup: what it wakes for, what it initializes, and what it sends on waking.
 *
 * Every collaborator is a stub; these pin the wiring in background.ts itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const order: string[] = [];
  const approval = {
    initialize: vi.fn(async () => { order.push('approval.initialize'); }),
    hasPendingApproval: vi.fn(() => false),
  };
  const connection = {
    initialize: vi.fn(async () => { order.push('connection.initialize'); }),
    getConnectedWebsites: vi.fn(async () => [] as { origin: string }[]),
  };
  const wallet = {
    lockKeychain: vi.fn(async () => {}),
    ensureKeychainLoaded: vi.fn(async () => {}),
    isKeychainUnlocked: vi.fn(async () => false),
    getActiveAddress: vi.fn(async () => undefined as { address: string } | undefined),
  };
  const update = {
    initialize: vi.fn(async () => { order.push('update.initialize'); }),
    listen: vi.fn(() => { order.push('update.listen'); }),
    addBusyCheck: vi.fn(),
    destroy: vi.fn(),
  };
  const popupMonitor = {
    initialize: vi.fn(() => { order.push('popupMonitor.initialize'); }),
    destroy: vi.fn(),
  };
  return {
    order, approval, connection, wallet, update, popupMonitor,
    recovery: 'LOCKED' as string,
    cachedKey: null as string | null,
    markServicesReady: vi.fn(() => { order.push('markServicesReady'); }),
    bridgeHandlers: [] as string[],
    emit: vi.fn(),
    wereAccountsAnnounced: vi.fn(async (_origin: string, _accounts: string[]) => false),
  };
});

vi.mock('webext-bridge/background', () => ({
  onMessage: vi.fn((name: string) => { h.bridgeHandlers.push(name); }),
}));
vi.mock('@/platform/auth/sessionManager', () => ({
  SessionRecoveryState: { LOCKED: 'LOCKED', NEEDS_REAUTH: 'NEEDS_REAUTH', VALID: 'VALID' },
  checkSessionRecovery: vi.fn(async () => h.recovery),
  expireSessionIfNeeded: vi.fn(async () => false),
  rearmSessionExpiry: vi.fn(async () => {}),
}));
vi.mock('@/platform/auth/sessionReady', () => ({ markSessionRecovery: vi.fn() }));
vi.mock('@/platform/browser', () => ({
  deliverProviderEvent: vi.fn(async () => {}),
  wereAccountsAnnounced: h.wereAccountsAnnounced,
}));
vi.mock('@/platform/storage/keyStorage', () => ({ getCachedKeychainMasterKey: vi.fn(async () => h.cachedKey) }));
vi.mock('@/services/approvalService', () => ({ getApprovalService: () => h.approval, registerApprovalService: vi.fn() }));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => h.connection, registerConnectionService: vi.fn() }));
vi.mock('@/services/core/ServiceRegistry', () => ({
  ServiceRegistry: { getInstance: () => ({ register: vi.fn(async () => {}), destroyAll: vi.fn(async () => {}) }) },
}));
vi.mock('@/services/core/serviceReadiness', () => ({
  markServicesReady: h.markServicesReady,
  whenServicesReady: vi.fn(async () => {}),
  getReadinessState: vi.fn(() => ({ ready: true })),
}));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { on: vi.fn(), emit: h.emit } }));
vi.mock('@/services/popupMonitorService', () => ({ getPopupMonitorService: () => h.popupMonitor }));
vi.mock('@/services/providerService', () => ({ getProviderService: () => ({}), registerProviderService: vi.fn() }));
vi.mock('@/services/providerSigningService', () => ({ registerProviderSigningService: vi.fn() }));
vi.mock('@/services/updateService', () => ({ getUpdateService: () => h.update }));
vi.mock('@/services/walletService', () => ({ getWalletService: () => h.wallet, registerWalletService: vi.fn() }));

const listener = () => ({ addListener: vi.fn() });
let chromeStub: {
  runtime: Record<string, unknown> & { onMessage: { addListener: ReturnType<typeof vi.fn> } };
  tabs: { onUpdated: ReturnType<typeof listener>; onRemoved: ReturnType<typeof listener> };
  alarms: { clear: ReturnType<typeof vi.fn>; onAlarm: ReturnType<typeof listener> };
};

async function startBackground(): Promise<void> {
  const background = await import('../background');
  (background.default as unknown as { main: () => void }).main();
  await vi.waitFor(() => expect(h.markServicesReady).toHaveBeenCalled());
  // Let the post-barrier announcement finish.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  h.order.length = 0;
  h.bridgeHandlers.length = 0;
  h.recovery = 'LOCKED';
  h.cachedKey = null;
  h.wallet.isKeychainUnlocked.mockResolvedValue(false);
  h.connection.getConnectedWebsites.mockResolvedValue([]);
  h.wereAccountsAnnounced.mockResolvedValue(false);
  chromeStub = {
    runtime: {
      id: 'test-extension-id',
      onMessage: listener(),
      onConnect: listener(),
      onInstalled: listener(),
      onSuspend: listener(),
      onSuspendCanceled: listener(),
    },
    tabs: { onUpdated: listener(), onRemoved: listener() },
    alarms: { clear: vi.fn(async () => true), onAlarm: listener() },
  };
  vi.stubGlobal('chrome', chromeStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('background wakes', () => {
  it('registers nothing that fires on ordinary page loads', async () => {
    await startBackground();
    expect(chromeStub.tabs.onUpdated.addListener).not.toHaveBeenCalled();
    expect(chromeStub.tabs.onRemoved.addListener).not.toHaveBeenCalled();
    expect((chromeStub.runtime.onInstalled as ReturnType<typeof listener>).addListener).not.toHaveBeenCalled();
    expect(h.bridgeHandlers).not.toContain('webext-bridge-keep-alive');
  });

  it('does not treat the old content-script ready signal as anything', async () => {
    await startBackground();
    const [handler] = chromeStub.runtime.onMessage.addListener.mock.calls[0]!;
    const sendResponse = vi.fn();
    const keepOpen = handler({ __xcp_cs_ready: true, tabUrl: 'https://a.example/' },
      { id: 'test-extension-id', tab: { id: 1 } }, sendResponse);
    expect(keepOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('background startup', () => {
  it('registers the popup-lifecycle and update listeners in the first turn, before any await', async () => {
    // MV3 delivers the event that woke the worker only to listeners registered by the end of the
    // first turn; initialisation awaits storage long before it would get to them.
    const background = await import('../background');
    (background.default as unknown as { main: () => void }).main();
    expect(h.popupMonitor.initialize).toHaveBeenCalledOnce();
    expect(h.update.listen).toHaveBeenCalledOnce();
    expect(h.order).toEqual(['popupMonitor.initialize', 'update.listen']);
    await vi.waitFor(() => expect(h.markServicesReady).toHaveBeenCalled());
  });

  it('tears nothing down on suspend, which an event page can cancel', async () => {
    await startBackground();
    expect((chromeStub.runtime.onSuspend as ReturnType<typeof listener>).addListener).not.toHaveBeenCalled();
    expect(h.update.destroy).not.toHaveBeenCalled();
    expect(h.popupMonitor.destroy).not.toHaveBeenCalled();
  });

  it('initializes the approval and connection services before serving anything', async () => {
    // Registering their proxies only answers calls. Without initialize(), an approval pending when
    // the worker stopped is never resumed and a connect approval is never completed.
    await startBackground();
    expect(h.approval.initialize).toHaveBeenCalledOnce();
    expect(h.connection.initialize).toHaveBeenCalledOnce();
    expect(h.order.indexOf('approval.initialize')).toBeLessThan(h.order.indexOf('connection.initialize'));
    expect(h.order.indexOf('connection.initialize')).toBeLessThan(h.order.indexOf('markServicesReady'));
  });

  it('keeps an update from reloading the extension under a pending approval', async () => {
    await startBackground();
    const [check] = h.update.addBusyCheck.mock.calls[0]!;
    h.approval.hasPendingApproval.mockReturnValue(true);
    expect(check()).toBe(true);
  });

  it('does not lock an already-locked wallet on every wake', async () => {
    h.recovery = 'LOCKED';
    h.cachedKey = null;
    await startBackground();
    expect(h.wallet.lockKeychain).not.toHaveBeenCalled();
  });

  it('still locks when a master key outlived its session', async () => {
    h.recovery = 'LOCKED';
    h.cachedKey = 'stale-key';
    await startBackground();
    expect(h.wallet.lockKeychain).toHaveBeenCalledOnce();
  });
});

describe('re-announcing accounts on wake', () => {
  beforeEach(() => {
    h.recovery = 'NEEDS_REAUTH';
    h.wallet.isKeychainUnlocked.mockResolvedValue(true);
    h.wallet.getActiveAddress.mockResolvedValue({ address: 'bc1qactive' });
    h.connection.getConnectedWebsites.mockResolvedValue([{ origin: 'https://same.example' }, { origin: 'https://changed.example' }]);
  });

  it('tells only the origins whose pages were last told something else', async () => {
    h.wereAccountsAnnounced.mockImplementation(async (origin) => origin === 'https://same.example');
    await startBackground();
    expect(h.emit).toHaveBeenCalledExactlyOnceWith('emit-provider-event', {
      origin: 'https://changed.example', event: 'accountsChanged', data: ['bc1qactive'],
    });
  });

  it('sends nothing on a wake that changed nothing', async () => {
    h.wereAccountsAnnounced.mockResolvedValue(true);
    await startBackground();
    expect(h.emit).not.toHaveBeenCalled();
  });
});
