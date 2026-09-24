import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_RELOAD_REQUIRED_MESSAGE } from '@/core/rpcErrors';


const ORIGIN = 'https://dapp.example';

interface Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface PageRequest { target: string; type: string; id: number; data: { method: string } }

/** A page window the real injected script runs against, with the content script played by the test. */
function createPage() {
  const page = Object.assign(new EventTarget(), {
    location: { origin: ORIGIN },
    postMessage: vi.fn(),
  });
  const deliver = (data: unknown) => {
    page.dispatchEvent(Object.assign(new Event('message'), { data, source: page, origin: ORIGIN }));
  };
  const requests = () => page.postMessage.mock.calls.map(([message]) => message as PageRequest);
  return { page, deliver, requests };
}

describe('injected provider: bridge liveness', () => {
  let page: ReturnType<typeof createPage>;
  let provider: Provider;

  beforeEach(async () => {
    vi.useFakeTimers();
    page = createPage();
    vi.stubGlobal('window', page.page);
    vi.resetModules();
    const injected = await import('../injected');
    // WXT's defineUnlistedScript wraps the entrypoint as { main }.
    (injected.default as unknown as { main: () => void }).main();
    provider = (page.page as unknown as { xcpwallet: Provider }).xcpwallet;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const ack = (id: number) => page.deliver({ target: 'xcp-wallet-injected', type: 'XCP_WALLET_ACK', id });
  const respond = (id: number, method: string, result: unknown) =>
    page.deliver({ target: 'xcp-wallet-injected', type: 'XCP_WALLET_RESPONSE', id, data: { method, result } });

  it('rejects a request nobody acknowledges with the typed reload error, and emits disconnect once', async () => {
    const disconnect = vi.fn();
    provider.on('disconnect', disconnect);

    const first = provider.request({ method: 'xcp_requestAccounts' }); // interactive: no response timeout
    const second = provider.request({ method: 'xcp_accounts' });
    const settled = Promise.allSettled([first, second]);
    await vi.advanceTimersByTimeAsync(5_000);

    const [a, b] = await settled;
    for (const outcome of [a, b]) {
      expect(outcome).toMatchObject({ status: 'rejected', reason: {
        code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE, data: { reloadRequired: true },
      } });
    }
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnect.mock.calls[0]![0]).toMatchObject({ code: 4900, data: { reloadRequired: true } });
  });

  it('lets an acknowledged interactive request wait on the user as long as it takes', async () => {
    const approval = provider.request({ method: 'xcp_signPsbt', params: [] });
    const { id } = page.requests()[0]!;
    ack(id);
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    respond(id, 'xcp_signPsbt', { hex: 'signed' });
    await expect(approval).resolves.toEqual({ hex: 'signed' });
  });

  it('still bounds an acknowledged non-interactive request by its response timeout', async () => {
    const query = provider.request({ method: 'xcp_getAddresses' });
    const outcome = expect(query).rejects.toThrow('Request timeout');
    ack(page.requests()[0]!.id);
    await vi.advanceTimersByTimeAsync(60_000);
    await outcome;
  });

  it('relays the content script\'s reload-required disconnect as a typed event and fails what waits', async () => {
    const disconnect = vi.fn();
    provider.on('disconnect', disconnect);
    const approval = provider.request({ method: 'xcp_requestAccounts' });
    ack(page.requests()[0]!.id);
    const outcome = expect(approval).rejects.toMatchObject({ code: 4900, data: { reloadRequired: true } });

    page.deliver({
      target: 'xcp-wallet-injected', type: 'XCP_WALLET_EVENT', event: 'disconnect',
      data: { code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE, data: { reloadRequired: true } },
    });

    await outcome;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnect.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('passes a revocation disconnect through unchanged', () => {
    const disconnect = vi.fn();
    provider.on('disconnect', disconnect);
    page.deliver({ target: 'xcp-wallet-injected', type: 'XCP_WALLET_EVENT', event: 'disconnect', data: {} });
    expect(disconnect).toHaveBeenCalledExactlyOnceWith({});
  });
});
