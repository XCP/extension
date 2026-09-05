import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  getPendingSignFlows: vi.fn(),
  getSignFlow: vi.fn(),
  recordSignOutcome: vi.fn(),
}));

vi.mock('@/platform/provider/signFlow', () => ({
  getPendingSignFlows: mocks.getPendingSignFlows,
  getSignFlow: mocks.getSignFlow,
  recordSignOutcome: mocks.recordSignOutcome,
}));

vi.mock('@/services/eventEmitterService', () => ({
  eventEmitterService: { emit: mocks.emit },
}));

type PortHarness = {
  port: chrome.runtime.Port;
  disconnect: () => void;
  message: (message: unknown) => void;
};

function createPort(): PortHarness {
  let disconnectListener: (() => void) | undefined;
  let messageListener: ((message: any) => void) | undefined;

  const port = {
    name: 'popup-lifecycle',
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListener = listener;
      }),
    },
    onMessage: {
      addListener: vi.fn((listener: (message: any) => void) => {
        messageListener = listener;
      }),
    },
  } as unknown as chrome.runtime.Port;

  return {
    port,
    disconnect: () => disconnectListener?.(),
    message: (message) => messageListener?.(message),
  };
}

describe('PopupMonitorService', () => {
  let connectListener: ((port: chrome.runtime.Port) => void) | undefined;
  let service: ReturnType<typeof import('@/services/popupMonitorService').getPopupMonitorService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getPendingSignFlows.mockResolvedValue([]);
    mocks.getSignFlow.mockResolvedValue({ status: 'pending' });
    mocks.recordSignOutcome.mockResolvedValue(undefined);

    connectListener = undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onConnect: {
          addListener: vi.fn((listener: (port: chrome.runtime.Port) => void) => {
            connectListener = listener;
          }),
        },
      },
      windows: {
        onRemoved: { addListener: vi.fn() },
      },
    });

    const module = await import('@/services/popupMonitorService');
    service = module.getPopupMonitorService();
    service.initialize();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not cancel a request when an older popup disconnects after its replacement connects', async () => {
    const oldPopup = createPort();
    const currentPopup = createPort();

    connectListener?.(oldPopup.port);
    oldPopup.message({
      type: 'request-active',
      requestId: 'current-request',
      requestType: 'sign-transaction',
    });
    connectListener?.(currentPopup.port);

    oldPopup.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.recordSignOutcome).not.toHaveBeenCalled();

    currentPopup.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.recordSignOutcome).toHaveBeenCalledWith('current-request', 'cancelled');
  });
});
