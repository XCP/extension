import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POPUP_LIFECYCLE_RECONNECT_MS, usePopupLifecycle } from '../usePopupLifecycle';

type FakePort = {
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onDisconnect: { addListener: ReturnType<typeof vi.fn> };
  /** The background dropped the port (for example, its worker stopped). */
  drop: () => void;
};

let ports: FakePort[];

function fakePort(): FakePort {
  const listeners: (() => void)[] = [];
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onDisconnect: { addListener: vi.fn((listener: () => void) => listeners.push(listener)) },
    drop: () => { for (const listener of listeners) listener(); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  ports = [];
  vi.stubGlobal('chrome', {
    runtime: {
      connect: vi.fn(() => {
        const port = fakePort();
        ports.push(port);
        return port;
      }),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePopupLifecycle', () => {
  it('announces the request on the lifecycle port', () => {
    renderHook(() => usePopupLifecycle('req-1', 'sign-psbt'));
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'popup-lifecycle' });
    expect(ports[0]!.postMessage).toHaveBeenCalledWith({ type: 'request-active', requestId: 'req-1', requestType: 'sign-psbt' });
  });

  it('reconnects and announces again when the background drops the port while mounted', async () => {
    renderHook(() => usePopupLifecycle('req-1', 'sign-message'));
    ports[0]!.drop();
    await vi.advanceTimersByTimeAsync(POPUP_LIFECYCLE_RECONNECT_MS);
    expect(ports).toHaveLength(2);
    expect(ports[1]!.postMessage).toHaveBeenCalledWith({ type: 'request-active', requestId: 'req-1', requestType: 'sign-message' });

    // And again after a second restart.
    ports[1]!.drop();
    await vi.advanceTimersByTimeAsync(POPUP_LIFECYCLE_RECONNECT_MS);
    expect(ports).toHaveLength(3);
  });

  it('does not reconnect once unmounted, and disconnects its port', async () => {
    const { unmount } = renderHook(() => usePopupLifecycle('req-1', 'sign-message'));
    ports[0]!.drop();
    unmount();
    await vi.advanceTimersByTimeAsync(POPUP_LIFECYCLE_RECONNECT_MS * 5);
    expect(ports).toHaveLength(1);

    const second = renderHook(() => usePopupLifecycle('req-2', 'sign-message'));
    second.unmount();
    expect(ports[1]!.disconnect).toHaveBeenCalled();
    ports[1]!.drop();
    await vi.advanceTimersByTimeAsync(POPUP_LIFECYCLE_RECONNECT_MS * 5);
    expect(ports).toHaveLength(2);
  });

  it('connects nothing without a request', () => {
    renderHook(() => usePopupLifecycle(null, 'sign-message'));
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });
});
