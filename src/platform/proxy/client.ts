/**
 * The page half of the service RPC: a typed proxy that forwards calls to the background over a
 * reconnectable port. Used by the popup, side panel and content script; the background half is
 * server.ts, and what both ends agree on is in protocol.ts.
 */

import { parseHardwareErrorMetadata, withHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { isRecord } from '@/core/isRecord';
import { isProviderReviewCode, withProviderReviewCode } from '@/core/providerReviewErrors';
import { EXTENSION_RELOAD_REQUIRED_MESSAGE, EXTENSION_RESTARTED_MESSAGE, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { isContextInvalidatedError, isExtensionContextValid } from '@/platform/extensionContext';
import {
  isBackgroundScript, type PortHeartbeat, type PortRequest, type PortResponse,
  type ProxyServicePolicy, policyMethods, proxyPortName,
} from '@/platform/proxy/protocol';
import { decodeProxyResult } from '@/platform/proxy/serialization';

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

/** One per proxy client: closes its cached port and fails the calls waiting on it. */
const portDroppers = new Set<() => void>();
const PROVIDER_QUERIES = new Set([
  'xcp_accounts', 'xcp_getBalances', 'xcp_getAddresses', 'xcp_chainId', 'xcp_getNetwork',
]);

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

/** Close every cached port and fail its in-flight calls, so the next call reconnects. */
export function disconnectAllPorts(): void {
  for (const drop of portDroppers) drop();
}

const reloadRequired = () => new ProviderError(PROVIDER_ERROR_CODES.DISCONNECTED, EXTENSION_RELOAD_REQUIRED_MESSAGE);
const disconnectedError = () => isExtensionContextValid()
  ? new PortClosedError(PROVIDER_ERROR_CODES.DISCONNECTED, EXTENSION_RESTARTED_MESSAGE)
  : reloadRequired();

/**
 * A page's handle on a background service, built from the name and policy the background registers
 * it under. Only the policy's methods exist on the proxy. The background has no use for it (it
 * holds the real service), so calling it there throws, as a service it never registered would.
 *
 * Defining a client opens nothing (the port waits for the first call), which the annotation tells
 * the bundler: the background imports each service's name and policy from its client module, and
 * this lets it drop the unused client that module also defines.
 */
/* @__NO_SIDE_EFFECTS__ */
export function defineProxyClient<T extends object>(
  serviceName: string,
  policy: ProxyServicePolicy<T> = { methods: {} },
): () => T {
  const portName = proxyPortName(serviceName);
  const methods = policyMethods(policy);
  const canCall = (method: string) => Object.hasOwn(methods, method);
  const canRetry = (method: string, args: unknown[]) => canCall(method) && (
    methods[method] === 'read' || (policy.contentScript === 'provider' && method === 'handleRequest'
      && typeof args[1] === 'string' && PROVIDER_QUERIES.has(args[1]))
  );

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

  // One client and one function per method, so callers holding either (React hooks' dependency
  // lists, effect subscriptions) see a stable identity rather than a fresh one on every read.
  let client: T | undefined;
  const methodCache = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  return (): T => {
    if (isBackgroundScript()) {
      throw new Error(`Failed to get an instance of ${serviceName}: registerService has not been called`);
    }
    client ??= new Proxy({} as T, {
      get: (_target, prop) => {
        // Service objects are not thenables; inherited/symbol members are not RPC methods.
        if (typeof prop !== 'string' || prop === 'then' || !canCall(prop)) return undefined;
        const cached = methodCache.get(prop);
        if (cached) return cached;
        const method = async (...args: unknown[]) => {
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
        methodCache.set(prop, method);
        return method;
      },
    });
    return client;
  };
}
