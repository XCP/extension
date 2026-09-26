/** Explicit, sender-scoped RPC over reconnectable extension ports. */

import { type HardwareErrorMetadata, parseHardwareErrorMetadata, withHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { HardwareWalletError } from '@/core/hardware/types';
import { isProviderReviewCode, type ProviderReviewCode, providerReviewCode, withProviderReviewCode } from '@/core/providerReviewErrors';
import { EXTENSION_RELOAD_REQUIRED_MESSAGE, EXTENSION_RESTARTED_MESSAGE, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { recordProviderTab } from '@/platform/browser';
import { isContextInvalidatedError, isExtensionContextValid } from '@/platform/extensionContext';
import { decodeProxyResult, encodeProxyResult } from '@/platform/proxySerialization';
import { whenServicesReady } from '@/services/core/serviceReadiness';

type MethodName<T> = Extract<{
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T], string>;

export interface ProxyServicePolicy<T> {
  /** Only these methods are remotely callable. Commands are never automatically replayed. */
  methods: Partial<Record<MethodName<T>, 'read' | 'command'>>;
  /** The page bridge may only call handleRequest; its origin comes from Chrome's sender. */
  contentScript?: 'provider';
}

/** `ack` opts in to a receipt; a caller that never asked (older clients, raw test ports) gets exactly one reply. */
interface PortRequest { id: number; methodName: string; args: unknown[]; ack?: true }
type PortResponse =
  | { id: number; success: true; result: unknown; resultEncoding?: 'xcp-json-v1' }
  | { id: number; success: false; error: { message: string; code?: number; reviewCode?: ProviderReviewCode; hardware?: HardwareErrorMetadata } };

/** The background's "request received", sent before it waits on anything. Not a result. */
interface PortAck { id: number; ack: true }
/**
 * Liveness probe while calls wait on a port. It has no `id`, so no caller can mistake it (or its
 * echo) for a request or an answer, and the background answers it without touching any service.
 */
interface PortHeartbeat { heartbeat: number }
interface PendingCall {
  port: chrome.runtime.Port;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  ackTimer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * How long a posted request may go unacknowledged before its port is presumed dead. The ack leaves
 * the background synchronously on receipt, so this only has to cover a cold service-worker start;
 * it does not bound how long the call itself may take (an approval can take minutes).
 */
export const PORT_ACK_TIMEOUT_MS = 10_000;

/**
 * While any call waits on a port, a heartbeat goes out this often, and a heartbeat still
 * unanswered at the next tick means the worker behind the port is gone (Chrome does not always
 * fire onDisconnect when a service worker is stopped). Heartbeats run only while calls are pending,
 * so they keep the worker awake exactly as long as someone is waiting on it, and no longer.
 */
export const PORT_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * A port with nothing pending and no traffic for this long is replaced rather than reused: an idle
 * worker is stopped after about 30 seconds, and a port to a stopped worker may never report it, so
 * the first call after a pause would otherwise wait out the whole ack timeout.
 */
export const PORT_IDLE_RECONNECT_MS = 20_000;

/** Transport loss, as opposed to a service that deliberately answered with code 4900. */
class PortClosedError extends ProviderError {}

const registeredServices = new Set<string>();
/** One per proxy client: closes its cached port and fails the calls waiting on it. */
const portDroppers = new Set<() => void>();
const PROVIDER_QUERIES = new Set([
  'xcp_accounts', 'xcp_getBalances', 'xcp_getAddresses', 'xcp_chainId', 'xcp_getNetwork',
]);
const MAX_REQUEST_BYTES = 1024 * 1024 + 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRequest(value: unknown): PortRequest | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1
    || typeof value.methodName !== 'string' || value.methodName.length > 100
    || !Array.isArray(value.args) || value.args.length > 16) return null;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_REQUEST_BYTES) return null;
  } catch { return null; }
  return { id: value.id as number, methodName: value.methodName, args: value.args, ...(value.ack === true ? { ack: true } : {}) };
}

function parseResponse(value: unknown): PortResponse | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) return null;
  if (value.success === true) {
    try {
      if (value.resultEncoding !== undefined && value.resultEncoding !== 'xcp-json-v1') {
        throw new Error('Unknown RPC result encoding');
      }
      return { id: value.id as number, success: true, result: value.resultEncoding === 'xcp-json-v1'
        ? decodeProxyResult(value.result) : value.result };
    } catch {
      return { id: value.id as number, success: false, error: { message: 'Invalid RPC result encoding' } };
    }
  }
  if (value.success !== false || !isRecord(value.error) || typeof value.error.message !== 'string') return null;
  return {
    id: value.id as number, success: false,
    error: { message: value.error.message, code: typeof value.error.code === 'number' ? value.error.code : undefined,
      reviewCode: isProviderReviewCode(value.error.reviewCode) ? value.error.reviewCode : undefined,
      hardware: parseHardwareErrorMetadata(value.error.hardware) },
  };
}

/** Extension tabs are trusted UI too; tab presence alone cannot distinguish them from content. */
export function isExtensionPageSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  if (sender?.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const actual = new URL(sender.url);
    const expected = new URL(chrome.runtime.getURL('/'));
    return actual.protocol === expected.protocol && actual.host === expected.host;
  } catch { return false; }
}

function contentOrigin(sender: chrome.runtime.MessageSender | undefined): string | null {
  if (sender?.id !== chrome.runtime.id || !sender.url || sender.frameId !== 0) return null;
  try {
    const url = new URL(sender.url);
    const allowed = url.protocol === 'https:' || (url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
    if (!allowed || (sender.origin !== undefined && sender.origin !== url.origin)) return null;
    return url.origin;
  } catch { return null; }
}

/** Close every cached port and fail its in-flight calls, so the next call reconnects. */
export function disconnectAllPorts(): void {
  for (const drop of portDroppers) drop();
}

const reloadRequired = () => new ProviderError(PROVIDER_ERROR_CODES.DISCONNECTED, EXTENSION_RELOAD_REQUIRED_MESSAGE);
const disconnectedError = () => isExtensionContextValid()
  ? new PortClosedError(PROVIDER_ERROR_CODES.DISCONNECTED, EXTENSION_RESTARTED_MESSAGE)
  : reloadRequired();

export function defineProxyService<T extends object>(
  serviceName: string,
  factory: () => T,
  policy: ProxyServicePolicy<T> = { methods: {} },
): [() => T, () => T] {
  let serviceInstance: T | undefined;
  const portName = `proxy:${serviceName}`;
  const methods = policy.methods as Readonly<Record<string, 'read' | 'command' | undefined>>;
  const canCall = (method: string) => Object.hasOwn(methods, method);
  const canRetry = (method: string, args: unknown[]) => canCall(method) && (
    methods[method] === 'read' || (policy.contentScript === 'provider' && method === 'handleRequest'
      && typeof args[1] === 'string' && PROVIDER_QUERIES.has(args[1]))
  );

  const register = (): T => {
    if (!isBackgroundScript()) throw new Error(`[ProxyService] ${serviceName} can only be registered in the background script`);
    serviceInstance = factory();
    if (registeredServices.has(serviceName)) return serviceInstance;
    registeredServices.add(serviceName);

    chrome.runtime.onConnect.addListener((incoming) => {
      if (incoming.name !== portName) return;
      const trustedUI = isExtensionPageSender(incoming.sender);
      const origin = policy.contentScript === 'provider' ? contentOrigin(incoming.sender) : null;
      if (!trustedUI && !origin) { incoming.disconnect(); return; }
      // The one place the worker learns, from Chrome rather than the page, which tab shows which
      // origin; provider events are addressed with it (see platform/browser.ts).
      const tabId = incoming.sender?.tab?.id;
      if (origin && tabId !== undefined && tabId >= 0) {
        void recordProviderTab(tabId, origin).catch(() => { /* events fall back to not reaching this tab */ });
      }

      let disconnected = false;
      const reply = (response: PortResponse | PortAck | PortHeartbeat) => {
        if (!disconnected) {
          try { incoming.postMessage(response); } catch { /* the requesting document closed */ }
        }
      };
      const dispatch = async (value: unknown): Promise<void> => {
        if (isRecord(value) && !Object.hasOwn(value, 'id') && Number.isSafeInteger(value.heartbeat)) {
          reply({ heartbeat: value.heartbeat as number });
          return;
        }
        const request = parseRequest(value);
        if (!request) {
          if (isRecord(value) && Number.isSafeInteger(value.id)) {
            reply({ id: value.id as number, success: false, error: { message: 'Invalid RPC request', code: -32600 } });
          }
          return;
        }
        const { id, methodName } = request;
        // Receipt, not an answer: lets the caller tell a slow call from a port nobody reads. Only on
        // request, so a caller that treats the first message for its id as the answer is unaffected.
        if (request.ack) reply({ id, ack: true });
        if (!canCall(methodName) || (!trustedUI && methodName !== 'handleRequest')) {
          reply({ id, success: false, error: { message: `Method ${methodName} not found on ${serviceName}` } });
          return;
        }
        let args = request.args;
        if (!trustedUI) {
          // Never forward a claimed page origin or arbitrary service arguments.
          if (typeof args[1] !== 'string' || (args[2] !== undefined && !Array.isArray(args[2]))) {
            reply({ id, success: false, error: { message: 'Invalid provider request', code: -32602 } });
            return;
          }
          args = [origin, args[1], args[2] ?? []];
        }
        try {
          await whenServicesReady();
          if (disconnected) return;
          const method = serviceInstance?.[methodName as keyof T];
          if (typeof method !== 'function') throw new Error(`Method ${methodName} not found on ${serviceName}`);
          const result: unknown = await Reflect.apply(method, serviceInstance, args);
          // Encode before replying: serialization failures are service failures, not closed ports.
          reply({ id, success: true, result: encodeProxyResult(result), resultEncoding: 'xcp-json-v1' });
        } catch (error) {
          reply({ id, success: false, error: {
            message: error instanceof Error ? error.message : 'Service call failed',
            code: error instanceof ProviderError ? error.code : undefined,
            reviewCode: providerReviewCode(error),
            // Device diagnostics are for extension UI, not a new public provider contract.
            hardware: trustedUI && error instanceof HardwareWalletError ? parseHardwareErrorMetadata(error) : undefined,
          } });
        }
      };
      incoming.onMessage.addListener((value: unknown) => {
        void dispatch(value).catch(() => { /* dispatch reports failures; closed ports need no response */ });
      });
      incoming.onDisconnect.addListener(() => {
        disconnected = true;
        if (chrome.runtime.lastError) { /* consumed */ }
      });
    });
    return serviceInstance;
  };

  let port: chrome.runtime.Port | null = null;
  const pendingCalls = new Map<number, PendingCall>();
  let nextId = 0;
  /** Last time the current port carried anything in either direction. */
  let lastTraffic = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatOutstanding = false;
  let heartbeatSeq = 0;

  const hasPendingOn = (target: chrome.runtime.Port) => {
    for (const pending of pendingCalls.values()) if (pending.port === target) return true;
    return false;
  };

  const stopHeartbeat = () => {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    heartbeatOutstanding = false;
  };

  const settle = (id: number): PendingCall | undefined => {
    const pending = pendingCalls.get(id);
    if (!pending) return undefined;
    pendingCalls.delete(id);
    clearTimeout(pending.ackTimer);
    if (port && !hasPendingOn(port)) stopHeartbeat();
    return pending;
  };

  /**
   * Forget a port and fail every call still waiting on it. Also the path for a port *we* close
   * (bfcache, missing ack, missed heartbeat): Chrome fires onDisconnect only on the far end, so a
   * local disconnect() alone would leave those calls pending forever and the dead port cached.
   */
  function dropPort(dead: chrome.runtime.Port, disconnect: boolean): void {
    if (port === dead) {
      port = null;
      stopHeartbeat();
    }
    if (disconnect) {
      try { dead.disconnect(); } catch { /* already disconnected */ }
    }
    for (const [id, pending] of pendingCalls) {
      if (pending.port !== dead) continue;
      settle(id);
      pending.reject(disconnectedError());
    }
  }
  const dropCurrentPort = () => { if (port) dropPort(port, true); };

  /** While calls wait on the port, prove every interval that something still answers on it. */
  function ensureHeartbeat(target: chrome.runtime.Port): void {
    if (heartbeatTimer !== undefined) return;
    heartbeatTimer = setInterval(() => {
      if (port !== target || !hasPendingOn(target)) { stopHeartbeat(); return; }
      if (heartbeatOutstanding) { dropPort(target, true); return; }
      heartbeatOutstanding = true;
      try {
        target.postMessage({ heartbeat: ++heartbeatSeq } satisfies PortHeartbeat);
      } catch {
        dropPort(target, true);
      }
    }, PORT_HEARTBEAT_INTERVAL_MS);
  }

  function ensurePort(): chrome.runtime.Port {
    if (port) {
      if (hasPendingOn(port) || Date.now() - lastTraffic < PORT_IDLE_RECONNECT_MS) return port;
      dropPort(port, true); // idle long enough that its worker may be gone without saying so
    }
    if (!isExtensionContextValid()) throw reloadRequired();
    let connected: chrome.runtime.Port;
    try {
      connected = chrome.runtime.connect({ name: portName });
    } catch (error) {
      throw isContextInvalidatedError(error) || !isExtensionContextValid() ? reloadRequired() : error;
    }
    port = connected;
    lastTraffic = Date.now();
    portDroppers.add(dropCurrentPort);
    connected.onMessage.addListener((value: unknown) => {
      if (port === connected) {
        lastTraffic = Date.now();
        heartbeatOutstanding = false;
      }
      if (!isRecord(value) || !Object.hasOwn(value, 'id')) return; // heartbeat echo, or noise
      if (value.ack === true && Number.isSafeInteger(value.id)) {
        const pending = pendingCalls.get(value.id as number);
        if (pending?.port === connected) {
          clearTimeout(pending.ackTimer);
          pending.ackTimer = undefined;
        }
        return;
      }
      const response = parseResponse(value);
      if (!response) return;
      const pending = pendingCalls.get(response.id);
      if (!pending || pending.port !== connected) return;
      settle(response.id);
      if (response.success) pending.resolve(response.result);
      else {
        const error = typeof response.error.code === 'number'
          ? new ProviderError(response.error.code, response.error.message)
          : new Error(response.error.message);
        if (response.error.hardware) withHardwareErrorMetadata(error, response.error.hardware);
        pending.reject(response.error.reviewCode ? withProviderReviewCode(error, response.error.reviewCode) : error);
      }
    });
    connected.onDisconnect.addListener(() => {
      if (chrome.runtime?.lastError) { /* consumed */ }
      dropPort(connected, false);
    });
    return connected;
  }

  const getService = (): T => {
    if (isBackgroundScript()) {
      if (!serviceInstance) throw new Error(`Failed to get an instance of ${serviceName}: registerService has not been called`);
      return serviceInstance;
    }
    return new Proxy({} as T, {
      get: (_target, prop) => {
        // Service objects are not thenables; inherited/symbol members are not RPC methods.
        if (typeof prop !== 'string' || prop === 'then' || !canCall(prop)) return undefined;
        return async (...args: unknown[]) => {
          for (let attempt = 0; ; attempt++) {
            let connected: chrome.runtime.Port | undefined;
            // Whether the background may have received the request. A request that was never
            // posted can be sent again whatever it does; one that was can only if it is a read.
            let sent = false;
            const id = ++nextId;
            try {
              connected = ensurePort();
              const target = connected;
              return await new Promise<unknown>((resolve, reject) => {
                // No receipt in time means nothing is listening at the other end of an open port.
                const ackTimer = setTimeout(() => dropPort(target, true), PORT_ACK_TIMEOUT_MS);
                pendingCalls.set(id, { port: target, resolve, reject, ackTimer });
                try {
                  target.postMessage({ id, methodName: prop, args, ack: true } satisfies PortRequest);
                  sent = true;
                  lastTraffic = Date.now();
                  ensureHeartbeat(target);
                } catch (error) { settle(id); reject(error); }
              });
            } catch (error) {
              // An orphaned script can never reconnect; say so rather than retrying into it.
              const orphaned = () => !isExtensionContextValid() || isContextInvalidatedError(error)
                || (error instanceof ProviderError && error.message === EXTENSION_RELOAD_REQUIRED_MESSAGE);
              if (orphaned()) throw reloadRequired();
              const message = error instanceof Error ? error.message : '';
              // Only transport loss retries; a service that itself answered 4900 is an ordinary error.
              const isDisconnect = error instanceof PortClosedError
                || message.includes('Attempting to use a disconnected port');
              if (!isDisconnect) throw error;
              if (connected && port === connected) dropPort(connected, true);
              // An extension reload disconnects the port a moment before Chrome clears runtime.id,
              // so look again before calling this a restart that a retry can survive.
              await new Promise(resolve => setTimeout(resolve, 200));
              if (orphaned()) throw reloadRequired();
              if (attempt > 0 || (sent && !canRetry(prop, args))) throw error;
            }
          }
        };
      },
    });
  };
  return [register, getService];
}

export function isBackgroundScript(): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
  if (typeof window === 'undefined') return typeof self !== 'undefined';
  // Firefox's MV2 target runs in a background document. A popup also has a window
  // and extension APIs, so only the actual background page's object identity qualifies.
  try {
    return chrome.extension?.getBackgroundPage?.() === window;
  } catch {
    return false;
  }
}
