import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  getSignFlow: vi.fn(),
  cancelPendingSignFlow: vi.fn(),
}));

vi.mock('@/platform/provider/signFlow', () => ({
  getSignFlow: mocks.getSignFlow,
  cancelPendingSignFlow: mocks.cancelPendingSignFlow,
  getSignFlowEventPrefix: (kind: string) => kind === 'sign-transaction' ? 'sign-tx' : kind,
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
    sender: { id: 'extension-id', url: 'chrome-extension://extension-id/popup.html' },
    disconnect: vi.fn(),
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
    mocks.getSignFlow.mockResolvedValue({ status: 'pending', kind: 'sign-transaction' });
    mocks.cancelPendingSignFlow.mockResolvedValue(true);

    connectListener = undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
        onConnect: {
          addListener: vi.fn((listener: (port: chrome.runtime.Port) => void) => {
            connectListener = listener;
          }),
          removeListener: vi.fn(),
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

  it('recognizes Firefox extension pages by their actual URL host', async () => {
    vi.mocked(chrome.runtime.getURL).mockImplementation(path => `moz-extension://browser-assigned-uuid${path}`);
    const popup = createPort();
    popup.port.sender!.url = 'moz-extension://browser-assigned-uuid/popup.html';
    connectListener?.(popup.port);
    popup.message({ type: 'request-active', requestId: 'firefox-request', requestType: 'sign-message' });
    expect(popup.port.disconnect).not.toHaveBeenCalled();
    popup.disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.cancelPendingSignFlow).toHaveBeenCalledWith('firefox-request');
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
    currentPopup.message({ type: 'request-active', requestId: 'current-request', requestType: 'sign-transaction' });

    oldPopup.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.cancelPendingSignFlow).not.toHaveBeenCalled();

    currentPopup.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.cancelPendingSignFlow).toHaveBeenCalledWith('current-request');
  });
  it('cancels an abandoned request even while a different approval remains open', async () => {
    const first = createPort();
    const second = createPort();
    connectListener?.(first.port); connectListener?.(second.port);
    first.message({ type: 'request-active', requestId: 'first', requestType: 'sign-transaction' });
    second.message({ type: 'request-active', requestId: 'second', requestType: 'sign-transaction' });
    first.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.cancelPendingSignFlow).toHaveBeenCalledExactlyOnceWith('first');
  });

  it('keeps a visible approval alive beyond the old two- and five-minute timeouts', async () => {
    const popup = createPort(); connectListener?.(popup.port);
    popup.message({ type: 'request-active', requestId: 'reading', requestType: 'sign-transaction' });
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(mocks.cancelPendingSignFlow).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    mocks.getSignFlow.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.emit).toHaveBeenCalledWith('sign-tx-cancel-reading', { reason: 'Request expired' });
  });

  it('does not cancel an approved signer when the approval window closes', async () => {
    const popup = createPort(); connectListener?.(popup.port);
    popup.message({ type: 'request-active', requestId: 'approved', requestType: 'sign-transaction' });
    mocks.getSignFlow.mockResolvedValue({ status: 'signing', kind: 'sign-transaction' });
    popup.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.cancelPendingSignFlow).not.toHaveBeenCalled();
  });

  it('refuses lifecycle ports from content scripts even with this extension ID', () => {
    const content = createPort();
    Object.assign(content.port, { sender: { id: 'extension-id', url: 'https://example.test' } });
    connectListener?.(content.port);
    expect(content.port.disconnect).toHaveBeenCalled();
    expect(content.port.onMessage.addListener).not.toHaveBeenCalled();
  });

});
