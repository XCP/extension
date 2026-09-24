import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_RELOAD_REQUIRED_MESSAGE } from '@/core/rpcErrors';


const ORIGIN = 'https://dapp.example';

interface Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface PageRequest { target: string; type: string; id: number; data: { method: string } }

/**
 * A page window the real injected script runs against. `postMessage` behaves like the browser's:
 * it queues, and `pump` delivers the queue in order, one message at a time, the way the event loop
 * does once a busy main thread frees up. The content script is played by the test.
 */
function createPage() {
  const queue: unknown[] = [];
  const page = Object.assign(new EventTarget(), {
    location: { origin: ORIGIN },
    postMessage: vi.fn((data: unknown) => { queue.push(data); }),
  });
  const deliver = (data: unknown) => {
    page.dispatchEvent(Object.assign(new Event('message'), { data, source: page, origin: ORIGIN }));
  };
  const pump = () => {
    while (queue.length > 0) deliver(queue.shift());
  };
  const requests = () => page.postMessage.mock.calls.map(([message]) => message as PageRequest)
    .filter(message => message.type === 'XCP_WALLET_REQUEST');
  /** Plays a live content script: acks each request on receipt, through the same queue. */
  const actAsContentScript = (ackIf: (request: PageRequest) => boolean = () => true) => {
    page.addEventListener('message', (event) => {
      const request = (event as MessageEvent<PageRequest>).data;
      if (request.target !== 'xcp-wallet-content' || request.type !== 'XCP_WALLET_REQUEST' || !ackIf(request)) return;
      page.postMessage({ target: 'xcp-wallet-injected', type: 'XCP_WALLET_ACK', id: request.id });
    });
  };
  return { page, deliver, pump, requests, actAsContentScript };
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
    page.pump(); // nothing on the page answers; the probes come back and confirm it

    const [a, b] = await settled;
    for (const outcome of [a, b]) {
      expect(outcome).toMatchObject({ status: 'rejected', reason: {
        code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE, data: { reloadRequired: true },
      } });
    }
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnect.mock.calls[0]![0]).toMatchObject({ code: 4900, data: { reloadRequired: true } });
  });

  it('does not call a healthy bridge dead when a busy page runs the ack timer before the ack', async () => {
    const disconnect = vi.fn();
    provider.on('disconnect', disconnect);
    page.actAsContentScript();
    const approval = provider.request({ method: 'xcp_signMessage', params: ['hello'] });
    let outcome: unknown = 'pending';
    approval.then(value => { outcome = value; }, error => { outcome = error; });

    // The page's main thread is busy for 6 s: the request is still queued, undelivered, when the
    // 5 s ack timer gets to run. Only after that does the queue drain.
    await vi.advanceTimersByTimeAsync(6_000);
    page.pump();
    await Promise.resolve();

    expect(outcome).toBe('pending');
    expect(disconnect).not.toHaveBeenCalled();
    respond(page.requests()[0]!.id, 'xcp_signMessage', 'signature');
    await expect(approval).resolves.toBe('signature');
  });

  it('fails only the requests never acknowledged, never an approval already acknowledged', async () => {
    page.actAsContentScript(request => request.data.method === 'xcp_signPsbt');
    const approval = provider.request({ method: 'xcp_signPsbt', params: [] });
    page.pump();
    const lost = provider.request({ method: 'xcp_requestAccounts' });
    const outcome = expect(lost).rejects.toMatchObject({ code: 4900, data: { reloadRequired: true } });
    await vi.advanceTimersByTimeAsync(5_000);
    page.pump();
    await outcome;

    respond(page.requests()[0]!.id, 'xcp_signPsbt', { hex: 'signed' });
    await expect(approval).resolves.toEqual({ hex: 'signed' });
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

  it('relays the content script\'s reload-required disconnect as a typed event', async () => {
    const disconnect = vi.fn();
    provider.on('disconnect', disconnect);
    const approval = provider.request({ method: 'xcp_requestAccounts' });
    const { id } = page.requests()[0]!;
    ack(id);
    const outcome = expect(approval).rejects.toMatchObject({ code: 4900, data: { reloadRequired: true } });

    // An orphaned content script answers what it holds first, then announces the loss.
    const reload = { code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE, data: { reloadRequired: true } };
    page.deliver({ target: 'xcp-wallet-injected', type: 'XCP_WALLET_RESPONSE', id, error: reload });
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
